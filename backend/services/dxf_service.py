import math
import os
import uuid

import ezdxf

from services.symbol_service import draw_symbols

SCALE = 100.0
WALL_THICKNESS = 15.0


def setup_layers(doc):
    layers = [
        ("Стены", 7, 35),
        ("Двери", 7, 25),
        ("Окна", 7, 25),
        ("Размеры", 1, 13),
        ("Мебель", 7, 18),
        ("Текст", 7, 13),
        ("Штриховка", 7, 9),
    ]
    for name, color, lw in layers:
        if name not in doc.layers:
            doc.layers.add(name, color=color, lineweight=lw)


def draw_wall(msp, x1, y1, x2, y2):
    dx = x2 - x1
    dy = y2 - y1
    length = math.sqrt(dx**2 + dy**2)
    if length == 0:
        return
    nx = -dy / length * WALL_THICKNESS
    ny = dx / length * WALL_THICKNESS
    msp.add_line((x1, y1), (x2, y2), dxfattribs={"layer": "Стены"})
    msp.add_line((x1 + nx, y1 + ny), (x2 + nx, y2 + ny), dxfattribs={"layer": "Стены"})


def draw_door(msp, x, y, width, direction="right"):
    msp.add_line((x, y), (x + width, y), dxfattribs={"layer": "Двери"})
    angle = 90 if direction == "right" else -90
    msp.add_arc(center=(x, y), radius=width, start_angle=0, end_angle=angle, dxfattribs={"layer": "Двери"})


def draw_window(msp, x, y, width):
    for offset in [0, WALL_THICKNESS / 2, WALL_THICKNESS]:
        msp.add_line((x, y + offset), (x + width, y + offset), dxfattribs={"layer": "Окна"})


def draw_dimension(msp, x1, y1, x2, y2, offset=50):
    length = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
    label = f"{length / SCALE * 1000:.0f}"
    msp.add_line((x1, y1 + offset), (x2, y2 + offset), dxfattribs={"layer": "Размеры", "color": 1})
    msp.add_line((x1, y1), (x1, y1 + offset), dxfattribs={"layer": "Размеры", "color": 1})
    msp.add_line((x2, y2), (x2, y2 + offset), dxfattribs={"layer": "Размеры", "color": 1})
    text = msp.add_text(label, dxfattribs={"layer": "Размеры", "height": 15, "color": 1})
    text.set_placement(((x1 + x2) / 2, y1 + offset + 5))


ROOM_LABELS = {
    "living_room": "Гостиная",
    "bedroom": "Спальня",
    "kitchen": "Кухня",
    "bathroom": "Ванная",
    "toilet": "Туалет",
    "hallway": "Коридор",
}


def generate_dxf(rooms_with_symbols: list[dict]) -> tuple[str, str]:
    doc = ezdxf.new(dxfversion="R2010")
    msp = doc.modelspace()
    setup_layers(doc)

    all_x = []
    all_y = []

    for room in rooms_with_symbols:
        x = room["x0"] * SCALE
        y = room["y0"] * SCALE
        w = (room["x1"] - room["x0"]) * SCALE
        h = (room["y1"] - room["y0"]) * SCALE
        all_x.extend([x, x + w])
        all_y.extend([y, y + h])

        draw_wall(msp, x, y, x + w, y)
        draw_wall(msp, x + w, y, x + w, y + h)
        draw_wall(msp, x + w, y + h, x, y + h)
        draw_wall(msp, x, y + h, x, y)

        if room["type"] != "hallway":
            draw_door(msp, x + min(w * 0.2, 30), y, 90)

        if room["type"] in ("living_room", "bedroom", "kitchen"):
            draw_window(msp, x + w * 0.3, y + h - WALL_THICKNESS, w * 0.4)

        label = ROOM_LABELS.get(room["type"], room["type"])
        text = msp.add_text(label, dxfattribs={"layer": "Текст", "height": 18})
        text.set_placement((x + w / 2 - len(label) * 5, y + h / 2))

    if all_x and all_y:
        min_x, max_x = min(all_x), max(all_x)
        min_y, max_y = min(all_y), max(all_y)
        draw_dimension(msp, min_x, max_y, max_x, max_y, offset=60)
        draw_dimension(msp, max_x, min_y, max_x, max_y, offset=60)

    draw_symbols(msp, rooms_with_symbols, scale=SCALE)

    job_id = str(uuid.uuid4())[:8]
    filepath = f"static/downloads/{job_id}.dxf"
    os.makedirs("static/downloads", exist_ok=True)
    doc.saveas(filepath)
    return job_id, filepath
