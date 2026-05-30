"""
Topology Agent — Functional Zones grouper.
Groups rooms into functional zones (social, private, service)
and passes them to the layout algorithm.
"""

import logging
from typing import Any

logger = logging.getLogger(__name__)

# Pairs that must NEVER share a wall
FORBIDDEN_PAIRS: set[tuple[str, str]] = {
    ("kitchen",     "bathroom"),
    ("kitchen",     "toilet"),
    ("bedroom",     "kitchen"),
    ("living_room", "bathroom"),
    ("living_room", "toilet"),
}

WET_TYPES: set[str] = {"kitchen", "bathroom", "bathroom_2", "toilet"}

def generate_topology(rooms: list[dict | Any]) -> dict:
    """
    Group rooms into functional zones for Squarified Treemap layout.
    """
    room_list = []
    for r in rooms:
        if isinstance(r, dict):
            room_list.append(r)
        else:
            room_list.append({"id": r.id, "type": r.type, "area_m2": getattr(r, "area_m2", 10)})

    social = []
    private = []
    service = []
    hallway = []
    
    for r in room_list:
        rt = r["type"]
        rid = r["id"]
        if rt in ("living_room", "dining_room", "balcony"):
            social.append(rid)
        elif rt in ("bedroom", "bedroom_2", "bedroom_3", "office"):
            private.append(rid)
        elif rt in ("kitchen", "bathroom", "bathroom_2", "toilet", "garage"):
            service.append(rid)
        elif rt == "hallway":
            hallway.append(rid)
        else:
            social.append(rid) # fallback
            
    wet_zone = [r["id"] for r in room_list if r["type"] in WET_TYPES]
    
    topology = {
        "anchor": room_list[0]["id"] if room_list else "",
        "adjacency": [],
        "forbidden": [],
        "wet_zone": wet_zone,
        "zones": {
            "social": social,
            "private": private,
            "service": service,
            "hallway": hallway
        }
    }

    logger.info(f"Topology built: zones={topology['zones']}")
    return topology
