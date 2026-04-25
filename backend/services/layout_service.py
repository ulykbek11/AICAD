import math
from models.schemas import RoomWithCoords

ROOM_LABELS = {
    "living_room": "Гостиная",
    "bedroom": "Спальня",
    "bedroom_2": "Спальня 2",
    "bedroom_3": "Спальня 3",
    "kitchen": "Кухня",
    "bathroom": "Ванная",
    "bathroom_2": "Ванная 2",
    "toilet": "Туалет",
    "hallway": "Коридор",
    "garage": "Гараж",
    "dining_room": "Столовая",
    "office": "Кабинет",
    "balcony": "Балкон",
}


ROOM_PRIORITY = {
    "hallway": 0,
    "living_room": 1,
    "kitchen": 2,
    "dining_room": 3,
    "bedroom": 4,
    "bedroom_2": 5,
    "bedroom_3": 6,
    "bathroom": 7,
    "bathroom_2": 8,
    "toilet": 9,
    "office": 10,
    "garage": 11,
    "balcony": 12,
}

def layout_rooms(rooms: list[dict]) -> list[RoomWithCoords]:
    sorted_rooms = sorted(rooms, key=lambda r: ROOM_PRIORITY.get(r["type"], 20))

    placed: list[RoomWithCoords] = []
    cursor_x = 0.0
    cursor_y = 0.0
    row_height = 0.0
    
    total_area = sum(r["area_m2"] for r in rooms)
    max_row_width = math.sqrt(total_area) * 1.2 if total_area > 0 else 10.0
    
    rooms_in_row = 0

    for room in sorted_rooms:
        area = room["area_m2"]
        min_w = room.get("min_width", 2.5)

        width = max(min_w, math.sqrt(area * 1.3))
        height = area / width

        if rooms_in_row >= 3 or (cursor_x + width > max_row_width and cursor_x > 0):
            cursor_x = 0.0
            cursor_y += row_height + 0.15
            row_height = 0.0
            rooms_in_row = 0

        placed.append(
            RoomWithCoords(
                id=room["id"],
                type=room["type"],
                x=round(cursor_x, 3),
                y=round(cursor_y, 3),
                width=round(width, 3),
                height=round(height, 3),
                label=ROOM_LABELS.get(room["type"], room["type"]),
            )
        )

        cursor_x += width + 0.15
        row_height = max(row_height, height)
        rooms_in_row += 1

    return placed


# ═══════════════════════════════════════════════════════
# Two-floor layout
# ═══════════════════════════════════════════════════════

FLOOR1_TYPES = ["living_room", "kitchen", "bathroom",
                "hallway", "garage", "dining_room"]
FLOOR2_TYPES = ["bedroom", "bedroom_2", "bedroom_3",
                "bathroom_2", "office", "toilet", "balcony"]


def layout_two_floors(rooms: list[dict]) -> list[RoomWithCoords]:
    """Split rooms into two floors, lay out each, offset floor 2 to the right."""
    floor1 = [r for r in rooms if r["type"] in FLOOR1_TYPES]
    floor2 = [r for r in rooms if r["type"] in FLOOR2_TYPES]

    # Unassigned rooms go to floor 1
    assigned = set(FLOOR1_TYPES + FLOOR2_TYPES)
    for r in rooms:
        if r["type"] not in assigned:
            floor1.append(r)

    plan1 = layout_rooms(floor1) if floor1 else []
    plan2 = layout_rooms(floor2) if floor2 else []

    # Shift floor 2 to the right of floor 1
    max_x = max((r.x + r.width) for r in plan1) if plan1 else 0
    GAP = 2.0  # gap between floors

    for room in plan2:
        room.x += max_x + GAP

    # Add floor prefixes to labels
    for room in plan1:
        room.label = f"1эт: {room.label}"
    for room in plan2:
        room.label = f"2эт: {room.label}"

    return plan1 + plan2
