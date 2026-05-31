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


# ═══════════════════════════════════════════════════════
# Helper functions for geometric door and window placement in DXF
# ═══════════════════════════════════════════════════════

def find_door_position(room: dict, target_room: dict, door_w_m: float) -> tuple[float, float, str] | None:
    # Coords in meters
    x0, y0, x1, y1 = room["x0"], room["y0"], room["x1"], room["y1"]
    tx0, ty0, tx1, ty1 = target_room["x0"], target_room["y0"], target_room["x1"], target_room["y1"]
    
    tol = 0.05
    # Check vertical shared wall
    # 1. Target is to the left of room (room's left wall touches target's right wall)
    if abs(x0 - tx1) < tol:
        y_start = max(y0, ty0)
        y_end = min(y1, ty1)
        if y_end - y_start >= door_w_m:
            door_y = (y_start + y_end) / 2 - door_w_m / 2
            return x0, door_y, "left"
            
    # 2. Target is to the right of room (room's right wall touches target's left wall)
    elif abs(x1 - tx0) < tol:
        y_start = max(y0, ty0)
        y_end = min(y1, ty1)
        if y_end - y_start >= door_w_m:
            door_y = (y_start + y_end) / 2 - door_w_m / 2
            return x1, door_y, "right"
            
    # Check horizontal shared wall
    # 3. Target is below room (room's bottom wall touches target's top wall)
    if abs(y0 - ty1) < tol:
        x_start = max(x0, tx0)
        x_end = min(x1, tx1)
        if x_end - x_start >= door_w_m:
            door_x = (x_start + x_end) / 2 - door_w_m / 2
            return door_x, y0, "bottom"
            
    # 4. Target is above room (room's top wall touches target's bottom wall)
    elif abs(y1 - ty0) < tol:
        x_start = max(x0, tx0)
        x_end = min(x1, tx1)
        if x_end - x_start >= door_w_m:
            door_x = (x_start + x_end) / 2 - door_w_m / 2
            return door_x, y1, "top"
            
    return None

def get_external_walls(room: dict, rooms: list[dict]) -> list[str]:
    # Coords in meters
    x0, y0, x1, y1 = room["x0"], room["y0"], room["x1"], room["y1"]
    
    external = ["top", "bottom", "left", "right"]
    tol = 0.05
    
    for r in rooms:
        if r["id"] == room["id"]: continue
        rx0, ry0, rx1, ry1 = r["x0"], r["y0"], r["x1"], r["y1"]
        
        # Check if r blocks A's top wall
        if abs(ry1 - y0) < tol:
            x_overlap = min(x1, rx1) - max(x0, rx0)
            if x_overlap > 0.1:
                if "top" in external: external.remove("top")
                
        # Check B's top touches A's bottom
        if abs(ry0 - y1) < tol:
            x_overlap = min(x1, rx1) - max(x0, rx0)
            if x_overlap > 0.1:
                if "bottom" in external: external.remove("bottom")
                
        # Check B's right touches A's left
        if abs(rx1 - x0) < tol:
            y_overlap = min(y1, ry1) - max(y0, ry0)
            if y_overlap > 0.1:
                if "left" in external: external.remove("left")
                
        # Check B's left touches A's right
        if abs(rx0 - x1) < tol:
            y_overlap = min(y1, ry1) - max(y0, ry0)
            if y_overlap > 0.1:
                if "right" in external: external.remove("right")
                
    return external

def draw_window_oriented(msp, x, y, size, orientation="horizontal"):
    if orientation == "horizontal":
        for offset in [0, WALL_THICKNESS / 2, WALL_THICKNESS]:
            msp.add_line((x, y + offset), (x + size, y + offset), dxfattribs={"layer": "Окна"})
    else:
        for offset in [0, WALL_THICKNESS / 2, WALL_THICKNESS]:
            msp.add_line((x + offset, y), (x + offset, y + size), dxfattribs={"layer": "Окна"})

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
    "boiler_room": "Котельная",
    "tambour": "Тамбур",
    "guest_room": "Гостевая",
    "study": "Кабинет",
    "guest_wc": "Гостевой санузел",
}

def generate_dxf(rooms_with_symbols: list[dict]) -> tuple[str, str]:
    doc = ezdxf.new(dxfversion="R2010")
    msp = doc.modelspace()
    setup_layers(doc)

    all_x = []
    all_y = []

    # Находим общие габариты для позиционирования входа
    hallway_rooms = [r for r in rooms_with_symbols if r["type"] == "hallway"]
    
    # Определяем, есть ли U-образная форма
    is_u_shape = False
    if hallway_rooms:
        hall_w = max(r["x1"] - r["x0"] for r in hallway_rooms)
        if hall_w >= 15.0:
            is_u_shape = True

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

        # ── Doors ──
        if room["type"] != "hallway" and room["type"] != "balcony":
            door_w_m = 0.7 if room["type"] in ("bathroom", "toilet", "bathroom_2") else 0.9
            door_w = door_w_m * SCALE
            
            placed_door = None
            adj_ids = room.get("adjacent_to", [])
            
            # 1. Сначала ищем смежность с коридором
            for r in rooms_with_symbols:
                if r["id"] in adj_ids and r["type"] == "hallway":
                    res = find_door_position(room, r, door_w_m)
                    if res:
                        placed_door = res
                        break
            
            # 2. Если нет, ищем смежность с любой комнатой из adjacent_to
            if not placed_door:
                for r in rooms_with_symbols:
                    if r["id"] in adj_ids and r["id"] != room["id"]:
                        res = find_door_position(room, r, door_w_m)
                        if res:
                            placed_door = res
                            break
                            
            # 3. Если нет, ищем любой коридор в доме
            if not placed_door:
                for r in rooms_with_symbols:
                    if r["type"] == "hallway":
                        res = find_door_position(room, r, door_w_m)
                        if res:
                            placed_door = res
                            break
                            
            # 4. Если нет, ищем любую комнату
            if not placed_door:
                for r in rooms_with_symbols:
                    if r["id"] != room["id"] and r["type"] != "balcony":
                        res = find_door_position(room, r, door_w_m)
                        if res:
                            placed_door = res
                            break

            if placed_door:
                door_x_m, door_y_m, wall = placed_door
                draw_door(msp, door_x_m * SCALE, door_y_m * SCALE, door_w, wall=wall)
            else:
                draw_door(msp, x + w / 2 - door_w / 2, y, door_w, wall="bottom")

        # ── Windows ──
        if room["type"] in ("living_room", "bedroom", "bedroom_2", "bedroom_3", "kitchen", "dining_room", "office", "boiler_room"):
            ext_walls = get_external_walls(room, rooms_with_symbols)
            if ext_walls:
                if "top" in ext_walls:
                    draw_window_oriented(msp, x + w * 0.3, y, w * 0.4, "horizontal")
                elif "bottom" in ext_walls:
                    draw_window_oriented(msp, x + w * 0.3, y + h - WALL_THICKNESS, w * 0.4, "horizontal")
                elif "left" in ext_walls:
                    draw_window_oriented(msp, x, y + h * 0.3, h * 0.4, "vertical")
                elif "right" in ext_walls:
                    draw_window_oriented(msp, x + w - WALL_THICKNESS, y + h * 0.3, h * 0.4, "vertical")
            else:
                draw_window_oriented(msp, x + w * 0.3, y + h - WALL_THICKNESS, w * 0.4, "horizontal")

        label = ROOM_LABELS.get(room["type"], room["type"])
        text = msp.add_text(label, dxfattribs={"layer": "Текст", "height": 20})
        text.set_placement(
            (x + w / 2, y + h / 2),
            align=TextEntityAlignment.MIDDLE_CENTER,
        )

    # ── ВХОДНАЯ ГРУППА ──
    if hallway_rooms:
        main_hall = hallway_rooms[0]
        hx = main_hall["x0"] * SCALE
        hy = main_hall["y0"] * SCALE
        hw = (main_hall["x1"] - main_hall["x0"]) * SCALE
        hh = (main_hall["y1"] - main_hall["y0"]) * SCALE
        
        if is_u_shape:
            # U-образная
            ex = hx + hw / 2
            ey = hy + hh
            ent_text = msp.add_text("ВХОД", dxfattribs={"layer": "Текст", "height": 20, "color": 3})
            ent_text.set_placement((ex, ey + 40), align=TextEntityAlignment.BOTTOM_CENTER)
            msp.add_lwpolyline([(ex, ey + 25), (ex - 10, ey + 45), (ex + 10, ey + 45), (ex, ey + 25)], dxfattribs={"layer": "Текст", "color": 3})
            draw_door(msp, ex - 45, ey, 90, wall="bottom")
        else:
            # RECT, L, T
            ex = hx
            ey = hy + hh / 2
            ent_text = msp.add_text("ВХОД", dxfattribs={"layer": "Текст", "height": 20, "color": 3})
            ent_text.set_placement((ex - 60, ey + 25), align=TextEntityAlignment.BOTTOM_CENTER)
            msp.add_lwpolyline([[ex - 25, ey], [ex - 45, ey - 10], [ex - 45, ey + 10], [ex - 25, ey]], dxfattribs={"layer": "Текст", "color": 3})
            draw_door(msp, ex, ey - 45, 90, wall="left")

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
