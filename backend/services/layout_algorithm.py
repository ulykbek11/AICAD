import math
import logging
from models.schemas import RoomWithCoords

logger = logging.getLogger(__name__)

WALL_THICKNESS = 0.15

GRID_POSITIONS = {
    "top_left": (0, 0),
    "center_top": (1, 0),
    "top": (1, 0),
    "top_right": (2, 0),
    "left": (0, 1),
    "center": (1, 1),
    "right": (2, 1),
    "bottom_left": (0, 2),
    "center_bottom": (1, 2),
    "bottom": (1, 2),
    "bottom_right": (2, 2)
}

def get_dimensions(room_type, area):
    min_dims = {
        "bathroom": (1.8, 2.2),
        "toilet": (1.8, 2.2),
        "bedroom": (2.8, 3.0),
        "kitchen": (2.5, 2.5),
        "hallway": (1.2, 1.5)
    }
    w, h = min_dims.get(room_type, (3.0, 3.0))
    if w * h < area:
        scale = math.sqrt(area / (w * h))
        w *= scale
        h *= scale
    return w, h

def bounds(room):
    return (room.x, room.y, room.x + room.width, room.y + room.height)

def is_overlap(r1, r2):
    return not (r1.x + r1.width + WALL_THICKNESS <= r2.x or 
                r2.x + r2.width + WALL_THICKNESS <= r1.x or 
                r1.y + r1.height + WALL_THICKNESS <= r2.y or 
                r2.y + r2.height + WALL_THICKNESS <= r1.y)

def resolve_overlaps(rooms):
    for _ in range(15): # Max iterations
        overlapped = False
        for i, r1 in enumerate(rooms):
            for j, r2 in enumerate(rooms):
                if i != j and is_overlap(r1, r2):
                    overlapped = True
                    # Сдвинуть вправо
                    r2.x = r1.x + r1.width + WALL_THICKNESS
        if not overlapped:
            break

def align_adjacent(rooms, adjacency):
    # Упрощенная логика прилегания для смежных комнат
    room_map = {r.id: r for r in rooms}
    for pair in adjacency:
        if pair[0] in room_map and pair[1] in room_map:
            r1 = room_map[pair[0]]
            r2 = room_map[pair[1]]
            
            gap_x = r2.x - (r1.x + r1.width)
            if gap_x > WALL_THICKNESS:
                # Если они по горизонтали слишком далеко и на одной линии по вертикали
                if abs(r1.y - r2.y) < max(r1.height, r2.height) / 2:
                    r2.x = r1.x + r1.width + WALL_THICKNESS
                    resolve_overlaps(rooms)

def layout_by_topology(rooms, topology, offset_x=0.0, offset_y=0.0):
    rooms_dict = {r["id"] if isinstance(r, dict) else r.id: r for r in rooms}
    result = []
    
    zone_positions = topology.get("zone_positions", {})
    zones = topology.get("zones", {})
    
    logger.info("Начинаем расстановку по топологии")
    
    # Подготавливаем размеры комнат
    room_dims = {}
    for rid, r_data in rooms_dict.items():
        is_dict = isinstance(r_data, dict)
        rtype = r_data.get("type", "unknown") if is_dict else r_data.type
        rarea = r_data.get("area_m2", 10.0) if is_dict else r_data.area_m2
        w, h = get_dimensions(rtype, rarea)
        room_dims[rid] = (rtype, w, h)
        
    # 1. Для каждой зоны определить (col, row), ширину и высоту
    zone_metrics = {}
    for zone_name, room_ids in zones.items():
        valid_rids = [rid for rid in room_ids if rid in rooms_dict]
        if not valid_rids:
            continue
            
        z_width = 0.0
        z_height = 0.0
        
        # Вычисляем суммарную площадь комнат зоны для определения ширины ряда
        total_area = sum((room_dims[rid][1] * room_dims[rid][2]) for rid in valid_rids)
        max_row_width = math.sqrt(total_area) * 1.2 if total_area > 0 else 10.0
        
        current_w = 0.0
        current_h = 0.0
        
        for rid in valid_rids:
            _, w, h = room_dims[rid]
            
            if current_w + w > max_row_width and current_w > 0:
                # Переход на новую строку внутри зоны
                z_width = max(z_width, current_w)
                z_height += current_h + WALL_THICKNESS
                current_w = 0.0
                current_h = 0.0
                
            current_w += w + WALL_THICKNESS
            current_h = max(current_h, h)
            
        z_width = max(z_width, current_w - (WALL_THICKNESS if current_w > 0 else 0))
        z_height += current_h
            
        pos_name = zone_positions.get(zone_name, "center")
        col, row = GRID_POSITIONS.get(pos_name, (1, 1))
        zone_metrics[zone_name] = {
            "col": col,
            "row": row,
            "width": z_width,
            "height": z_height,
            "rooms": valid_rids
        }
        
    # 2 и 3. Найти максимальную ширину колонок и высоту рядов
    col_widths = {0: 0.0, 1: 0.0, 2: 0.0}
    row_heights = {0: 0.0, 1: 0.0, 2: 0.0}
    
    for zm in zone_metrics.values():
        col, row = zm["col"], zm["row"]
        if zm["width"] > col_widths[col]:
            col_widths[col] = zm["width"]
        if zm["height"] > row_heights[row]:
            row_heights[row] = zm["height"]
            
    # 4 и 5. Вычислить абсолютный x и y
    col_x = {}
    current_col_x = offset_x
    for i in range(3):
        col_x[i] = current_col_x
        if col_widths[i] > 0.0:
            current_col_x += col_widths[i] + WALL_THICKNESS

    row_y = {}
    current_row_y = offset_y
    for i in range(3):
        row_y[i] = current_row_y
        if row_heights[i] > 0.0:
            current_row_y += row_heights[i] + WALL_THICKNESS
    
    zone_grid = topology.get("zone_grid", "Not found")
    logger.info(f"topology zones: {topology.get('zones')}") 
    logger.info(f"zone_positions: {topology.get('zone_positions')}") 
    logger.info(f"zone_grid: {zone_grid}") 
    logger.info(f"col_x: {col_x}") 
    logger.info(f"row_y: {row_y}") 

    # 6. Расставляем комнаты
    for zone_name, zm in zone_metrics.items():
        col, row = zm["col"], zm["row"]
        
        current_x = col_x[col]
        start_y = row_y[row]
        
        # Получаем максимальную ширину зоны для переноса строки
        max_row_width = zm["width"]
        
        row_max_h = 0.0
        current_w = 0.0
        
        for rid in zm["rooms"]:
            rtype, w, h = room_dims[rid]
            
            # Если комната не помещается в текущий ряд (и ряд не пустой)
            if current_w + w > max_row_width and current_w > 0:
                current_x = col_x[col]  # Возвращаемся в начало колонки
                start_y += row_max_h + WALL_THICKNESS  # Переходим на следующий ряд
                current_w = 0.0
                row_max_h = 0.0
            
            result.append(RoomWithCoords(
                id=rid,
                type=rtype,
                x=round(current_x, 3),
                y=round(start_y, 3),
                width=round(w, 3),
                height=round(h, 3),
                label=f"{rtype} ({rid})"
            ))
            
            # Смещение внутри зоны (чтобы комнаты одной зоны не накладывались)
            current_x += w + WALL_THICKNESS
            current_w += w + WALL_THICKNESS
            row_max_h = max(row_max_h, h)
            
    logger.info(f"Расстановка завершена, комнат: {len(result)}")
    
    logger.info("=== ФИНАЛЬНЫЕ КООРДИНАТЫ КОМНАТ ===") 
    for room in result: 
        logger.info( 
            f"{room.type}: x={room.x} y={room.y} " 
            f"w={room.width} h={room.height}" 
        ) 

    return result
