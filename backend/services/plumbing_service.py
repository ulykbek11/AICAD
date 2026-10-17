"""
Plumbing Layer Generator
------------------------
Generates plumbing layout including:
- Water supply pipes (cold and hot)
- Drainage pipes
- Fixtures (sinks, toilets, bathtubs, showers)
- Riser/stack locations
- Shutoff valves
"""

import math
from typing import List, Dict, Tuple
import uuid

SCALE = 100.0

WET_ROOMS = {"kitchen", "bathroom", "bathroom_2", "toilet", "boiler_room", "laundry"}

ROOM_PLUMBING_FIXTURES = {
    "kitchen": {
        "fixtures": [
            {"type": "sink", "supply": True, "drain": True},
            {"type": "dishwasher", "supply": True, "drain": True},
        ]
    },
    "bathroom": {
        "fixtures": [
            {"type": "sink", "supply": True, "drain": True},
            {"type": "toilet", "supply": True, "drain": True},
            {"type": "bathtub", "supply": True, "drain": True},
        ]
    },
    "bathroom_2": {
        "fixtures": [
            {"type": "sink", "supply": True, "drain": True},
            {"type": "shower", "supply": True, "drain": True},
        ]
    },
    "toilet": {
        "fixtures": [
            {"type": "toilet", "supply": True, "drain": True},
            {"type": "sink", "supply": True, "drain": True},
        ]
    },
    "boiler_room": {
        "fixtures": [
            {"type": "water_heater", "supply": True, "drain": False},
        ]
    },
    "laundry": {
        "fixtures": [
            {"type": "washing_machine", "supply": True, "drain": True},
        ]
    },
}

PLUMBING_COLORS = {
    "cold_water": "#0066ff",
    "hot_water": "#ff3333",
    "drain": "#666666",
    "vent": "#999999",
    "fixture": "#0099cc",
    "riser": "#003366",
    "valve": "#00cc66",
}


def _uid():
    return str(uuid.uuid4())[:8]


def _line(x1, y1, x2, y2, color="#0066ff", dash=False):
    elem = {
        "id": _uid(),
        "type": "line",
        "layer": "Plumbing",
        "color": color,
        "points": [[x1, y1], [x2, y2]],
    }
    if dash:
        elem["dash"] = True
    return elem


def _circle(cx, cy, r, color="#0099cc"):
    return {
        "id": _uid(),
        "type": "circle",
        "layer": "Plumbing",
        "color": color,
        "center": [cx, cy],
        "radius": r,
    }


def _polyline(pts, color="#0066ff", dash=False):
    elem = {
        "id": _uid(),
        "type": "polyline",
        "layer": "Plumbing",
        "color": color,
        "points": pts,
    }
    if dash:
        elem["dash"] = True
    return elem


def _text(x, y, text, height=10, color="#0066ff"):
    return {
        "id": _uid(),
        "type": "text",
        "layer": "Plumbing",
        "color": color,
        "points": [[x, y]],
        "text": text,
        "height": height,
    }


def _draw_riser_symbol(x, y, elements):
    """Draw vertical riser/stack symbol (circle with dot)."""
    r = 15
    elements.append(_circle(x, y, r, PLUMBING_COLORS["riser"]))
    elements.append(_circle(x, y, 4, PLUMBING_COLORS["riser"]))
    elements.append(_text(x - 8, y + 25, "RISER", 10, PLUMBING_COLORS["riser"]))


def _draw_shutoff_valve(x, y, elements, is_main=False):
    """Draw shutoff valve symbol."""
    size = 10 if is_main else 6
    elements.append(_polyline([
        [x - size, y],
        [x, y - size],
        [x + size, y],
        [x, y + size],
        [x - size, y],
    ], PLUMBING_COLORS["valve"]))


def _draw_sink_fixture(x, y, elements):
    """Draw sink plumbing connection."""
    elements.append(_circle(x, y, 8, PLUMBING_COLORS["fixture"]))
    elements.append(_text(x - 4, y - 3, "S", 8, PLUMBING_COLORS["fixture"]))


def _draw_toilet_fixture(x, y, elements):
    """Draw toilet plumbing connection."""
    elements.append(_circle(x, y, 10, PLUMBING_COLORS["fixture"]))
    elements.append(_text(x - 4, y - 3, "WC", 7, PLUMBING_COLORS["fixture"]))


def _draw_bathtub_fixture(x, y, elements):
    """Draw bathtub/shower plumbing connection."""
    elements.append(_polyline([
        [x - 10, y - 6],
        [x + 10, y - 6],
        [x + 10, y + 6],
        [x - 10, y + 6],
        [x - 10, y - 6],
    ], PLUMBING_COLORS["fixture"]))
    elements.append(_circle(x, y, 4, PLUMBING_COLORS["fixture"]))


def _draw_water_heater(x, y, elements):
    """Draw water heater symbol."""
    r = 15
    elements.append(_circle(x, y, r, PLUMBING_COLORS["hot_water"]))
    elements.append(_text(x - 8, y - 4, "WH", 10, PLUMBING_COLORS["hot_water"]))


def _draw_pipe_route(start, end, elements, pipe_type="cold"):
    """Draw pipe route along walls."""
    x1, y1 = start
    x2, y2 = end
    
    color = PLUMBING_COLORS.get(f"{pipe_type}_water", PLUMBING_COLORS["cold_water"])
    if pipe_type == "drain":
        color = PLUMBING_COLORS["drain"]
    
    mid_y = (y1 + y2) / 2
    
    elements.append(_line(x1, y1, x1, mid_y, color))
    elements.append(_line(x1, mid_y, x2, mid_y, color))
    elements.append(_line(x2, mid_y, x2, y2, color))


def find_optimal_riser_location(rooms: List[Dict]) -> Tuple[float, float]:
    """Find the optimal location for the plumbing riser (near wet rooms)."""
    wet_rooms = [r for r in rooms if r.get("type") in WET_ROOMS]
    
    if not wet_rooms:
        return 0, 0
    
    avg_x = sum((r["x0"] + r["x1"]) / 2 for r in wet_rooms) / len(wet_rooms)
    avg_y = sum((r["y0"] + r["y1"]) / 2 for r in wet_rooms) / len(wet_rooms)
    
    closest_room = min(wet_rooms, key=lambda r: (
        ((r["x0"] + r["x1"]) / 2 - avg_x) ** 2 +
        ((r["y0"] + r["y1"]) / 2 - avg_y) ** 2
    ))
    
    return closest_room["x0"], (closest_room["y0"] + closest_room["y1"]) / 2


def generate_plumbing_layer(rooms_with_symbols: List[Dict]) -> List[Dict]:
    """
    Generate plumbing layer elements for all rooms.
    
    Args:
        rooms_with_symbols: List of room dictionaries with x0, y0, x1, y1 coordinates
    
    Returns:
        List of CAD elements for the plumbing layer
    """
    elements = []
    
    wet_rooms = [r for r in rooms_with_symbols if r.get("type") in WET_ROOMS]
    
    if not wet_rooms:
        return elements
    
    riser_x, riser_y = find_optimal_riser_location(rooms_with_symbols)
    riser_x = riser_x * SCALE + 30
    riser_y = riser_y * SCALE
    
    _draw_riser_symbol(riser_x, riser_y, elements)
    
    _draw_shutoff_valve(riser_x - 25, riser_y, elements, is_main=True)
    
    for room in wet_rooms:
        room_type = room.get("type", "")
        fixtures_spec = ROOM_PLUMBING_FIXTURES.get(room_type, {"fixtures": []})
        
        x0 = room["x0"] * SCALE
        y0 = room["y0"] * SCALE
        x1 = room["x1"] * SCALE
        y1 = room["y1"] * SCALE
        w = x1 - x0
        h = y1 - y0
        
        fixtures = fixtures_spec.get("fixtures", [])
        num_fixtures = len(fixtures)
        
        if num_fixtures == 0:
            continue
        
        fixture_spacing = w / (num_fixtures + 1) if num_fixtures > 0 else w / 2
        
        for i, fixture in enumerate(fixtures):
            fx = x0 + fixture_spacing * (i + 1)
            fy = y0 + 25
            
            fixture_type = fixture.get("type", "sink")
            
            if fixture_type == "sink":
                _draw_sink_fixture(fx, fy, elements)
            elif fixture_type == "toilet":
                _draw_toilet_fixture(fx, fy, elements)
            elif fixture_type in ("bathtub", "shower"):
                _draw_bathtub_fixture(fx, fy, elements)
            elif fixture_type == "water_heater":
                _draw_water_heater(fx, fy, elements)
            else:
                _draw_sink_fixture(fx, fy, elements)
            
            if fixture.get("supply"):
                _draw_pipe_route((riser_x, riser_y), (fx - 5, fy), elements, "cold")
                if fixture_type not in ("toilet",):
                    _draw_pipe_route((riser_x + 8, riser_y), (fx + 5, fy), elements, "hot")
            
            if fixture.get("drain"):
                drain_y = fy + 15
                _draw_pipe_route((fx, drain_y), (riser_x, drain_y + 50), elements, "drain")
    
    return elements


def get_plumbing_legend() -> List[Dict]:
    """Return legend items for the plumbing layer."""
    return [
        {"symbol": "line", "label": "Cold Water Supply", "color": PLUMBING_COLORS["cold_water"]},
        {"symbol": "line", "label": "Hot Water Supply", "color": PLUMBING_COLORS["hot_water"]},
        {"symbol": "line", "label": "Drainage", "color": PLUMBING_COLORS["drain"]},
        {"symbol": "circle_dot", "label": "Riser/Stack", "color": PLUMBING_COLORS["riser"]},
        {"symbol": "diamond", "label": "Shutoff Valve", "color": PLUMBING_COLORS["valve"]},
        {"symbol": "circle_s", "label": "Sink", "color": PLUMBING_COLORS["fixture"]},
        {"symbol": "circle_wc", "label": "Toilet", "color": PLUMBING_COLORS["fixture"]},
    ]
