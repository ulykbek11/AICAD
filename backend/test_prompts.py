import sys
import os
import pickle
import math

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from services.llm_service import generate_room_graph_pkl
from services.topology_agent import classify_rooms, assign_floors
from services.layout_algorithm import place_rooms_by_zone
from models.schemas import Room

prompts = [
    "2-этажный дом, 3 спальни, кухня-гостиная, 2 санузла",
    "Одноэтажный дом, 4 комнаты, гараж",
    "3 этажа, 6 спален, большая гостиная"
]

def test():
    for i, p in enumerate(prompts):
        print(f"\n--- TEST {i+1} ---")
        print(f"Prompt: {p}")
        try:
            # 1. Generate room graph
            pkl = generate_room_graph_pkl(p)
            room_graph = pickle.loads(pkl)
            raw_rooms = room_graph.get("rooms", [])
            print(f"Num floors specified in graph: {room_graph.get('num_floors')}")
            
            # convert to Room models
            rooms = []
            for j, d in enumerate(raw_rooms):
                rooms.append(Room(
                    id=str(d.get("id") or f"r{j+1}"),
                    type=str(d.get("type") or "living_room"),
                    area_m2=float(d.get("area_m2") or d.get("area") or 12.0),
                    min_width=float(d.get("min_width") or 2.4),
                    adjacent_to=d.get("adjacent_to") or [],
                ))
            
            # 2. Topology / zoning
            num_floors = room_graph.get("num_floors")
            if num_floors is None:
                if "2-этажный" in p: num_floors = 2
                elif "3 этажа" in p: num_floors = 3
                else: num_floors = 1
            num_floors = int(num_floors)
            classified = classify_rooms(rooms)
            floors = assign_floors(classified, num_floors)
            
            for f_num, r_list in floors.items():
                print(f" Floor {f_num}: {[r.type for r in r_list]}")
                
            # 3. Layout
            total_area = float(room_graph.get("total_area_m2") or 100)
            building_w = math.sqrt(total_area * 1.5)
            building_h = math.sqrt(total_area / 1.5)
            
            all_rooms = []
            for f_num, f_rooms in floors.items():
                placed = place_rooms_by_zone(f_rooms, building_w, building_h, room_graph.get("shape", "rectangular"), num_floors)
                all_rooms.extend(placed)
                
            stairs = [r for r in all_rooms if r.type == 'staircase']
            for s in stairs:
                print(f" Staircase at x={s.x}, y={s.y} (floor implied)")
                
        except Exception as e:
            print(f"Error: {e}")

if __name__ == '__main__':
    test()
