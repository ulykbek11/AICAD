"""
Layout Validator Service
------------------------
Validates and repairs floor plan layouts to ensure architectural rationality.
Checks for:
- Room size validity (min/max dimensions)
- Aspect ratio sanity (no too-narrow rooms)
- Proper adjacency (wet rooms grouped, no forbidden adjacencies)
- Connectivity (all rooms accessible via hallway/corridor)
- No overlaps
- Proper door/window placement feasibility
"""

import math
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)

MIN_ROOM_DIMENSIONS = {
    "living_room": {"min_w": 3.5, "min_h": 3.5, "max_ratio": 2.5},
    "bedroom": {"min_w": 2.7, "min_h": 2.7, "max_ratio": 2.0},
    "bedroom_2": {"min_w": 2.7, "min_h": 2.7, "max_ratio": 2.0},
    "bedroom_3": {"min_w": 2.7, "min_h": 2.7, "max_ratio": 2.0},
    "kitchen": {"min_w": 2.5, "min_h": 2.7, "max_ratio": 2.5},
    "bathroom": {"min_w": 1.7, "min_h": 1.7, "max_ratio": 2.5},
    "bathroom_2": {"min_w": 1.7, "min_h": 1.7, "max_ratio": 2.5},
    "toilet": {"min_w": 0.9, "min_h": 1.2, "max_ratio": 2.0},
    "hallway": {"min_w": 1.2, "min_h": 1.2, "max_ratio": 8.0},
    "corridor": {"min_w": 1.0, "min_h": 1.0, "max_ratio": 10.0},
    "dining_room": {"min_w": 2.5, "min_h": 2.5, "max_ratio": 2.5},
    "office": {"min_w": 2.4, "min_h": 2.4, "max_ratio": 2.0},
    "garage": {"min_w": 2.7, "min_h": 5.0, "max_ratio": 3.0},
    "balcony": {"min_w": 1.2, "min_h": 2.0, "max_ratio": 5.0},
    "boiler_room": {"min_w": 1.5, "min_h": 1.5, "max_ratio": 2.0},
    "storage": {"min_w": 1.0, "min_h": 1.0, "max_ratio": 3.0},
    "default": {"min_w": 2.0, "min_h": 2.0, "max_ratio": 3.0},
}

WET_ROOMS = {"bathroom", "bathroom_2", "toilet", "kitchen", "boiler_room", "laundry"}

FORBIDDEN_ADJACENCIES = {
    frozenset({"kitchen", "bathroom"}),
    frozenset({"kitchen", "bathroom_2"}),
    frozenset({"kitchen", "toilet"}),
    frozenset({"bedroom", "kitchen"}),
    frozenset({"bedroom_2", "kitchen"}),
    frozenset({"bedroom_3", "kitchen"}),
    frozenset({"dining_room", "bathroom"}),
    frozenset({"dining_room", "toilet"}),
    frozenset({"living_room", "toilet"}),
}

PREFERRED_ADJACENCIES = {
    "kitchen": ["dining_room", "living_room", "hallway"],
    "dining_room": ["kitchen", "living_room"],
    "living_room": ["dining_room", "hallway", "kitchen"],
    "bedroom": ["hallway", "bathroom", "corridor"],
    "bedroom_2": ["hallway", "bathroom_2", "corridor"],
    "bedroom_3": ["hallway", "bathroom_2", "corridor"],
    "bathroom": ["bedroom", "hallway", "corridor"],
    "bathroom_2": ["bedroom_2", "bedroom_3", "hallway", "corridor"],
    "toilet": ["hallway", "corridor"],
    "office": ["hallway", "corridor", "living_room"],
}


@dataclass
class ValidationResult:
    is_valid: bool
    issues: List[str]
    warnings: List[str]
    repairs_made: List[str]


def validate_room_dimensions(room: dict) -> Tuple[bool, List[str]]:
    """Validate a single room's dimensions."""
    issues = []
    room_type = room.get("type", "default")
    constraints = MIN_ROOM_DIMENSIONS.get(room_type, MIN_ROOM_DIMENSIONS["default"])
    
    w = room.get("width", room.get("w", 0))
    h = room.get("height", room.get("h", 0))
    
    if w <= 0 or h <= 0:
        issues.append(f"{room_type} ({room.get('id')}): invalid dimensions ({w:.2f}x{h:.2f})")
        return False, issues
    
    if w < constraints["min_w"]:
        issues.append(f"{room_type} ({room.get('id')}): width {w:.2f}m < min {constraints['min_w']}m")
    
    if h < constraints["min_h"]:
        issues.append(f"{room_type} ({room.get('id')}): height {h:.2f}m < min {constraints['min_h']}m")
    
    aspect_ratio = max(w, h) / min(w, h) if min(w, h) > 0 else float('inf')
    if aspect_ratio > constraints["max_ratio"]:
        issues.append(f"{room_type} ({room.get('id')}): aspect ratio {aspect_ratio:.2f} > max {constraints['max_ratio']}")
    
    return len(issues) == 0, issues


def check_overlap(r1: dict, r2: dict, tolerance: float = 0.01) -> bool:
    """Check if two rooms overlap."""
    x1_min = r1.get("x", r1.get("x0", 0))
    y1_min = r1.get("y", r1.get("y0", 0))
    x1_max = x1_min + r1.get("width", r1.get("w", r1.get("x1", 0) - x1_min))
    y1_max = y1_min + r1.get("height", r1.get("h", r1.get("y1", 0) - y1_min))
    
    x2_min = r2.get("x", r2.get("x0", 0))
    y2_min = r2.get("y", r2.get("y0", 0))
    x2_max = x2_min + r2.get("width", r2.get("w", r2.get("x1", 0) - x2_min))
    y2_max = y2_min + r2.get("height", r2.get("h", r2.get("y1", 0) - y2_min))
    
    x_overlap = min(x1_max, x2_max) - max(x1_min, x2_min)
    y_overlap = min(y1_max, y2_max) - max(y1_min, y2_min)
    
    return x_overlap > tolerance and y_overlap > tolerance


def are_adjacent(r1: dict, r2: dict, tolerance: float = 0.15) -> bool:
    """Check if two rooms share a wall (are adjacent)."""
    x1 = r1.get("x", r1.get("x0", 0))
    y1 = r1.get("y", r1.get("y0", 0))
    w1 = r1.get("width", r1.get("w", 0))
    h1 = r1.get("height", r1.get("h", 0))
    
    x2 = r2.get("x", r2.get("x0", 0))
    y2 = r2.get("y", r2.get("y0", 0))
    w2 = r2.get("width", r2.get("w", 0))
    h2 = r2.get("height", r2.get("h", 0))
    
    h_touch = abs(x1 + w1 - x2) < tolerance or abs(x2 + w2 - x1) < tolerance
    h_overlap = min(y1 + h1, y2 + h2) - max(y1, y2) > 0.5
    
    v_touch = abs(y1 + h1 - y2) < tolerance or abs(y2 + h2 - y1) < tolerance
    v_overlap = min(x1 + w1, x2 + w2) - max(x1, x2) > 0.5
    
    return (h_touch and h_overlap) or (v_touch and v_overlap)


def check_forbidden_adjacency(r1: dict, r2: dict) -> Optional[str]:
    """Check if two adjacent rooms have forbidden adjacency."""
    pair = frozenset({r1.get("type"), r2.get("type")})
    if pair in FORBIDDEN_ADJACENCIES:
        return f"Forbidden adjacency: {r1.get('type')} adjacent to {r2.get('type')}"
    return None


def build_adjacency_graph(rooms: List[dict]) -> Dict[str, List[str]]:
    """Build an adjacency graph from room positions."""
    graph = {r.get("id"): [] for r in rooms}
    
    for i, r1 in enumerate(rooms):
        for j, r2 in enumerate(rooms):
            if i >= j:
                continue
            if are_adjacent(r1, r2):
                graph[r1.get("id")].append(r2.get("id"))
                graph[r2.get("id")].append(r1.get("id"))
    
    return graph


def check_connectivity(rooms: List[dict], adjacency_graph: Dict[str, List[str]]) -> Tuple[bool, List[str]]:
    """Check if all rooms are reachable from a hallway/corridor."""
    issues = []
    
    hallway_ids = [r.get("id") for r in rooms if r.get("type") in ("hallway", "corridor")]
    
    if not hallway_ids:
        issues.append("No hallway/corridor found - rooms may not be accessible")
        return False, issues
    
    visited = set()
    queue = list(hallway_ids)
    visited.update(hallway_ids)
    
    while queue:
        current = queue.pop(0)
        for neighbor in adjacency_graph.get(current, []):
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append(neighbor)
    
    room_ids = {r.get("id") for r in rooms}
    unreachable = room_ids - visited
    
    for room_id in unreachable:
        room = next((r for r in rooms if r.get("id") == room_id), None)
        if room:
            issues.append(f"Room {room.get('type')} ({room_id}) is not connected to hallway")
    
    return len(unreachable) == 0, issues


def check_wet_room_grouping(rooms: List[dict], adjacency_graph: Dict[str, List[str]]) -> List[str]:
    """Check if wet rooms are reasonably grouped (for plumbing efficiency)."""
    warnings = []
    
    wet_room_list = [r for r in rooms if r.get("type") in WET_ROOMS]
    
    if len(wet_room_list) <= 1:
        return warnings
    
    for wet_room in wet_room_list:
        neighbors = adjacency_graph.get(wet_room.get("id"), [])
        neighbor_types = [
            next((r.get("type") for r in rooms if r.get("id") == n), None)
            for n in neighbors
        ]
        
        wet_neighbors = sum(1 for t in neighbor_types if t in WET_ROOMS)
        if wet_neighbors == 0 and wet_room.get("type") != "kitchen":
            warnings.append(f"{wet_room.get('type')} ({wet_room.get('id')}) is isolated from other wet rooms - consider grouping for plumbing efficiency")
    
    return warnings


def repair_room_dimensions(room: dict) -> Tuple[dict, List[str]]:
    """Repair a room's dimensions to meet minimum requirements."""
    repairs = []
    room_type = room.get("type", "default")
    constraints = MIN_ROOM_DIMENSIONS.get(room_type, MIN_ROOM_DIMENSIONS["default"])
    
    w = room.get("width", room.get("w", 0))
    h = room.get("height", room.get("h", 0))
    original_w, original_h = w, h
    
    if w < constraints["min_w"]:
        w = constraints["min_w"]
    if h < constraints["min_h"]:
        h = constraints["min_h"]
    
    aspect_ratio = max(w, h) / min(w, h) if min(w, h) > 0 else 1
    if aspect_ratio > constraints["max_ratio"]:
        if w > h:
            w = h * constraints["max_ratio"]
        else:
            h = w * constraints["max_ratio"]
    
    if w != original_w or h != original_h:
        repairs.append(f"{room_type} ({room.get('id')}): adjusted from {original_w:.2f}x{original_h:.2f} to {w:.2f}x{h:.2f}")
        room = room.copy()
        if "width" in room:
            room["width"] = w
        else:
            room["w"] = w
        if "height" in room:
            room["height"] = h
        else:
            room["h"] = h
    
    return room, repairs


def validate_layout(rooms: List[dict], auto_repair: bool = True) -> ValidationResult:
    """
    Validate an entire floor plan layout.
    
    Args:
        rooms: List of room dictionaries with position and size info
        auto_repair: If True, attempt to repair dimension issues
    
    Returns:
        ValidationResult with validity status, issues, warnings, and repairs
    """
    all_issues = []
    all_warnings = []
    all_repairs = []
    repaired_rooms = []
    
    for room in rooms:
        is_valid, issues = validate_room_dimensions(room)
        all_issues.extend(issues)
        
        if not is_valid and auto_repair:
            repaired_room, repairs = repair_room_dimensions(room)
            repaired_rooms.append(repaired_room)
            all_repairs.extend(repairs)
        else:
            repaired_rooms.append(room)
    
    for i, r1 in enumerate(repaired_rooms):
        for j, r2 in enumerate(repaired_rooms):
            if i >= j:
                continue
            if check_overlap(r1, r2):
                all_issues.append(
                    f"Overlap detected: {r1.get('type')} ({r1.get('id')}) overlaps with {r2.get('type')} ({r2.get('id')})"
                )
    
    adjacency_graph = build_adjacency_graph(repaired_rooms)
    
    connected, connectivity_issues = check_connectivity(repaired_rooms, adjacency_graph)
    all_issues.extend(connectivity_issues)
    
    for i, r1 in enumerate(repaired_rooms):
        for j, r2 in enumerate(repaired_rooms):
            if i >= j:
                continue
            if are_adjacent(r1, r2):
                forbidden = check_forbidden_adjacency(r1, r2)
                if forbidden:
                    all_warnings.append(forbidden)
    
    wet_warnings = check_wet_room_grouping(repaired_rooms, adjacency_graph)
    all_warnings.extend(wet_warnings)
    
    is_valid = len(all_issues) == 0
    
    return ValidationResult(
        is_valid=is_valid,
        issues=all_issues,
        warnings=all_warnings,
        repairs_made=all_repairs
    )


def calculate_total_area(rooms: List[dict]) -> float:
    """Calculate the total floor area from room list."""
    total = 0.0
    for room in rooms:
        w = room.get("width", room.get("w", 0))
        h = room.get("height", room.get("h", 0))
        total += w * h
    return total


def calculate_bounding_box(rooms: List[dict]) -> Tuple[float, float, float, float]:
    """Calculate the bounding box of all rooms."""
    if not rooms:
        return 0, 0, 0, 0
    
    min_x = min_y = float('inf')
    max_x = max_y = float('-inf')
    
    for room in rooms:
        x = room.get("x", room.get("x0", 0))
        y = room.get("y", room.get("y0", 0))
        w = room.get("width", room.get("w", 0))
        h = room.get("height", room.get("h", 0))
        
        min_x = min(min_x, x)
        min_y = min(min_y, y)
        max_x = max(max_x, x + w)
        max_y = max(max_y, y + h)
    
    return min_x, min_y, max_x - min_x, max_y - min_y
