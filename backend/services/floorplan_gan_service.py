import math
import pickle


def generate_room_bboxes(room_graph_pkl: bytes) -> list[dict]:
    """
    Шаг 2 (FloorplanGAN):
    Принимает room graph в PKL и возвращает bounding boxes комнат.
    """
    room_graph = pickle.loads(room_graph_pkl)
    rooms = room_graph.get("rooms", [])
    sorted_rooms = sorted(rooms, key=lambda r: -r["area_m2"])

    bboxes: list[dict] = []
    cursor_x = 0.0
    cursor_y = 0.0
    row_height = 0.0
    max_row_width = math.sqrt(sum(r["area_m2"] for r in rooms)) * 1.5 if rooms else 0.0

    for room in sorted_rooms:
        area = float(room["area_m2"])
        min_w = float(room.get("min_width", 2.5))
        width = max(min_w, math.sqrt(area * 1.3))
        height = area / width if width else 0.0

        if cursor_x + width > max_row_width and cursor_x > 0:
            cursor_x = 0.0
            cursor_y += row_height + 0.15
            row_height = 0.0

        x0 = round(cursor_x, 3)
        y0 = round(cursor_y, 3)
        x1 = round(cursor_x + width, 3)
        y1 = round(cursor_y + height, 3)

        bboxes.append(
            {
                "id": room["id"],
                "type": room["type"],
                "x0": x0,
                "y0": y0,
                "x1": x1,
                "y1": y1,
            }
        )

        cursor_x += width + 0.15
        row_height = max(row_height, height)

    return bboxes
