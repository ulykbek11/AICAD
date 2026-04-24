import math
import os
import uuid

import ezdxf
from ezdxf.enums import TextEntityAlignment

from services.symbol_service import draw_symbols

SCALE = 100.0
WALL_THICKNESS = 20.0

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

def draw_door(msp, x, y, width, wall="bottom"):
    if wall == "bottom":
        msp.add_line((x, y), (x + width, y), dxfattribs={"layer": "Двери"})
        msp.add_arc(center=(x, y), radius=width, start_angle=0, end_angle=90, dxfattribs={"layer": "Двери"})
    elif wall == "top":
        msp.add_line((x, y), (x + width, y), dxfattribs={"layer": "Двери"})
        msp.add_arc(center=(x, y), radius=width, start_angle=270, end_angle=360, dxfattribs={"layer": "Двери"})
    elif wall == "left":
        msp.add_line((x, y), (x, y + width), dxfattribs={"layer": "Двери"})
        msp.add_arc(center=(x, y), radius=width, start_angle=0, end_angle=90, dxfattribs={"layer": "Двери"})
    elif wall == "right":
        msp.add_line((x, y), (x, y + width), dxfattribs={"layer": "Двери"})
        msp.add_arc(center=(x, y), radius=width, start_angle=90, end_angle=180, dxfattribs={"layer": "Двери"})

def draw_window(msp, x, y, width):
    for offset in [0, WALL_THICKNESS / 2, WALL_THICKNESS]:
        msp.add_line((x, y + offset), (x + width, y + offset), dxfattribs={"layer": "Окна"})


def draw_dimension(msp, x1, y1, x2, y2, offset=80):
    length = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
    label = f"{length / SCALE:.1f} м"
    
    if abs(x2 - x1) > abs(y2 - y1):
        # Horizontal
        msp.add_line((x1, y1 + offset), (x2, y2 + offset), dxfattribs={"layer": "Размеры", "color": 1})
        msp.add_line((x1, y1), (x1, y1 + offset), dxfattribs={"layer": "Размеры", "color": 1})
        msp.add_line((x2, y2), (x2, y2 + offset), dxfattribs={"layer": "Размеры", "color": 1})
        text = msp.add_text(label, dxfattribs={"layer": "Размеры", "height": 15, "color": 1})
        text.set_placement(
            ((x1 + x2) / 2, y1 + offset + 5),
            align=TextEntityAlignment.BOTTOM_CENTER,
        )
    else:
        # Vertical
        msp.add_line((x1 + offset, y1), (x2 + offset, y2), dxfattribs={"layer": "Размеры", "color": 1})
        msp.add_line((x1, y1), (x1 + offset, y1), dxfattribs={"layer": "Размеры", "color": 1})
        msp.add_line((x2, y2), (x2 + offset, y2), dxfattribs={"layer": "Размеры", "color": 1})
        text = msp.add_text(label, dxfattribs={"layer": "Размеры", "height": 15, "color": 1})
        text.set_placement(
            (x1 + offset + 5, (y1 + y2) / 2),
            align=TextEntityAlignment.MIDDLE_LEFT,
        )


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

    if rooms_with_symbols:
        all_cx = [r["x0"] + (r["x1"] - r["x0"])/2 for r in rooms_with_symbols]
        all_cy = [r["y0"] + (r["y1"] - r["y0"])/2 for r in rooms_with_symbols]
        plan_cx = sum(all_cx) / len(all_cx)
        plan_cy = sum(all_cy) / len(all_cy)
    else:
        plan_cx, plan_cy = 0, 0

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
            door_w = 70 if room["type"] in ("bathroom", "toilet") else 90
            
            target_room = None
            adj = room.get("adjacent_to", [])
            if adj:
                for r in rooms_with_symbols:
                    if r.get("id") in adj:
                        target_room = r
                        break
            if not target_room:
                for r in rooms_with_symbols:
                    if r["type"] == "hallway":
                        target_room = r
                        break

            room_cx = room["x0"] + (room["x1"] - room["x0"]) / 2
            room_cy = room["y0"] + (room["y1"] - room["y0"]) / 2

            if target_room:
                tx = target_room["x0"] + (target_room["x1"] - target_room["x0"]) / 2
                ty = target_room["y0"] + (target_room["y1"] - target_room["y0"]) / 2
            else:
                tx, ty = plan_cx, plan_cy

            dx = tx - room_cx
            dy = ty - room_cy

            if abs(dx) > abs(dy):
                wall = "right" if dx > 0 else "left"
            else:
                wall = "top" if dy > 0 else "bottom"

            if wall == "bottom":
                door_x = x + w / 2 - door_w / 2
                door_y = y
            elif wall == "top":
                door_x = x + w / 2 - door_w / 2
                door_y = y + h
            elif wall == "left":
                door_x = x
                door_y = y + h / 2 - door_w / 2
            else:
                door_x = x + w
                door_y = y + h / 2 - door_w / 2

            draw_door(msp, door_x, door_y, door_w, wall=wall)

        if room["type"] in ("living_room", "bedroom", "kitchen"):
            draw_window(msp, x + w * 0.3, y + h - WALL_THICKNESS, w * 0.4)

        label = ROOM_LABELS.get(room["type"], room["type"])
        text = msp.add_text(label, dxfattribs={"layer": "Текст", "height": 20})
        text.set_placement(
            (x + w / 2, y + h / 2),
            align=TextEntityAlignment.MIDDLE_CENTER,
        )

    if all_x and all_y:
        min_x, max_x = min(all_x), max(all_x)
        min_y, max_y = min(all_y), max(all_y)
        draw_dimension(msp, min_x, max_y, max_x, max_y, offset=80)
        draw_dimension(msp, max_x, min_y, max_x, max_y, offset=80)

    draw_symbols(msp, rooms_with_symbols, scale=SCALE)

    job_id = str(uuid.uuid4())[:8]
    filepath = f"static/downloads/{job_id}.dxf"
    os.makedirs("static/downloads", exist_ok=True)
    doc.saveas(filepath)
    return job_id, filepath
