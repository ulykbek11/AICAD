"""
Tests for layout validation service.
"""

import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from services.layout_validator import (
    validate_room_dimensions,
    check_overlap,
    are_adjacent,
    check_forbidden_adjacency,
    build_adjacency_graph,
    check_connectivity,
    validate_layout,
    ValidationResult,
)


class TestRoomDimensions:
    def test_valid_bedroom(self):
        room = {"id": "bed1", "type": "bedroom", "width": 3.5, "height": 3.5}
        is_valid, issues = validate_room_dimensions(room)
        assert is_valid
        assert len(issues) == 0

    def test_bedroom_too_narrow(self):
        room = {"id": "bed1", "type": "bedroom", "width": 2.0, "height": 3.5}
        is_valid, issues = validate_room_dimensions(room)
        assert not is_valid
        assert any("width" in issue for issue in issues)

    def test_bedroom_bad_aspect_ratio(self):
        room = {"id": "bed1", "type": "bedroom", "width": 2.7, "height": 8.0}
        is_valid, issues = validate_room_dimensions(room)
        assert not is_valid
        assert any("aspect ratio" in issue for issue in issues)

    def test_valid_bathroom(self):
        room = {"id": "bath1", "type": "bathroom", "width": 2.0, "height": 2.5}
        is_valid, issues = validate_room_dimensions(room)
        assert is_valid

    def test_hallway_can_be_narrow(self):
        room = {"id": "hall1", "type": "hallway", "width": 1.2, "height": 8.0}
        is_valid, issues = validate_room_dimensions(room)
        assert is_valid

    def test_zero_dimensions_invalid(self):
        room = {"id": "r1", "type": "bedroom", "width": 0, "height": 3.0}
        is_valid, issues = validate_room_dimensions(room)
        assert not is_valid


class TestOverlap:
    def test_no_overlap(self):
        r1 = {"x": 0, "y": 0, "width": 3, "height": 3}
        r2 = {"x": 5, "y": 0, "width": 3, "height": 3}
        assert not check_overlap(r1, r2)

    def test_overlap_detected(self):
        r1 = {"x": 0, "y": 0, "width": 3, "height": 3}
        r2 = {"x": 2, "y": 0, "width": 3, "height": 3}
        assert check_overlap(r1, r2)

    def test_adjacent_rooms_no_overlap(self):
        r1 = {"x": 0, "y": 0, "width": 3, "height": 3}
        r2 = {"x": 3, "y": 0, "width": 3, "height": 3}
        assert not check_overlap(r1, r2)

    def test_bbox_format(self):
        r1 = {"x0": 0, "y0": 0, "x1": 3, "y1": 3}
        r2 = {"x0": 5, "y0": 0, "x1": 8, "y1": 3}
        assert not check_overlap(r1, r2)


class TestAdjacency:
    def test_horizontal_adjacency(self):
        r1 = {"x": 0, "y": 0, "width": 3, "height": 3}
        r2 = {"x": 3, "y": 0, "width": 3, "height": 3}
        assert are_adjacent(r1, r2)

    def test_vertical_adjacency(self):
        r1 = {"x": 0, "y": 0, "width": 3, "height": 3}
        r2 = {"x": 0, "y": 3, "width": 3, "height": 3}
        assert are_adjacent(r1, r2)

    def test_no_adjacency(self):
        r1 = {"x": 0, "y": 0, "width": 3, "height": 3}
        r2 = {"x": 5, "y": 5, "width": 3, "height": 3}
        assert not are_adjacent(r1, r2)

    def test_partial_wall_sharing(self):
        r1 = {"x": 0, "y": 0, "width": 3, "height": 4}
        r2 = {"x": 3, "y": 1, "width": 3, "height": 2}
        assert are_adjacent(r1, r2)


class TestForbiddenAdjacency:
    def test_kitchen_bathroom_forbidden(self):
        r1 = {"type": "kitchen"}
        r2 = {"type": "bathroom"}
        result = check_forbidden_adjacency(r1, r2)
        assert result is not None
        assert "Forbidden" in result

    def test_bedroom_kitchen_forbidden(self):
        r1 = {"type": "bedroom"}
        r2 = {"type": "kitchen"}
        result = check_forbidden_adjacency(r1, r2)
        assert result is not None

    def test_bedroom_hallway_allowed(self):
        r1 = {"type": "bedroom"}
        r2 = {"type": "hallway"}
        result = check_forbidden_adjacency(r1, r2)
        assert result is None

    def test_living_kitchen_allowed(self):
        r1 = {"type": "living_room"}
        r2 = {"type": "kitchen"}
        result = check_forbidden_adjacency(r1, r2)
        assert result is None


class TestConnectivity:
    def test_all_connected_to_hallway(self):
        rooms = [
            {"id": "hall", "type": "hallway", "x": 0, "y": 0, "width": 8, "height": 1.2},
            {"id": "bed1", "type": "bedroom", "x": 0, "y": 1.2, "width": 4, "height": 3},
            {"id": "bed2", "type": "bedroom", "x": 4, "y": 1.2, "width": 4, "height": 3},
        ]
        graph = build_adjacency_graph(rooms)
        connected, issues = check_connectivity(rooms, graph)
        assert connected
        assert len(issues) == 0

    def test_isolated_room_detected(self):
        rooms = [
            {"id": "hall", "type": "hallway", "x": 0, "y": 0, "width": 4, "height": 1.2},
            {"id": "bed1", "type": "bedroom", "x": 0, "y": 1.2, "width": 4, "height": 3},
            {"id": "isolated", "type": "bedroom", "x": 10, "y": 10, "width": 4, "height": 3},
        ]
        graph = build_adjacency_graph(rooms)
        connected, issues = check_connectivity(rooms, graph)
        assert not connected
        assert len(issues) > 0
        assert any("isolated" in issue for issue in issues)

    def test_no_hallway_warning(self):
        rooms = [
            {"id": "bed1", "type": "bedroom", "x": 0, "y": 0, "width": 4, "height": 3},
            {"id": "bed2", "type": "bedroom", "x": 4, "y": 0, "width": 4, "height": 3},
        ]
        graph = build_adjacency_graph(rooms)
        connected, issues = check_connectivity(rooms, graph)
        assert not connected
        assert any("hallway" in issue.lower() for issue in issues)


class TestValidateLayout:
    def test_valid_simple_layout(self):
        rooms = [
            {"id": "hall", "type": "hallway", "x": 0, "y": 0, "width": 10, "height": 1.2},
            {"id": "living", "type": "living_room", "x": 0, "y": 1.2, "width": 5, "height": 4},
            {"id": "kitchen", "type": "kitchen", "x": 5, "y": 1.2, "width": 3, "height": 3},
            {"id": "bed1", "type": "bedroom", "x": 8, "y": 1.2, "width": 3, "height": 3},
        ]
        result = validate_layout(rooms)
        assert isinstance(result, ValidationResult)
        assert result.is_valid

    def test_overlap_detected(self):
        rooms = [
            {"id": "hall", "type": "hallway", "x": 0, "y": 0, "width": 6, "height": 1.2},
            {"id": "r1", "type": "bedroom", "x": 0, "y": 1.2, "width": 4, "height": 3},
            {"id": "r2", "type": "bedroom", "x": 2, "y": 1.2, "width": 4, "height": 3},
        ]
        result = validate_layout(rooms)
        assert not result.is_valid
        assert any("Overlap" in issue for issue in result.issues)

    def test_auto_repair_dimensions(self):
        rooms = [
            {"id": "hall", "type": "hallway", "x": 0, "y": 0, "width": 6, "height": 1.2},
            {"id": "tiny", "type": "bedroom", "x": 0, "y": 1.2, "width": 2.0, "height": 2.0},
        ]
        result = validate_layout(rooms, auto_repair=True)
        assert len(result.repairs_made) > 0
        assert any("adjusted" in repair for repair in result.repairs_made)

    def test_forbidden_adjacency_warning(self):
        rooms = [
            {"id": "hall", "type": "hallway", "x": 0, "y": 0, "width": 6, "height": 1.2},
            {"id": "kitchen", "type": "kitchen", "x": 0, "y": 1.2, "width": 3, "height": 3},
            {"id": "bathroom", "type": "bathroom", "x": 3, "y": 1.2, "width": 2, "height": 3},
        ]
        result = validate_layout(rooms)
        assert any("Forbidden" in warning for warning in result.warnings)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
