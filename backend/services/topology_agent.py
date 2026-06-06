""" 
topology_agent.py — Zone-Aware Topology System 
Заменяет старый Squarified Treemap подход. 
""" 
import networkx as nx 
from typing import Optional 
from models.schemas import Room, RoomWithCoords, ZoneType 

# ───────────────────────────────────────── 
# КОНСТАНТЫ: Карта зон и минимальных размеров 
# ───────────────────────────────────────── 

ZONE_MAP = { 
    "living_room":     {"zone": "public",      "priority": 1, "min_dim": (3.5, 4.0)}, 
    "dining_room":     {"zone": "public",      "priority": 2, "min_dim": (3.0, 3.5)}, 
    "hallway":         {"zone": "public",      "priority": 0, "min_dim": (1.2, 3.0)}, 
    "entrance":        {"zone": "public",      "priority": 0, "min_dim": (1.5, 2.0)}, 
    "kitchen":         {"zone": "service",     "priority": 1, "min_dim": (3.0, 3.5)}, 
    "bathroom_guest":  {"zone": "service",     "priority": 2, "min_dim": (1.8, 2.2)}, 
    "storage":         {"zone": "service",     "priority": 3, "min_dim": (1.5, 2.0)}, 
    "garage":          {"zone": "service",     "priority": 4, "min_dim": (3.0, 5.5)}, 
    "boiler_room":     {"zone": "service",     "priority": 4, "min_dim": (2.0, 2.5)}, 
    "bedroom":         {"zone": "private",     "priority": 1, "min_dim": (3.0, 3.5)}, 
    "master_bedroom":  {"zone": "private",     "priority": 0, "min_dim": (4.0, 4.5)}, 
    "bathroom":        {"zone": "private",     "priority": 1, "min_dim": (1.8, 2.2)}, 
    "children_room":   {"zone": "private",     "priority": 2, "min_dim": (3.0, 3.5)}, 
    "wardrobe":        {"zone": "private",     "priority": 2, "min_dim": (1.5, 2.0)}, 
    "study":           {"zone": "private",     "priority": 2, "min_dim": (2.5, 3.0)}, 
    "staircase":       {"zone": "circulation", "priority": -1,"min_dim": (2.5, 3.0)}, 
    "corridor":        {"zone": "circulation", "priority": -1,"min_dim": (1.2, 1.2)}, 
} 

# Запрещённые пары смежности 
FORBIDDEN_ADJACENCY = { 
    frozenset({"kitchen", "bathroom"}), 
    frozenset({"kitchen", "bathroom_guest"}), 
    frozenset({"bedroom", "kitchen"}), 
    frozenset({"master_bedroom", "kitchen"}), 
    frozenset({"bedroom", "entrance"}), 
    frozenset({"dining_room", "bathroom"}), 
    frozenset({"dining_room", "bathroom_guest"}), 
    frozenset({"living_room", "bathroom"}), 
} 

# Минимальные строительные размеры (метры) 
MIN_DIMENSIONS = { 
    "bedroom":        (3.0, 3.0), 
    "master_bedroom": (3.5, 4.0), 
    "living_room":    (4.0, 4.5), 
    "kitchen":        (2.5, 3.0), 
    "bathroom":       (1.8, 2.2), 
    "bathroom_guest": (1.5, 1.8), 
    "corridor":       (1.2, 3.0), 
    "staircase":      (2.5, 3.0), 
    "entrance":       (1.5, 2.0), 
    "dining_room":    (3.0, 3.5), 
    "children_room":  (3.0, 3.0), 
    "storage":        (1.5, 1.5), 
    "garage":         (3.0, 5.5), 
    "wardrobe":       (1.5, 2.0), 
    "study":          (2.5, 3.0), 
} 


# ───────────────────────────────────────── 
# ОСНОВНЫЕ ФУНКЦИИ 
# ───────────────────────────────────────── 

def classify_rooms(rooms: list[Room]) -> dict[str, list[Room]]: 
    """Распределяет комнаты по функциональным зонам.""" 
    classified: dict[str, list[Room]] = { 
        "public": [], "service": [], "private": [], "circulation": [] 
    } 

    for room in rooms: 
        info = ZONE_MAP.get(room.type, {}) 
        zone = info.get("zone", "public") 
        room.zone = zone 
        classified[zone].append(room) 

    # Автодобавление коридора если нет 
    if not any(r.type in ("corridor", "hallway") for r in rooms): 
        from models.schemas import Room as RoomModel 
        auto_corridor = RoomModel(id="auto_corr", type="corridor", area_m2=6.0, min_width=1.2, zone="circulation") 
        classified["circulation"].append(auto_corridor) 

    return classified 


def assign_floors( 
    classified_rooms: dict[str, list[Room]], 
    num_floors: int 
) -> dict[int, list[Room]]: 
    """ 
    Правила распределения по этажам: 
    - Этаж 1: public + service + circulation 
    - Этаж 2+: private + circulation (коридор + лестница) 
    - Лестница клонируется на каждый этаж с фиксированной позицией 
    """ 
    from models.schemas import Room as RoomModel 

    floors: dict[int, list[Room]] = {i: [] for i in range(1, num_floors + 1)} 

    # Этаж 1 — общественные и сервисные 
    floors[1].extend(classified_rooms["public"]) 
    floors[1].extend(classified_rooms["service"]) 
    floors[1].extend(classified_rooms["circulation"]) 

    if num_floors == 1: 
        # Одноэтажный — приватные в отдельном крыле 
        floors[1].extend(classified_rooms["private"]) 
    else: 
        # Многоэтажный — приватные на верхних этажах 
        private = classified_rooms["private"] 
        upper_floors = list(range(2, num_floors + 1)) 
        per_floor = max(1, len(private) // len(upper_floors)) 

        for i, floor_num in enumerate(upper_floors): 
            start = i * per_floor 
            end = start + per_floor if floor_num < num_floors else len(private) 
            floors[floor_num].extend(private[start:end]) 

            # Коридор и лестница на каждом верхнем этаже 
            floors[floor_num].append( 
                RoomModel(id=f"auto_corr_{floor_num}", type="corridor", area_m2=6.0, min_width=1.2, floor=floor_num, zone="circulation") 
            ) 

        # Лестница на КАЖДОМ этаже (фиксированная позиция!) 
        for floor_num in range(1, num_floors + 1): 
            floors[floor_num].append( 
                RoomModel( 
                    id=f"staircase_{floor_num}", type="staircase", area_m2=9.0, min_width=2.5,
                    floor=floor_num, zone="circulation", fixed=True 
                ) 
            ) 

    # Проставляем номер этажа всем комнатам 
    for floor_num, rooms in floors.items(): 
        for room in rooms: 
            room.floor = floor_num 

    return floors 


def is_forbidden_adjacency(type1: str, type2: str) -> bool: 
    return frozenset({type1, type2}) in FORBIDDEN_ADJACENCY 


def rooms_are_adjacent( 
    r1: RoomWithCoords, r2: RoomWithCoords, tolerance: float = 0.15 
) -> bool: 
    """Проверяет физическую смежность двух комнат (общая стена > tolerance).""" 
    # Горизонтальное касание 
    h_touch = ( 
        abs((r1.x + r1.width) - r2.x) < tolerance or 
        abs((r2.x + r2.width) - r1.x) < tolerance 
    ) 
    h_overlap = max( 
        0, 
        min(r1.y + r1.height, r2.y + r2.height) - max(r1.y, r2.y) 
    ) 

    # Вертикальное касание 
    v_touch = ( 
        abs((r1.y + r1.height) - r2.y) < tolerance or 
        abs((r2.y + r2.height) - r1.y) < tolerance 
    ) 
    v_overlap = max( 
        0, 
        min(r1.x + r1.width, r2.x + r2.width) - max(r1.x, r2.x) 
    ) 

    return (h_touch and h_overlap > tolerance) or (v_touch and v_overlap > tolerance) 


def ensure_accessibility( 
    rooms: list[RoomWithCoords], 
    corridor: Optional[RoomWithCoords] 
) -> list[RoomWithCoords]: 
    """ 
    BFS-проверка: каждая комната достижима из коридора. 
    Если нет — двигает комнату ближе к коридору. 
    """ 
    if corridor is None or len(rooms) <= 1: 
        return rooms 

    G = nx.Graph() 
    id_map = {id(r): r for r in rooms} 

    for room in rooms: 
        G.add_node(id(room)) 

    for i, r1 in enumerate(rooms): 
        for j, r2 in enumerate(rooms): 
            if i >= j: 
                continue 
            if rooms_are_adjacent(r1, r2): 
                if not is_forbidden_adjacency(r1.type, r2.type): 
                    G.add_edge(id(r1), id(r2)) 

    corridor_id = id(corridor) 
    if corridor_id not in G.nodes: 
        G.add_node(corridor_id) 

    for room in rooms: 
        node = id(room) 
        if node == corridor_id: 
            continue 
        if not nx.has_path(G, corridor_id, node): 
            # Сдвигаем комнату к коридору — простое исправление 
            room.x = corridor.x + corridor.width + 0.1 
            room.y = corridor.y 

    return rooms 


def enforce_minimum_dimensions( 
    rooms: list[RoomWithCoords] 
) -> list[RoomWithCoords]: 
    """Гарантирует соблюдение минимальных строительных норм.""" 
    for room in rooms: 
        if room.fixed: 
            continue 
        min_w, min_h = MIN_DIMENSIONS.get(room.type, (2.0, 2.0)) 
        if room.width < min_w: 
            room.width = min_w 
        if room.height < min_h: 
            room.height = min_h 
    return rooms 
