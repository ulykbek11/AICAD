import math
from models.schemas import RoomWithCoords

ROOM_LABELS = {
    "living_room": "Гостиная",
    "bedroom": "Спальня",
    "kitchen": "Кухня",
    "bathroom": "Ванная",
    "toilet": "Туалет",
    "hallway": "Коридор",
}


def layout_rooms(rooms: list[dict]) -> list[RoomWithCoords]:
    sorted_rooms = sorted(rooms, key=lambda r: -r["area_m2"])

    placed: list[RoomWithCoords] = []
    cursor_x = 0.0
    cursor_y = 0.0
    row_height = 0.0
    max_row_width = math.sqrt(sum(r["area_m2"] for r in rooms)) * 1.5

    for room in sorted_rooms:
        area = room["area_m2"]
        min_w = room.get("min_width", 2.5)

        width = max(min_w, math.sqrt(area * 1.3))
        height = area / width

        if cursor_x + width > max_row_width and cursor_x > 0:
            cursor_x = 0.0
            cursor_y += row_height + 0.15
            row_height = 0.0

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

    return placed
