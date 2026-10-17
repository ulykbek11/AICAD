"""
Electrical Wiring Layer Generator
---------------------------------
Generates electrical layout including:
- Outlets per room type (kitchen needs more)
- Light fixtures (ceiling/wall)
- Switches at door locations
- Electrical panel location
- Wire routing along walls
"""

import math
from typing import List, Dict, Tuple
import uuid

SCALE = 100.0

ROOM_ELECTRICAL_SPECS = {
    "living_room": {"outlets": 4, "lights": 2, "switches": 1},
    "bedroom": {"outlets": 4, "lights": 1, "switches": 1},
    "bedroom_2": {"outlets": 4, "lights": 1, "switches": 1},
    "bedroom_3": {"outlets": 4, "lights": 1, "switches": 1},
    "kitchen": {"outlets": 6, "lights": 2, "switches": 1, "dedicated_circuits": True},
    "bathroom": {"outlets": 1, "lights": 2, "switches": 1, "gfci": True},
    "bathroom_2": {"outlets": 1, "lights": 2, "switches": 1, "gfci": True},
    "toilet": {"outlets": 0, "lights": 1, "switches": 1},
    "hallway": {"outlets": 1, "lights": 2, "switches": 2},
    "corridor": {"outlets": 1, "lights": 2, "switches": 2},
    "dining_room": {"outlets": 2, "lights": 1, "switches": 1},
    "office": {"outlets": 6, "lights": 1, "switches": 1},
    "garage": {"outlets": 4, "lights": 2, "switches": 1, "dedicated_circuits": True},
    "boiler_room": {"outlets": 2, "lights": 1, "switches": 1, "dedicated_circuits": True},
    "balcony": {"outlets": 1, "lights": 1, "switches": 1, "waterproof": True},
}

ELECTRICAL_COLORS = {
    "wire": "#ff6b00",
    "outlet": "#ff9500",
    "switch": "#ffcc00",
    "light": "#ffee00",
    "panel": "#ff0000",
}


def _uid():
    return str(uuid.uuid4())[:8]


def _line(x1, y1, x2, y2, color="#ff6b00"):
    return {
        "id": _uid(),
        "type": "line",
        "layer": "Electrical",
        "color": color,
        "points": [[x1, y1], [x2, y2]],
    }


def _circle(cx, cy, r, color="#ff9500"):
    return {
        "id": _uid(),
        "type": "circle",
        "layer": "Electrical",
        "color": color,
        "center": [cx, cy],
        "radius": r,
    }


def _polyline(pts, color="#ff6b00"):
    return {
        "id": _uid(),
        "type": "polyline",
        "layer": "Electrical",
        "color": color,
        "points": pts,
    }


def _text(x, y, text, height=12, color="#ff6b00"):
    return {
        "id": _uid(),
        "type": "text",
        "layer": "Electrical",
        "color": color,
        "points": [[x, y]],
        "text": text,
        "height": height,
    }


def _draw_outlet_symbol(x, y, elements):
    """Draw electrical outlet symbol (circle with two prongs)."""
    r = 8
    elements.append(_circle(x, y, r, ELECTRICAL_COLORS["outlet"]))
    elements.append(_line(x - 3, y - 2, x - 3, y + 2, ELECTRICAL_COLORS["outlet"]))
    elements.append(_line(x + 3, y - 2, x + 3, y + 2, ELECTRICAL_COLORS["outlet"]))


def _draw_switch_symbol(x, y, elements):
    """Draw switch symbol (S in circle)."""
    r = 8
    elements.append(_circle(x, y, r, ELECTRICAL_COLORS["switch"]))
    elements.append(_text(x - 4, y - 4, "S", 10, ELECTRICAL_COLORS["switch"]))


def _draw_ceiling_light_symbol(x, y, elements):
    """Draw ceiling light fixture (X in circle)."""
    r = 12
    elements.append(_circle(x, y, r, ELECTRICAL_COLORS["light"]))
    d = r * 0.6
    elements.append(_line(x - d, y - d, x + d, y + d, ELECTRICAL_COLORS["light"]))
    elements.append(_line(x - d, y + d, x + d, y - d, ELECTRICAL_COLORS["light"]))


def _draw_panel_symbol(x, y, elements):
    """Draw electrical panel symbol (rectangle with label)."""
    w, h = 30, 40
    elements.append(_polyline([
        [x - w/2, y - h/2],
        [x + w/2, y - h/2],
        [x + w/2, y + h/2],
        [x - w/2, y + h/2],
        [x - w/2, y - h/2],
    ], ELECTRICAL_COLORS["panel"]))
    elements.append(_text(x - 10, y - 5, "EP", 14, ELECTRICAL_COLORS["panel"]))


def _draw_wire_route(start, end, elements, avoid_center=False):
    """Draw wire route along walls (not diagonal)."""
    x1, y1 = start
    x2, y2 = end
    
    mid_x = (x1 + x2) / 2
    mid_y = (y1 + y2) / 2
    
    elements.append(_line(x1, y1, x1, mid_y, ELECTRICAL_COLORS["wire"]))
    elements.append(_line(x1, mid_y, x2, mid_y, ELECTRICAL_COLORS["wire"]))
    elements.append(_line(x2, mid_y, x2, y2, ELECTRICAL_COLORS["wire"]))


def generate_electrical_layer(rooms_with_symbols: List[Dict]) -> List[Dict]:
    """
    Generate electrical layer elements for all rooms.
    
    Args:
        rooms_with_symbols: List of room dictionaries with x0, y0, x1, y1 coordinates
    
    Returns:
        List of CAD elements for the electrical layer
    """
    elements = []
    panel_location = None
    
    hallway = next((r for r in rooms_with_symbols if r["type"] == "hallway"), None)
    if hallway:
        panel_x = hallway["x0"] * SCALE + 30
        panel_y = (hallway["y0"] + (hallway["y1"] - hallway["y0"]) / 2) * SCALE
        panel_location = (panel_x, panel_y)
        _draw_panel_symbol(panel_x, panel_y, elements)
    
    for room in rooms_with_symbols:
        room_type = room.get("type", "")
        specs = ROOM_ELECTRICAL_SPECS.get(room_type, {"outlets": 2, "lights": 1, "switches": 1})
        
        x0 = room["x0"] * SCALE
        y0 = room["y0"] * SCALE
        x1 = room["x1"] * SCALE
        y1 = room["y1"] * SCALE
        w = x1 - x0
        h = y1 - y0
        cx = x0 + w / 2
        cy = y0 + h / 2
        
        num_outlets = specs.get("outlets", 2)
        outlet_spacing = w / (num_outlets + 1)
        for i in range(num_outlets):
            ox = x0 + outlet_spacing * (i + 1)
            oy = y0 + 15
            _draw_outlet_symbol(ox, oy, elements)
            
            if panel_location:
                _draw_wire_route(panel_location, (ox, oy), elements)
        
        num_lights = specs.get("lights", 1)
        if num_lights == 1:
            _draw_ceiling_light_symbol(cx, cy, elements)
            if panel_location:
                _draw_wire_route(panel_location, (cx, cy), elements)
        elif num_lights == 2:
            spacing = w / 3
            _draw_ceiling_light_symbol(x0 + spacing, cy, elements)
            _draw_ceiling_light_symbol(x0 + spacing * 2, cy, elements)
            if panel_location:
                _draw_wire_route(panel_location, (x0 + spacing, cy), elements)
                _draw_wire_route((x0 + spacing, cy), (x0 + spacing * 2, cy), elements)
        
        if room_type != "hallway":
            switch_x = x0 + 20
            switch_y = y1 - 20
            _draw_switch_symbol(switch_x, switch_y, elements)
            
            if panel_location:
                _draw_wire_route(panel_location, (switch_x, switch_y), elements)
    
    return elements


def get_electrical_legend() -> List[Dict]:
    """Return legend items for the electrical layer."""
    return [
        {"symbol": "circle_double_line", "label": "Electrical Outlet", "color": ELECTRICAL_COLORS["outlet"]},
        {"symbol": "circle_s", "label": "Light Switch", "color": ELECTRICAL_COLORS["switch"]},
        {"symbol": "circle_x", "label": "Ceiling Light", "color": ELECTRICAL_COLORS["light"]},
        {"symbol": "rectangle_ep", "label": "Electrical Panel", "color": ELECTRICAL_COLORS["panel"]},
        {"symbol": "line", "label": "Wire Route", "color": ELECTRICAL_COLORS["wire"]},
    ]
