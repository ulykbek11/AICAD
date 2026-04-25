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
        elements.append(_line(x1, y1 + offset, x2, y2 + offset, "Размеры", "#ff4444"))
        elements.append(_line(x1, y1, x1, y1 + offset, "Размеры", "#ff4444"))
        elements.append(_line(x2, y2, x2, y2 + offset, "Размеры", "#ff4444"))
        elements.append(_text((x1 + x2) / 2, y1 + offset + 5, label, "Размеры", 15, "#ff4444"))
    else:
        # Vertical
        elements.append(_line(x1 + offset, y1, x2 + offset, y2, "Размеры", "#ff4444"))
        elements.append(_line(x1, y1, x1 + offset, y1, "Размеры", "#ff4444"))
        elements.append(_line(x2, y2, x2 + offset, y2, "Размеры", "#ff4444"))
        elements.append(_text(x1 + offset + 5, (y1 + y2) / 2, label, "Размеры", 15, "#ff4444"))


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

def generate_elements(rooms_with_symbols: list[dict]) -> list[dict]:
    """
    Convert rooms_with_symbols into a flat list of CAD elements
    that the frontend can render as editable SVG objects.
    """
    elements: list[dict] = []
    all_x: list[float] = []
    all_y: list[float] = []

    # Compute plan center for door placement
    if rooms_with_symbols:
        all_cx = [r["x0"] + (r["x1"] - r["x0"]) / 2 for r in rooms_with_symbols]
        all_cy = [r["y0"] + (r["y1"] - r["y0"]) / 2 for r in rooms_with_symbols]
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

        # ── Walls (4 sides, double lines) ──
        _draw_wall(elements, x, y, x + w, y)
        _draw_wall(elements, x + w, y, x + w, y + h)
        _draw_wall(elements, x + w, y + h, x, y + h)
        _draw_wall(elements, x, y + h, x, y)

        # ── Doors ──
        if room["type"] != "hallway":
            door_w = 70 if room["type"] in ("bathroom", "toilet", "bathroom_2") else 90

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

            _draw_door(elements, door_x, door_y, door_w, wall=wall)

        # ── Windows ──
        if room["type"] in ("living_room", "bedroom", "bedroom_2", "bedroom_3", "kitchen", "dining_room", "office"):
            _draw_window(elements, x + w * 0.3, y + h - WALL_THICKNESS, w * 0.4)

        # ── Room Label ──
        label = room.get("label", ROOM_LABELS.get(room["type"], room["type"]))
        elements.append(_text(x + w / 2, y + h / 2, label, "Текст", 20))

        # ── Furniture Symbols ──
        for symbol in room.get("symbols", []):
            _draw_symbol(elements, symbol)

    # ── Overall Dimensions ──
    if all_x and all_y:
        min_x, max_x = min(all_x), max(all_x)
        min_y, max_y = min(all_y), max(all_y)
        _draw_dimension(elements, min_x, max_y, max_x, max_y, offset=80)
        _draw_dimension(elements, max_x, min_y, max_x, max_y, offset=80)

    return elements
