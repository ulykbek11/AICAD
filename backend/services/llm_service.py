import json
import logging
import os
import pickle
import re
from typing import Literal

from dotenv import load_dotenv
load_dotenv()

import google.generativeai as genai

api_key = os.getenv("GOOGLE_API_KEY")
if not api_key:
    raise ValueError("GOOGLE_API_KEY не найден в .env файле")

genai.configure(api_key=api_key)

logger = logging.getLogger(__name__)

def _build_model(model_name: str = "gemini-2.5-flash"):
    return genai.GenerativeModel(model_name)

SYSTEM_PROMPT = """
Ты CAD-ассистент для генерации планов квартир и домов.
Понимай запрос пользователя на русском ИЛИ английском языке.
Отвечай ТОЛЬКО валидным JSON без markdown, без пояснений, без блоков кода.
Только чистый JSON объект.

Формат ответа (выбери ОДИН из двух вариантов):

ВАРИАНТ 1 (Если информации недостаточно, например, не указана этажность, примерная площадь или состав комнат):
{
  "question": "Ваш уточняющий вопрос пользователю (например: Сколько этажей планируется? Какая примерная площадь?)"
}

ВАРИАНТ 2 (Если информации достаточно):
{
  "rooms": [
    {
      "id": "r1",
      "type": "living_room",
      "area_m2": 20,
      "min_width": 3.5,
      "adjacent_to": ["r2", "r3"]
    }
  ],
  "total_area_m2": 60,
  "shape": "rectangular"
}

Типы комнат:
- living_room, dining_room, kitchen
- bedroom, bedroom_2, bedroom_3, office, study, guest_room
- bathroom, bathroom_2, toilet, guest_wc
- hallway, tambour, boiler_room
- garage, balcony

Формы дома (shape): rectangular, l, u, t. Выбирай подходящую на основе параметров запроса.
Площади должны суммироваться в total_area_m2.
Каждая комната должна иметь уникальный id (r1, r2, r3...).

ПРАВИЛА КЛАССИФИКАЦИИ КОМНАТ (обязательно соблюдать): 
 
1. ЗОНЫ: 
   - Гостиная, столовая, прихожая → зона PUBLIC (1-й этаж, рядом с входом) 
   - Кухня, гостевой санузел, гараж, кладовая → зона SERVICE (1-й этаж, боковые стены) 
   - Спальни, личные санузлы, гардероб → зона PRIVATE (2-й этаж если >1 этаж) 
 
2. ПАРСИНГ КОМБИНИРОВАННЫХ ПОМЕЩЕНИЙ: 
   - "кухня-гостиная" → ДВЕ отдельные комнаты: kitchen + living_room, adjacent_to 
   - "кухня-столовая" → kitchen + dining_room, adjacent_to 
   - "совмещённый санузел" → bathroom (не разделять) 
   - "санузел у входа" → bathroom_guest 
 
3. ЭТАЖНОСТЬ: 
   - Если num_floors > 1 И есть спальни → спальни ВСЕГДА на этаже 2+ 
   - Лестницу НЕ перечислять в rooms — алгоритм добавит автоматически 
   - Коридоры НЕ перечислять — алгоритм добавит автоматически 
 
4. ЗАПРЕЩЁННЫЕ СМЕЖНОСТИ (укажи adjacent_to пустой для этих пар): 
   - kitchen ↔ bathroom (любой тип) 
   - bedroom ↔ kitchen 
   - dining_room ↔ bathroom 
   - living_room ↔ bathroom 
 
5. ПЛОЩАДИ (ориентировочные если не указаны): 
   - living_room: 20 кв.м, dining_room: 12 кв.м, kitchen: 10 кв.м 
   - bedroom: 12 кв.м, master_bedroom: 18 кв.м, bathroom: 5 кв.м 
   - bathroom_guest: 3.5 кв.м, entrance: 4 кв.м, garage: 18 кв.м 
"""

NON_CAD_HINTS = {
    "привет",
    "здравствуй",
    "hello",
    "hi",
    "как дела",
    "кто ты",
    "что ты умеешь",
    "спасибо",
}


Intent = Literal["generate", "chat", "offtopic"]


def is_cad_prompt(prompt: str) -> bool:
    text = (prompt or "").strip().lower()
    if not text:
        return False

    # Быстрый фильтр для типичных приветствий и small-talk.
    if text in NON_CAD_HINTS:
        return False

    cad_keywords = (
        "план",
        "график",
        "граф",
        "схем",
        "построй",
        "постро",
        "сгенер",
        "чертеж",
        "чертёж",
        "комнат",
        "квар",
        "дом",
        "bathroom",
        "bedroom",
        "kitchen",
        "living",
        "room",
        "layout",
    )
    return any(k in text for k in cad_keywords)


def detect_intent(prompt: str) -> Intent:
    text = (prompt or "").strip().lower()
    if not text:
        return "offtopic"

    if text in NON_CAD_HINTS:
        return "chat"

    generate_keywords = [
        "сгенерируй", "создай", "нарисуй", "построй", "сделай план",
        "сделай чертеж", "чертеж", "чертёж", "план", "схему",
        "generate", "create", "draw", "build", "make a plan", "make plan",
        "floor plan", "layout", "blueprint", "room plan", "house plan", "apartment plan"
    ]
    
    # If the user explicitly asks to generate/create a plan/drawing
    is_generate = False
    for keyword in generate_keywords:
        if keyword in text:
            is_generate = True
            break
            
    if is_generate:
        return "generate"

    room_plan_hints = [
        "bedroom", "bathroom", "kitchen", "living room", "hallway", "toilet",
        "office", "garage", "apartment", "house", "rooms",
        "спальня", "ванная", "кухня", "гостиная", "коридор", "туалет",
        "квартира", "дом", "комнат"
    ]
    if any(k in text for k in room_plan_hints):
        return "generate"

    project_keywords = [
        "aicad", "cad", "dxf", "svg", "слой", "команда", "инструмент",
        "как", "почему", "зачем", "алгоритм", "проект",
        "layer", "tool", "command", "how", "why", "pipeline", "algorithm"
    ]
    if any(k in text for k in project_keywords):
        return "chat"
        
    return "chat" # Default to chat to keep conversation flowing, unless it's completely gibberish


def answer_project_chat(prompt: str) -> str:
    model = _build_model("gemini-2.5-flash")
    chat_prompt = (
        "Ты ассистент проекта AICAD. Отвечай кратко и по теме проекта: "
        "генерация CAD-планов, DXF/SVG, слои, инструменты, команды, пайплайн. "
        "Если вопрос не по теме, вежливо верни к теме проекта.\n\n"
        f"Вопрос: {prompt}"
    )
    try:
        response = model.generate_content(chat_prompt, request_options={"timeout": 60})
        text = (response.text or "").strip()
        return text or "Я могу помочь по AICAD: генерация планов, DXF/SVG, слои и инструменты."
    except Exception as e:
        logger.error(f"Ошибка LLM: {e}")
        return "Я могу помочь по AICAD: генерация планов, DXF/SVG, слои и инструменты."


def generate_room_graph(prompt: str) -> dict:
    text = ""
    try:
        model = _build_model("gemini-2.5-flash")
        response = model.generate_content(f"{SYSTEM_PROMPT}\n\nЗапрос пользователя: {prompt}", request_options={"timeout": 60})

        text = (response.text or "").strip()
        logger.debug(f"Сырой ответ Gemini: {text}")

        # Убираем markdown-обертки, если модель их добавила.
        text = re.sub(r"```json\s*", "", text)
        text = re.sub(r"```\s*", "", text)
        text = text.strip()

        if not text:
            raise ValueError("Gemini вернул пустой ответ")

        data = json.loads(text)

        # Минимальная валидация структуры ответа.
        if "question" in data:
            return data
            
        if "rooms" not in data:
            raise ValueError(f"Нет поля rooms (и нет question) в ответе: {data}")
        if not data["rooms"]:
            raise ValueError("Пустой список комнат")

        return data
    except json.JSONDecodeError as e:
        logger.error(f"Gemini вернул не JSON: {text}")
        raise ValueError(f"Ошибка парсинга JSON: {str(e)}") from e
    except Exception as e:
        logger.error(f"Ошибка LLM: {str(e)}")
        raise


def generate_room_graph_pkl(prompt: str) -> bytes:
    """
    Шаг 1 (LLM Gemini): возвращает room graph в формате PKL,
    чтобы следующий этап мог работать без JSON-конвертаций.
    """
    room_graph = generate_room_graph(prompt)
    return pickle.dumps(room_graph, protocol=pickle.HIGHEST_PROTOCOL)
