import json
import os
import pickle
import re
from typing import Literal

import google.generativeai as genai


def _get_api_key() -> str:
    # Поддерживаем оба названия переменной для совместимости.
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError(
            "Не найден API ключ Gemini. Укажите GEMINI_API_KEY или GOOGLE_API_KEY в backend/.env"
        )
    return api_key


def _build_model(model_name: str = "gemini-2.5-flash"):
    genai.configure(api_key=_get_api_key())
    return genai.GenerativeModel(model_name)

SYSTEM_PROMPT = """
Ты CAD-ассистент для генерации планов квартир.
Отвечай ТОЛЬКО валидным JSON без markdown, без пояснений, без блоков кода.
Только чистый JSON объект.

Формат ответа:
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

Типы комнат: living_room, bedroom, kitchen, bathroom, toilet, hallway
Площади должны суммироваться в total_area_m2.
Каждая комната должна иметь уникальный id (r1, r2, r3...).
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

    if is_cad_prompt(text):
        return "generate"

    project_keywords = (
        "aicad",
        "cad",
        "dxf",
        "svg",
        "слой",
        "команда",
        "инструмент",
        "чертеж",
        "чертёж",
        "план",
    )
    if any(k in text for k in project_keywords) or text in NON_CAD_HINTS:
        return "chat"
    return "offtopic"


def answer_project_chat(prompt: str) -> str:
    model = _build_model("gemini-2.5-flash")
    chat_prompt = (
        "Ты ассистент проекта AICAD. Отвечай кратко и по теме проекта: "
        "генерация CAD-планов, DXF/SVG, слои, инструменты, команды, пайплайн. "
        "Если вопрос не по теме, вежливо верни к теме проекта.\n\n"
        f"Вопрос: {prompt}"
    )
    try:
        response = model.generate_content(chat_prompt)
        text = (response.text or "").strip()
        return text or "Я могу помочь по AICAD: генерация планов, DXF/SVG, слои и инструменты."
    except Exception:
        return "Я могу помочь по AICAD: генерация планов, DXF/SVG, слои и инструменты."


def generate_room_graph(prompt: str) -> dict:
    model = _build_model("gemini-2.5-flash")
    response = model.generate_content(f"{SYSTEM_PROMPT}\n\nЗапрос пользователя: {prompt}")
    text = (response.text or "").strip()

    text = re.sub(r"```json\s*", "", text)
    text = re.sub(r"```\s*", "", text)
    text = text.strip()

    if not text:
        raise ValueError("Gemini вернул пустой ответ")
    return json.loads(text)


def generate_room_graph_pkl(prompt: str) -> bytes:
    """
    Шаг 1 (LLM Gemini): возвращает room graph в формате PKL,
    чтобы следующий этап мог работать без JSON-конвертаций.
    """
    room_graph = generate_room_graph(prompt)
    return pickle.dumps(room_graph, protocol=pickle.HIGHEST_PROTOCOL)
