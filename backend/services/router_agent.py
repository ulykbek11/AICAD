import json
import logging
import re

import google.generativeai as genai

logger = logging.getLogger(__name__)

ROUTER_PROMPT = """
Классифицируй запрос пользователя для выбора движка генерации плана.
Отвечай ТОЛЬКО валидным JSON без markdown и пояснений.

Формат ответа:
{
  "engine": "floorplan_gan" | "constraint_solver",
  "type": "apartment" | "house_1floor" | "house_2floor" | "commercial" | "other",
  "floors": 1 | 2,
  "reason": "одна строка объяснения"
}

Правила выбора движка:
floorplan_gan — если ВСЕ условия выполнены:
  - жилое помещение (квартира, дом, студия, апартаменты)
  - один этаж
  - площадь до 150м² (если указана)
  - стандартные жилые комнаты (спальня, гостиная, кухня, ванная)

constraint_solver — если ЛЮБОЕ из условий:
  - два и более этажа
  - нежилое (офис, кафе, магазин, склад, школа)
  - площадь более 150м²
  - нестандартные помещения
  - не указан тип помещения явно
"""


def classify_request(prompt: str) -> dict:
    """Classify user prompt to select the generation engine."""
    try:
        model = genai.GenerativeModel("gemini-2.5-flash")
        response = model.generate_content(
            f"{ROUTER_PROMPT}\n\nЗапрос пользователя: {prompt}"
        )
        text = response.text.strip()
        text = re.sub(r"```json\s*", "", text)
        text = re.sub(r"```\s*", "", text)
        result = json.loads(text.strip())
        logger.info(f"Router Agent: {result}")
        return result
    except Exception as e:
        logger.warning(f"Router Agent fallback: {e}")
        # Fallback — default to constraint_solver single floor
        return {
            "engine": "constraint_solver",
            "type": "other",
            "floors": 1,
            "reason": f"Fallback из-за ошибки классификации: {str(e)[:80]}",
        }
