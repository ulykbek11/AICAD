import json
import os
import re

import google.generativeai as genai

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

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


def generate_room_graph(prompt: str) -> dict:
    model = genai.GenerativeModel("gemini-1.5-flash")
    response = model.generate_content(f"{SYSTEM_PROMPT}\n\nЗапрос пользователя: {prompt}")
    text = (response.text or "").strip()

    text = re.sub(r"```json\s*", "", text)
    text = re.sub(r"```\s*", "", text)
    text = text.strip()

    if not text:
        raise ValueError("Gemini вернул пустой ответ")
    return json.loads(text)
