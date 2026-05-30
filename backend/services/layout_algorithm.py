"""
Layout Algorithm — Squarified Treemap approach based on Marson & Musse (2010).
Automatic Real-Time Generation of Floor Plans Based on Squarified Treemaps.
"""

import math
import logging
import squarify
from models.schemas import RoomWithCoords

logger = logging.getLogger(__name__)

WALL = 0.15

def layout_by_topology(rooms: list, topology: dict, offset_x: float = 0.0, offset_y: float = 0.0) -> list[RoomWithCoords]:
    room_list = []
    for r in rooms:
        if isinstance(r, dict):
            room_list.append(r)
        else:
            room_list.append({"id": r.id, "type": r.type, "area_m2": getattr(r, "area_m2", 10)})
            
    id_to_room = {r["id"]: r for r in room_list}
    zones = topology.get("zones", {})
    
    social_ids = zones.get("social", [])
    private_ids = zones.get("private", [])
    service_ids = zones.get("service", [])
    hallway_ids = zones.get("hallway", [])
    
    def get_area(rids):
        return sum(id_to_room[rid].get("area_m2", 10) for rid in rids)
        
    area_social = get_area(social_ids)
    area_private = get_area(private_ids)
    area_service = get_area(service_ids)
    
    # ── ШАГ 4: ВХОД / Коридор ──
    # hallway/коридор ВСЕГДА размещается последним по оси Y
    if not hallway_ids:
        hid = "hallway_auto"
        hallway_ids.append(hid)
        id_to_room[hid] = {"id": hid, "type": "hallway", "area_m2": 6.0}
        
    area_hallway = get_area(hallway_ids)
    
    total_area = area_social + area_private + area_service + area_hallway
    if total_area == 0: total_area = 10
    
    # ── ЦЕЛЕВЫЕ ПРОПОРЦИИ ДОМА ──
    target_ratio = 1.5
    W = math.sqrt(total_area * target_ratio)
    H = math.sqrt(total_area / target_ratio)
    
    placed = []
    
    max_ratio = 2.0
    hallway_w = min(W, math.sqrt(area_hallway * max_ratio)) if area_hallway > 0 else 0
    hallway_h = area_hallway / hallway_w if hallway_w > 0 else 0
    hallway_x = offset_x + (W - hallway_w) / 2
    hallway_y = offset_y + H - hallway_h
    
    for hid in hallway_ids:
        placed.append({
            "id": hid,
            "type": id_to_room[hid]["type"],
            "x": hallway_x,
            "y": hallway_y,
            "w": hallway_w,
            "h": hallway_h
        })
            
    rem_h = H - hallway_h
    
    # ── ШАГ 2: ФУНКЦИОНАЛЬНЫЕ ЗОНЫ ──
    active_zones = []
    if area_service > 0: active_zones.append(("service", service_ids, area_service))
    if area_social > 0: active_zones.append(("social", social_ids, area_social))
    if area_private > 0: active_zones.append(("private", private_ids, area_private))
    
    active_area = area_service + area_social + area_private
    
    zx = offset_x
    zone_rects = {}
    for zname, zids, zarea in active_zones:
        zw = W * (zarea / active_area) if active_area > 0 else 0
        zone_rects[zname] = (zx, offset_y, zw, rem_h)
        zx += zw
        
    # ── ШАГ 1: SQUARIFIED TREEMAP ──
    for zname, zids, zarea in active_zones:
        zx, zy, zw, zh = zone_rects[zname]
        if not zids: continue
        
        zrooms = [id_to_room[rid] for rid in zids]
        zrooms.sort(key=lambda r: r.get("area_m2", 10), reverse=True)
        
        sizes = [r.get("area_m2", 10) for r in zrooms]
        sum_sizes = sum(sizes)
        if sum_sizes > 0:
            sizes = [s * (zw * zh / sum_sizes) for s in sizes]
            
        rects = squarify.squarify(sizes, zx, zy, zw, zh)
        
        for r, rect in zip(zrooms, rects):
            placed.append({
                "id": r["id"],
                "type": r["type"],
                "x": rect["x"],
                "y": rect["y"],
                "w": rect["dx"],
                "h": rect["dy"]
            })
            
    # ── ШАГ 3: BACKBONE / КОРИДОР ──
    lr = next((p for p in placed if p["type"] == "living_room"), None)
    if not lr and placed:
        lr = max(placed, key=lambda p: p["w"] * p["h"])
        
    if lr:
        shared_walls = []
        for i, r1 in enumerate(placed):
            if r1["type"] == "hallway": continue
            for j, r2 in enumerate(placed):
                if i >= j: continue
                if r2["type"] == "hallway": continue
                
                tol = 0.1
                # Vertical shared wall
                if abs(r1["x"] + r1["w"] - r2["x"]) < tol or abs(r2["x"] + r2["w"] - r1["x"]) < tol:
                    y_start = max(r1["y"], r2["y"])
                    y_end = min(r1["y"] + r1["h"], r2["y"] + r2["h"])
                    if y_end - y_start > 1.0:
                        wall_x = r1["x"] + r1["w"] if abs(r1["x"] + r1["w"] - r2["x"]) < tol else r2["x"] + r2["w"]
                        shared_walls.append({
                            "type": "v", "x": wall_x, "y0": y_start, "y1": y_end,
                            "r1": r1, "r2": r2, "len": y_end - y_start
                        })
                # Horizontal shared wall
                if abs(r1["y"] + r1["h"] - r2["y"]) < tol or abs(r2["y"] + r2["h"] - r1["y"]) < tol:
                    x_start = max(r1["x"], r2["x"])
                    x_end = min(r1["x"] + r1["w"], r2["x"] + r2["w"])
                    if x_end - x_start > 1.0:
                        wall_y = r1["y"] + r1["h"] if abs(r1["y"] + r1["h"] - r2["y"]) < tol else r2["y"] + r2["h"]
                        shared_walls.append({
                            "type": "h", "y": wall_y, "x0": x_start, "x1": x_end,
                            "r1": r1, "r2": r2, "len": x_end - x_start
                        })

        covered = {lr["id"]}
        if hallway_ids:
            covered.update(hallway_ids)
            
        backbone_walls = []
        uncovered = {p["id"] for p in placed} - covered
        
        while uncovered:
            candidates = []
            for w in shared_walls:
                c1 = w["r1"]["id"] in covered
                c2 = w["r2"]["id"] in covered
                if c1 != c2:
                    candidates.append(w)
                    
            if not candidates:
                break
                
            best_wall = max(candidates, key=lambda w: w["len"])
            backbone_walls.append(best_wall)
            covered.add(best_wall["r1"]["id"])
            covered.add(best_wall["r2"]["id"])
            uncovered = {p["id"] for p in placed} - covered
            
        for w in backbone_walls:
            r1 = w["r1"]
            r2 = w["r2"]
            if "adjacent_to" not in r1: r1["adjacent_to"] = []
            if "adjacent_to" not in r2: r2["adjacent_to"] = []
            if r2["id"] not in r1["adjacent_to"]: r1["adjacent_to"].append(r2["id"])
            if r1["id"] not in r2["adjacent_to"]: r2["adjacent_to"].append(r1["id"])

    result = []
    for p in placed:
        if p["w"] < 0.5: p["w"] = 0.5
        if p["h"] < 0.5: p["h"] = 0.5
        label = p['type']
        if p['type'] == 'hallway': label = "Коридор"
        result.append(RoomWithCoords(
            id=p["id"],
            type=p["type"],
            x=round(p["x"], 3),
            y=round(p["y"], 3),
            width=round(p["w"], 3),
            height=round(p["h"], 3),
            label=label,
            adjacent_to=p.get("adjacent_to", [])
        ))

    logger.info(f"Layout done: {len(result)} rooms placed via Squarified Treemap")
    return result
