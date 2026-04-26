import json
import logging
import re
from services.llm_service import _build_model

logger = logging.getLogger(__name__)

TOPOLOGY_PROMPT = """
Распредели комнаты по зонам. Отвечай ТОЛЬКО JSON.

ЗОНЫ (обязательно использовать все подходящие):
- entrance: коридор, прихожая, холл (hallway)
- day: гостиная (living_room), столовая (dining_room)
- night: спальня (bedroom), кабинет (office), детская
- service: кухня (kitchen), ванная (bathroom), туалет (toilet)

ПОЗИЦИИ ЗОН (каждая зона получает РАЗНУЮ позицию):
- entrance → center_bottom
- day      → left
- night    → top_right
- service  → top_left

ПРАВИЛА СМЕЖНОСТИ:
- коридор соединяется со всеми зонами
- ванная примыкает к спальне
- кухня примыкает к гостиной

Список комнат:
{rooms_json}

Ответь строго в этом формате, все комнаты должны
попасть в зоны, НЕЛЬЗЯ класть все в одну зону:
{
  "entry_side": "bottom",
  "zones": {
    "entrance": ["id комнат типа hallway"],
    "day":      ["id комнат типа living_room"],
    "night":    ["id комнат типа bedroom"],
    "service":  ["id комнат типа kitchen, bathroom, toilet"]
  },
  "zone_positions": {
    "entrance": "center_bottom",
    "day":      "left",
    "night":    "top_right",
    "service":  "top_left"
  },
  "adjacency": [
    ["hallway_id", "living_room_id"],
    ["hallway_id", "bedroom_id"],
    ["bedroom_id", "bathroom_id"],
    ["living_room_id", "kitchen_id"]
  ]
}

ВАЖНО: если зона пустая (нет подходящих комнат)
— не включай её в JSON вообще.
"""

def generate_topology(rooms: list) -> dict:
    try:
        model = _build_model("gemini-2.5-flash")
        prompt = TOPOLOGY_PROMPT.format(rooms_json=json.dumps(rooms, ensure_ascii=False))
        
        response = model.generate_content(prompt, request_options={"timeout": 60})
        text = (response.text or "").strip()
        
        text = re.sub(r"```json\s*", "", text)
        text = re.sub(r"```\s*", "", text)
        text = text.strip()
        
        data = json.loads(text)
        
        total_rooms = sum(len(v) for v in data["zones"].values())
        zones_used = len([z for z in data["zones"] if data["zones"][z]])
        if zones_used < 2 and total_rooms > 2:
            raise ValueError(
                f"Topology agent вернул только одну зону. "
                f"Ответ Gemini: {text}"
            )
            
        return data
    except Exception as e:
        logger.error(f"Ошибка в topology_agent: {e}")
        # Детерминированный fallback — распределяем по типу комнат,
        # а не кладём все в одну зону (что приводит к "комнаты в ряд").
        TYPE_TO_ZONE = {
            "hallway": "entrance",
            "living_room": "day", "dining_room": "day", "balcony": "day",
            "bedroom": "night", "bedroom_2": "night", "bedroom_3": "night",
            "office": "night",
            "kitchen": "service", "bathroom": "service", "bathroom_2": "service",
            "toilet": "service", "garage": "service",
        }
        ZONE_POS = {
            "entrance": "center_bottom",
            "day": "left",
            "night": "top_right",
            "service": "top_left",
        }
        zone_map: dict[str, list[str]] = {
            "entrance": [], "day": [], "night": [], "service": []
        }
        for r in rooms:
            rid = r["id"] if isinstance(r, dict) else r.id
            rtype = r["type"] if isinstance(r, dict) else r.type
            zone = TYPE_TO_ZONE.get(rtype, "day")
            zone_map[zone].append(rid)

        # Убираем пустые зоны
        zones = {k: v for k, v in zone_map.items() if v}
        return {
            "entry_side": "bottom",
            "zones": zones,
            "zone_positions": {z: ZONE_POS[z] for z in zones},
            "adjacency": []
        }
