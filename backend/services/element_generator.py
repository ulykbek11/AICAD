"""
Element Generator Service
--------------------------
Converts rooms_with_symbols (bboxes + furniture) into a list of
CAD primitives that the frontend can render as editable SVG objects.

Each element dict:
  {
    id: str,
    type: "line" | "polyline" | "circle" | "arc" | "ellipse" | "text",
    layer: str,
    color: str,
    points: [[x,y], ...],        # for line/polyline/text
    center: [x, y],              # for circle/arc/ellipse
    radius: float,               # for circle/arc/ellipse
    ratio: float,                # for ellipse
    start_angle: float,          # for arc (degrees)
    end_angle: float,            # for arc (degrees)
    text: str,                   # for text
    height: float,               # font height for text
  }
"""

import math
import uuid

SCALE = 100.0
WALL_THICKNESS = 20.0

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


def _uid():
    return str(uuid.uuid4())[:8]


def _line(x1, y1, x2, y2, layer, color="#ffffff"):
    return {
        "id": _uid(),
        "type": "line",
        "layer": layer,
        "color": color,
        "points": [[x1, y1], [x2, y2]],
    }


def _polyline(pts, layer, color="#ffffff"):
    return {
        "id": _uid(),
        "type": "polyline",
        "layer": layer,
        "color": color,
        "points": pts,
    }


def _circle(cx, cy, r, layer, color="#ffffff"):
    return {
        "id": _uid(),
        "type": "circle",
        "layer": layer,
        "color": color,
        "center": [cx, cy],
        "radius": r,
    }


def _arc(cx, cy, r, start_angle, end_angle, layer, color="#ffffff"):
    return {
        "id": _uid(),
        "type": "arc",
        "layer": layer,
        "color": color,
        "center": [cx, cy],
        "radius": r,
        "start_angle": start_angle,
        "end_angle": end_angle,
    }


def _ellipse(cx, cy, rx, ratio, layer, color="#ffffff"):
    return {
        "id": _uid(),
        "type": "ellipse",
        "layer": layer,
        "color": color,
        "center": [cx, cy],
        "radius": rx,
        "ratio": ratio,
    }


def _text(x, y, text, layer, height=20, color="#ffffff"):
    return {
        "id": _uid(),
        "type": "text",
        "layer": layer,
        "color": color,
        "points": [[x, y]],
        "text": text,
        "height": height,
    }


# ═══════════════════════════════════════════════════════
# Wall drawing — double lines like dxf_service
# ═══════════════════════════════════════════════════════

def _draw_wall(elements, x1, y1, x2, y2):
    dx = x2 - x1
    dy = y2 - y1
    length = math.sqrt(dx ** 2 + dy ** 2)
    if length == 0:
        return
    nx = -dy / length * WALL_THICKNESS
    ny = dx / length * WALL_THICKNESS
    elements.append(_line(x1, y1, x2, y2, "Стены"))
    elements.append(_line(x1 + nx, y1 + ny, x2 + nx, y2 + ny, "Стены"))


# ═══════════════════════════════════════════════════════
# Door drawing — line + arc
# ═══════════════════════════════════════════════════════

def _draw_door(elements, x, y, width, wall="bottom"):
    if wall == "bottom":
        elements.append(_line(x, y, x + width, y, "Двери"))
        elements.append(_arc(x, y, width, 0, 90, "Двери"))
    elif wall == "top":
        elements.append(_line(x, y, x + width, y, "Двери"))
        elements.append(_arc(x, y, width, 270, 360, "Двери"))
    elif wall == "left":
        elements.append(_line(x, y, x, y + width, "Двери"))
        elements.append(_arc(x, y, width, 0, 90, "Двери"))
    elif wall == "right":
        elements.append(_line(x, y, x, y + width, "Двери"))
        elements.append(_arc(x, y, width, 90, 180, "Двери"))


# ═══════════════════════════════════════════════════════
# Window drawing — three parallel lines
# ═══════════════════════════════════════════════════════

def _draw_window(elements, x, y, width):
    for offset in [0, WALL_THICKNESS / 2, WALL_THICKNESS]:
        elements.append(_line(x, y + offset, x + width, y + offset, "Окна"))


# ═══════════════════════════════════════════════════════
# Dimension drawing
# ═══════════════════════════════════════════════════════

def _draw_dimension(elements, x1, y1, x2, y2, offset=80):
    length = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
    label = f"{length / SCALE:.1f} м"

    if abs(x2 - x1) > abs(y2 - y1):
        # Horizontal
        elements.append(_line(x1, y1 + offset, x2, y2 + offset, "Размеры", "#ff5555"))
        elements.append(_line(x1, y1, x1, y1 + offset, "Размеры", "#ff5555"))
        elements.append(_line(x2, y2, x2, y2 + offset, "Размеры", "#ff5555"))
        elements.append(_text((x1 + x2) / 2, y1 + offset + 5, label, "Размеры", 15, "#ff5555"))
    else:
        # Vertical
        elements.append(_line(x1 + offset, y1, x2 + offset, y2, "Размеры", "#ff5555"))
        elements.append(_line(x1, y1, x1 + offset, y1, "Размеры", "#ff5555"))
        elements.append(_line(x2, y2, x2 + offset, y2, "Размеры", "#ff5555"))
        elements.append(_text(x1 + offset + 5, (y1 + y2) / 2, label, "Размеры", 15, "#ff5555"))


# ═══════════════════════════════════════════════════════
# Furniture symbols — mirrors symbol_service logic
# ═══════════════════════════════════════════════════════

def _draw_symbol(elements, symbol):
    st = symbol["type"]
    x = symbol["x"] * SCALE
    y = symbol["y"] * SCALE
    w = symbol["w"] * SCALE
    h = symbol["h"] * SCALE

    if st == "sofa":
        elements.append(_polyline(
            [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]],
            "Мебель"
        ))
        elements.append(_line(x, y + h - 20, x + w, y + h - 20, "Мебель"))
        pw = (w - 10) / 3
        for i in range(3):
            cx = x + 5 + i * pw
            elements.append(_polyline(
                [[cx + 2, y + 2], [cx + pw - 2, y + 2],
                 [cx + pw - 2, y + h - 22], [cx + 2, y + h - 22], [cx + 2, y + 2]],
                "Мебель"
            ))

    elif st == "bed":
        elements.append(_polyline(
            [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]],
            "Мебель"
        ))
        elements.append(_line(x, y + h - 25, x + w, y + h - 25, "Мебель"))
        for i in range(2):
            cx = x + 25 + i * (w - 50)
            cy = y + h - 12
            elements.append(_ellipse(cx, cy, 15, 0.6, "Мебель"))

    elif st == "wardrobe":
        elements.append(_polyline(
            [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]],
            "Мебель"
        ))
        elements.append(_line(x, y, x + w, y + h, "Мебель"))
        elements.append(_line(x + w, y, x, y + h, "Мебель"))

    elif st == "stove":
        elements.append(_polyline(
            [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]],
            "Мебель"
        ))
        for ox, oy in [(0.25, 0.25), (0.75, 0.25), (0.25, 0.75), (0.75, 0.75)]:
            elements.append(_circle(
                x + w * ox, y + h * oy,
                min(w, h) * 0.15,
                "Мебель"
            ))

    elif st == "sink":
        elements.append(_polyline(
            [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]],
            "Мебель"
        ))
        elements.append(_circle(
            x + w / 2, y + h / 2,
            min(w, h) * 0.35,
            "Мебель"
        ))

    elif st == "bathtub":
        elements.append(_polyline(
            [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]],
            "Мебель"
        ))
        elements.append(_polyline(
            [[x + 8, y + 8], [x + w - 8, y + 8],
             [x + w - 8, y + h - 8], [x + 8, y + h - 8], [x + 8, y + 8]],
            "Мебель"
        ))

    elif st == "toilet":
        elements.append(_polyline(
            [[x, y + h * 0.65], [x + w, y + h * 0.65],
             [x + w, y + h], [x, y + h], [x, y + h * 0.65]],
            "Мебель"
        ))
        elements.append(_ellipse(
            x + w / 2, y + h * 0.35,
            w / 3, 0.8,
            "Мебель"
        ))

    elif st == "wash_basin":
        elements.append(_polyline(
            [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]],
            "Мебель"
        ))
        elements.append(_circle(
            x + w / 2, y + h / 2,
            min(w, h) * 0.3,
            "Мебель"
        ))

    elif st in ("counter", "coffee_table"):
        elements.append(_polyline(
            [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]],
            "Мебель"
        ))


# ═══════════════════════════════════════════════════════
# Main entry point
# ═══════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════
# Helper functions for geometric layout validation
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

def _draw_window_oriented(elements, x, y, size, orientation="horizontal"):
    if orientation == "horizontal":
        for offset in [0, WALL_THICKNESS / 2, WALL_THICKNESS]:
            elements.append(_line(x, y + offset, x + size, y + offset, "Окна", "#00ffff"))
    else:
        for offset in [0, WALL_THICKNESS / 2, WALL_THICKNESS]:
            elements.append(_line(x + offset, y, x + offset, y + size, "Окна", "#00ffff"))

# ═══════════════════════════════════════════════════════
# Main entry point
# ═══════════════════════════════════════════════════════

def generate_elements(rooms_with_symbols: list[dict]) -> list[dict]:
    """
    Convert rooms_with_symbols into a flat list of CAD elements
    that the frontend can render as editable SVG objects.
    """
    elements: list[dict] = []
    all_x: list[float] = []
    all_y: list[float] = []

    # Находим общие габариты для позиционирования входа
    hallway_rooms = [r for r in rooms_with_symbols if r["type"] == "hallway"]
    
    # Определяем, есть ли U-образная форма
    is_u_shape = False
    if hallway_rooms:
        hall_w = max(r["x1"] - r["x0"] for r in hallway_rooms)
        # Если коридор очень длинный (>= 15м), это U-образная форма
        if hall_w >= 15.0:
            is_u_shape = True

    for room in rooms_with_symbols:
        x = room["x0"] * SCALE
        y = room["y0"] * SCALE
        w = (room["x1"] - room["x0"]) * SCALE
        h = (room["y1"] - room["y0"]) * SCALE
        all_x.extend([x, x + w])
        all_y.extend([y, y + h])

        # ── Walls (4 sides, double lines) ──
        _draw_wall(elements, x, y, x + w, y)
        _draw_wall(elements, x + w, y, x + w, y + h)
        _draw_wall(elements, x + w, y + h, x, y + h)
        _draw_wall(elements, x, y + h, x, y)

        # ── Doors ──
        if room["type"] != "hallway" and room["type"] != "balcony":
            door_w_m = 0.7 if room["type"] in ("bathroom", "toilet", "bathroom_2") else 0.9
            door_w = door_w_m * SCALE

            # Геометрический поиск смежной стены с коридором или другими комнатами
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
                _draw_door(elements, door_x_m * SCALE, door_y_m * SCALE, door_w, wall=wall)
            else:
                # Абсолютный fallback, если комната изолирована
                _draw_door(elements, x + w / 2 - door_w / 2, y, door_w, wall="bottom")

        # ── Windows ──
        if room["type"] in ("living_room", "bedroom", "bedroom_2", "bedroom_3", "kitchen", "dining_room", "office", "boiler_room"):
            ext_walls = get_external_walls(room, rooms_with_symbols)
            if ext_walls:
                # Выбираем наиболее подходящую внешнюю стену
                # Приоритет: top, bottom, left, right
                if "top" in ext_walls:
                    _draw_window_oriented(elements, x + w * 0.3, y, w * 0.4, "horizontal")
                elif "bottom" in ext_walls:
                    _draw_window_oriented(elements, x + w * 0.3, y + h - WALL_THICKNESS, w * 0.4, "horizontal")
                elif "left" in ext_walls:
                    _draw_window_oriented(elements, x, y + h * 0.3, h * 0.4, "vertical")
                elif "right" in ext_walls:
                    _draw_window_oriented(elements, x + w - WALL_THICKNESS, y + h * 0.3, h * 0.4, "vertical")
            else:
                # Fallback
                _draw_window_oriented(elements, x + w * 0.3, y + h - WALL_THICKNESS, w * 0.4, "horizontal")

        # ── Room Label ──
        label = room.get("label", ROOM_LABELS.get(room["type"], room["type"]))
        elements.append(_text(x + w / 2, y + h / 2, label, "Текст", 20))

        # ── Furniture Symbols ──
        for symbol in room.get("symbols", []):
            _draw_symbol(elements, symbol)

    # ── ВХОДНАЯ ГРУППА ──
    # Рисуем вход для первого коридора
    if hallway_rooms:
        main_hall = hallway_rooms[0]
        hx = main_hall["x0"] * SCALE
        hy = main_hall["y0"] * SCALE
        hw = (main_hall["x1"] - main_hall["x0"]) * SCALE
        hh = (main_hall["y1"] - main_hall["y0"]) * SCALE
        
        if is_u_shape:
            # Для U-образной формы: вход по центру снизу
            ex = hx + hw / 2
            ey = hy + hh
            # Текст ВХОД и стрелка вверх
            elements.append(_text(ex, ey + 40, "ВХОД", "Текст", 20, "#55ff55"))
            elements.append(_polyline([[ex, ey + 25], [ex - 10, ey + 45], [ex + 10, ey + 45], [ex, ey + 25]], "Текст", "#55ff55"))
            # Сама дверь
            _draw_door(elements, ex - 45, ey, 90, wall="bottom")
        else:
            # Для RECT, L, T: вход с левого торца коридора
            ex = hx
            ey = hy + hh / 2
            # Текст ВХОД и стрелка вправо
            elements.append(_text(ex - 60, ey + 25, "ВХОД", "Текст", 20, "#55ff55"))
            elements.append(_polyline([[ex - 25, ey], [ex - 45, ey - 10], [ex - 45, ey + 10], [ex - 25, ey]], "Текст", "#55ff55"))
            # Дверь открывается внутрь коридора
            _draw_door(elements, ex, ey - 45, 90, wall="left")

    # ── Overall Dimensions ──
    if all_x and all_y:
        min_x, max_x = min(all_x), max(all_x)
        min_y, max_y = min(all_y), max(all_y)
        _draw_dimension(elements, min_x, max_y, max_x, max_y, offset=80)
        _draw_dimension(elements, max_x, min_y, max_x, max_y, offset=80)

    return elements
