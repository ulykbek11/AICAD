"""
Layout Algorithm — Architectural Parametric Layout based on normalized shapes (RECT, L, U, T).
Enforces functional zones, clusters wet rooms, ensures hallway access, and avoids transit bedrooms.
"""

import math
import logging
from models.schemas import RoomWithCoords

logger = logging.getLogger(__name__)

# Минимальные габариты для помещений (согласно Своду Правил)
MIN_DIMENSIONS = {
    "bedroom": {"w": 2.4, "h": 2.4},
    "bedroom_2": {"w": 2.4, "h": 2.4},
    "bedroom_3": {"w": 2.4, "h": 2.4},
    "office": {"w": 2.4, "h": 2.4},
    "guest_room": {"w": 2.4, "h": 2.4},
    "study": {"w": 2.4, "h": 2.4},
    "living_room": {"w": 3.0, "h": 3.0},
    "dining_room": {"w": 2.4, "h": 2.4},
    "kitchen": {"w": 2.7, "h": 2.4},
    "bathroom": {"w": 1.8, "h": 1.8},
    "bathroom_2": {"w": 1.8, "h": 1.8},
    "toilet": {"w": 0.9, "h": 1.2},
    "guest_wc": {"w": 0.9, "h": 1.2},
    "hallway": {"w": 1.2, "h": 1.2},
    "boiler_room": {"w": 2.0, "h": 2.0},
    "tambour": {"w": 1.4, "h": 1.4},
    "garage": {"w": 3.0, "h": 5.0},
    "balcony": {"w": 1.2, "h": 2.0},
}

ROOM_LABELS_RU = {
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
    "boiler_room": "Котельная",
    "tambour": "Тамбур",
    "guest_room": "Гостевая",
    "study": "Кабинет",
    "guest_wc": "Гостевой санузел",
}

def layout_by_topology(rooms: list, topology: dict, offset_x: float = 0.0, offset_y: float = 0.0, shape: str = "rectangular") -> list[RoomWithCoords]:
    logger.info(f"Starting layout by topology. Shape={shape}, rooms_count={len(rooms)}")
    
    room_list = []
    for r in rooms:
        if isinstance(r, dict):
            room_list.append(r.copy())
        else:
            room_list.append({
                "id": r.id, 
                "type": r.type, 
                "area_m2": getattr(r, "area_m2", 10),
                "adjacent_to": getattr(r, "adjacent_to", [])
            })

    # Предотвращение отсутствия ID
    for i, r in enumerate(room_list):
        if not r.get("id"):
            r["id"] = f"room_{i}"
        if not r.get("area_m2"):
            r["area_m2"] = 10.0

    # Определение формы
    shape_lower = str(shape).lower()
    
    if "l" in shape_lower:
        return _layout_l_shape(room_list, offset_x, offset_y)
    elif "u" in shape_lower:
        return _layout_u_shape(room_list, offset_x, offset_y)
    elif "t" in shape_lower:
        return _layout_t_shape(room_list, offset_x, offset_y)
    else:
        return _layout_rectangular(room_list, offset_x, offset_y)

def _layout_rectangular(rooms: list, offset_x: float, offset_y: float) -> list[RoomWithCoords]:
    # Разделение комнат
    # Top Row: Приватные комнаты + Санузлы
    # Bottom Row: Активные зоны + Кухня
    # Middle: Коридор
    top_types = ("bedroom", "bedroom_2", "bedroom_3", "office", "guest_room", "study", "bathroom", "bathroom_2", "toilet", "guest_wc")
    
    # Ищем коридор
    hallway_rooms = [r for r in rooms if r["type"] == "hallway"]
    if hallway_rooms:
        hallway_room = hallway_rooms[0]
        other_rooms = [r for r in rooms if r["id"] != hallway_room["id"]]
    else:
        hallway_room = {"id": "hallway_auto", "type": "hallway", "area_m2": 8.0}
        other_rooms = rooms

    R_top = [r for r in other_rooms if r["type"] in top_types]
    R_bottom = [r for r in other_rooms if r["type"] not in top_types]

    # Сортировка для мокрых зон (санузлы слева, спальни справа)
    def top_sort_key(r):
        t = r["type"]
        if t in ("toilet", "guest_wc"): return 0
        if t in ("bathroom", "bathroom_2"): return 1
        return 2
    R_top.sort(key=top_sort_key)

    # Сортировка нижнего ряда (кухня слева, рядом с санузлами)
    def bottom_sort_key(r):
        t = r["type"]
        if t == "kitchen": return 0
        if t == "dining_room": return 1
        if t == "living_room": return 2
        return 3
    R_bottom.sort(key=bottom_sort_key)

    # Расчет высот рядов
    area_top = sum(r["area_m2"] for r in R_top)
    area_bottom = sum(r["area_m2"] for r in R_bottom)
    total_area = area_top + area_bottom + hallway_room["area_m2"]

    # Целевой размер
    ratio = 1.5
    W = math.sqrt(total_area * ratio)
    H = math.sqrt(total_area / ratio)

    hallway_h = 1.2
    H_rooms = H - hallway_h

    if R_top and R_bottom:
        top_h = H_rooms * (area_top / (area_top + area_bottom))
        bottom_h = H_rooms * (area_bottom / (area_top + area_bottom))
        top_h = max(top_h, 2.5)
        bottom_h = max(bottom_h, 2.5)
    elif R_top:
        top_h = max(H_rooms, 2.5)
        bottom_h = 0.0
    else:
        top_h = 0.0
        bottom_h = max(H_rooms, 2.5)

    # Вычисляем минимальные ширины
    w_raw_top = [max(r["area_m2"] / top_h, MIN_DIMENSIONS.get(r["type"], {}).get("w", 1.0)) for r in R_top] if top_h > 0 else []
    w_raw_bottom = [max(r["area_m2"] / bottom_h, MIN_DIMENSIONS.get(r["type"], {}).get("w", 1.0)) for r in R_bottom] if bottom_h > 0 else []

    W_min_top = sum(w_raw_top)
    W_min_bottom = sum(w_raw_bottom)
    W_actual = max(W, W_min_top, W_min_bottom, 8.0)

    # Масштабируем ширины
    placed = []
    
    # Размещение верхнего ряда
    if R_top:
        x_curr = offset_x
        for r, w_r in zip(R_top, w_raw_top):
            w_act = W_actual * (w_r / W_min_top) if W_min_top > 0 else W_actual
            placed.append({
                "id": r["id"], "type": r["type"],
                "x": x_curr, "y": offset_y, "w": w_act, "h": top_h
            })
            x_curr += w_act

    # Размещение коридора
    hall_y = offset_y + top_h if R_top else offset_y
    placed.append({
        "id": hallway_room["id"], "type": "hallway",
        "x": offset_x, "y": hall_y, "w": W_actual, "h": hallway_h
    })

    # Размещение нижнего ряда
    if R_bottom:
        x_curr = offset_x
        bottom_y = hall_y + hallway_h
        for r, w_r in zip(R_bottom, w_raw_bottom):
            w_act = W_actual * (w_r / W_min_bottom) if W_min_bottom > 0 else W_actual
            placed.append({
                "id": r["id"], "type": r["type"],
                "x": x_curr, "y": bottom_y, "w": w_act, "h": bottom_h
            })
            x_curr += w_act

    return _build_result(placed)

def _layout_l_shape(rooms: list, offset_x: float, offset_y: float) -> list[RoomWithCoords]:
    # L-образная форма:
    # Главный корпус (active): Кухня, Гостиная, Столовая, Гараж
    # Выступающее крыло (quiet): Спальни, Санузлы
    top_types = ("bedroom", "bedroom_2", "bedroom_3", "office", "guest_room", "study", "bathroom", "bathroom_2", "toilet", "guest_wc")
    
    R_active = [r for r in rooms if r["type"] not in top_types and r["type"] != "hallway"]
    R_quiet = [r for r in rooms if r["type"] in top_types]
    
    # Если одна из зон пуста — откатываемся на RECT
    if not R_active or not R_quiet:
        return _layout_rectangular(rooms, offset_x, offset_y)

    # Сортировка
    R_quiet.sort(key=lambda r: 0 if r["type"] in ("toilet", "guest_wc", "bathroom", "bathroom_2") else 1)
    R_active.sort(key=lambda r: 0 if r["type"] == "kitchen" else 1)

    # 1. Главный корпус (Active)
    H_main = 3.0
    w_raw_active = [max(r["area_m2"] / H_main, MIN_DIMENSIONS.get(r["type"], {}).get("w", 1.0)) for r in R_active]
    W_main = max(sum(w_raw_active), 7.0)

    placed = []
    x_curr = offset_x
    for r, w_r in zip(R_active, w_raw_active):
        w_act = W_main * (w_r / sum(w_raw_active))
        placed.append({
            "id": r["id"], "type": r["type"],
            "x": x_curr, "y": offset_y, "w": w_act, "h": H_main
        })
        x_curr += w_act

    # Главный горизонтальный коридор
    placed.append({
        "id": "hallway_main", "type": "hallway",
        "x": offset_x, "y": offset_y + H_main, "w": W_main, "h": 1.2
    })

    # 2. Выступающее крыло (Quiet)
    # Ширина крыла фиксирована 5.0м
    W_wing = 5.0
    # Под спальни выделяем 3.8м, под коридор — 1.2м
    W_wing_rooms = 3.8
    W_wing_hall = 1.2

    h_raw_quiet = [max(r["area_m2"] / W_wing_rooms, MIN_DIMENSIONS.get(r["type"], {}).get("h", 1.0)) for r in R_quiet]
    H_wing = max(sum(h_raw_quiet), 5.0)

    # Крыло размещаем с правого конца основного корпуса, направляя вниз
    wing_x = offset_x + W_main - W_wing
    wing_y = offset_y + H_main + 1.2

    # Вертикальный коридор крыла
    placed.append({
        "id": "hallway_wing", "type": "hallway",
        "x": wing_x, "y": wing_y, "w": W_wing_hall, "h": H_wing
    })

    # Спальни/санузлы в крыле
    y_curr = wing_y
    for r, h_r in zip(R_quiet, h_raw_quiet):
        h_act = H_wing * (h_r / sum(h_raw_quiet))
        placed.append({
            "id": r["id"], "type": r["type"],
            "x": wing_x + W_wing_hall, "y": y_curr, "w": W_wing_rooms, "h": h_act
        })
        y_curr += h_act

    return _build_result(placed)

def _layout_u_shape(rooms: list, offset_x: float, offset_y: float) -> list[RoomWithCoords]:
    # U-образная форма:
    # Центральный корпус (active): Гостиная, Кухня
    # Крыло А (левое): Мастер-спальня + личный санузел
    # Крыло Б (правое): Детские, кабинет, общий санузел
    top_types = ("bedroom", "bedroom_2", "bedroom_3", "office", "guest_room", "study", "bathroom", "bathroom_2", "toilet", "guest_wc")
    
    R_active = [r for r in rooms if r["type"] not in top_types and r["type"] != "hallway"]
    R_quiet = [r for r in rooms if r["type"] in top_types]

    if not R_active or len(R_quiet) < 2:
        return _layout_rectangular(rooms, offset_x, offset_y)

    # Делим тихие комнаты на два крыла
    WingA_rooms = []
    WingB_rooms = []
    for r in R_quiet:
        if r["type"] in ("bedroom", "bathroom", "bathroom_2") and len(WingA_rooms) < 2:
            WingA_rooms.append(r)
        else:
            WingB_rooms.append(r)

    if not WingA_rooms:
        WingA_rooms.append(R_quiet[0])
        WingB_rooms.extend(R_quiet[1:])

    # 1. Центральный корпус (Active)
    # Ширина двора должна быть не менее 6м, крылья по 5м => Ширина центрального корпуса минимум 16.0м
    W_center = 16.0
    H_center = 3.0

    placed = []
    x_curr = offset_x
    for r in R_active:
        w_act = W_center / len(R_active)
        placed.append({
            "id": r["id"], "type": r["type"],
            "x": x_curr, "y": offset_y, "w": w_act, "h": H_center
        })
        x_curr += w_act

    # Центральный горизонтальный коридор
    placed.append({
        "id": "hallway_main", "type": "hallway",
        "x": offset_x, "y": offset_y + H_center, "w": W_center, "h": 1.2
    })

    # 2. Левое крыло (Wing A)
    # Коридор справа, спальни слева
    wing_y = offset_y + H_center + 1.2
    
    h_raw_a = [max(r["area_m2"] / 3.8, MIN_DIMENSIONS.get(r["type"], {}).get("h", 1.0)) for r in WingA_rooms]
    H_wingA = max(sum(h_raw_a), 5.0)

    placed.append({
        "id": "hallway_wing_a", "type": "hallway",
        "x": offset_x + 3.8, "y": wing_y, "w": 1.2, "h": H_wingA
    })

    y_curr = wing_y
    for r, h_r in zip(WingA_rooms, h_raw_a):
        h_act = H_wingA * (h_r / sum(h_raw_a))
        placed.append({
            "id": r["id"], "type": r["type"],
            "x": offset_x, "y": y_curr, "w": 3.8, "h": h_act
        })
        y_curr += h_act

    # 3. Правое крыло (Wing B)
    # Коридор слева, спальни справа
    h_raw_b = [max(r["area_m2"] / 3.8, MIN_DIMENSIONS.get(r["type"], {}).get("h", 1.0)) for r in WingB_rooms]
    H_wingB = max(sum(h_raw_b), 5.0)

    placed.append({
        "id": "hallway_wing_b", "type": "hallway",
        "x": offset_x + W_center - 5.0, "y": wing_y, "w": 1.2, "h": H_wingB
    })

    y_curr = wing_y
    for r, h_r in zip(WingB_rooms, h_raw_b):
        h_act = H_wingB * (h_r / sum(h_raw_b))
        placed.append({
            "id": r["id"], "type": r["type"],
            "x": offset_x + W_center - 3.8, "y": y_curr, "w": 3.8, "h": h_act
        })
        y_curr += h_act

    return _build_result(placed)

def _layout_t_shape(rooms: list, offset_x: float, offset_y: float) -> list[RoomWithCoords]:
    # Т-образная форма:
    # Перекладина (top): Активные комнаты
    # Ножка (vertical): Тихий блок (спальни, общий санузел)
    top_types = ("bedroom", "bedroom_2", "bedroom_3", "office", "guest_room", "study", "bathroom", "bathroom_2", "toilet", "guest_wc")
    
    R_active = [r for r in rooms if r["type"] not in top_types and r["type"] != "hallway"]
    R_quiet = [r for r in rooms if r["type"] in top_types]

    if not R_active or not R_quiet:
        return _layout_rectangular(rooms, offset_x, offset_y)

    # 1. Перекладина (Active)
    H_cross = 3.0
    w_raw_active = [max(r["area_m2"] / H_cross, MIN_DIMENSIONS.get(r["type"], {}).get("w", 1.0)) for r in R_active]
    W_cross = max(sum(w_raw_active), 12.0)

    placed = []
    x_curr = offset_x
    for r, w_r in zip(R_active, w_raw_active):
        w_act = W_cross * (w_r / sum(w_raw_active))
        placed.append({
            "id": r["id"], "type": r["type"],
            "x": x_curr, "y": offset_y, "w": w_act, "h": H_cross
        })
        x_curr += w_act

    # Горизонтальный коридор перекладины
    placed.append({
        "id": "hallway_main", "type": "hallway",
        "x": offset_x, "y": offset_y + H_cross, "w": W_cross, "h": 1.2
    })

    # 2. Ножка (Leg)
    # Ширина ножки 5.0м, размещается в центре
    leg_x = offset_x + W_cross / 2 - 2.5
    leg_y = offset_y + H_cross + 1.2

    h_raw_quiet = [max(r["area_m2"] / 3.8, MIN_DIMENSIONS.get(r["type"], {}).get("h", 1.0)) for r in R_quiet]
    H_leg = max(sum(h_raw_quiet), 5.0)

    # Вертикальный коридор ножки
    placed.append({
        "id": "hallway_wing", "type": "hallway",
        "x": leg_x, "y": leg_y, "w": 1.2, "h": H_leg
    })

    # Спальни в ножке
    y_curr = leg_y
    for r, h_r in zip(R_quiet, h_raw_quiet):
        h_act = H_leg * (h_r / sum(h_raw_quiet))
        placed.append({
            "id": r["id"], "type": r["type"],
            "x": leg_x + 1.2, "y": y_curr, "w": 3.8, "h": h_act
        })
        y_curr += h_act

    return _build_result(placed)

def _build_result(placed: list[dict]) -> list[RoomWithCoords]:
    # Расчет смежностей по геометрии
    tol = 0.05
    for r in placed:
        r["adjacent_to"] = []

    for i, r1 in enumerate(placed):
        for j, r2 in enumerate(placed):
            if i == j: continue

            # Проверка вертикального стыка
            if abs(r1["x"] + r1["w"] - r2["x"]) < tol:
                y_overlap = min(r1["y"] + r1["h"], r2["y"] + r2["h"]) - max(r1["y"], r2["y"])
                if y_overlap > 0.1:
                    if r2["id"] not in r1["adjacent_to"]: r1["adjacent_to"].append(r2["id"])
                    if r1["id"] not in r2["adjacent_to"]: r2["adjacent_to"].append(r1["id"])

            # Проверка горизонтального стыка
            elif abs(r1["y"] + r1["h"] - r2["y"]) < tol:
                x_overlap = min(r1["x"] + r1["w"], r2["x"] + r2["w"]) - max(r1["x"], r2["x"])
                if x_overlap > 0.1:
                    if r2["id"] not in r1["adjacent_to"]: r1["adjacent_to"].append(r2["id"])
                    if r1["id"] not in r2["adjacent_to"]: r2["adjacent_to"].append(r1["id"])

    # Формирование объектов RoomWithCoords
    result = []
    for p in placed:
        label = p["type"]
        if p["type"] == "hallway": label = "Коридор"
        else: label = ROOM_LABELS_RU.get(p["type"], p["type"])
        
        result.append(RoomWithCoords(
            id=p["id"],
            type=p["type"],
            x=round(p["x"], 3),
            y=round(p["y"], 3),
            width=round(p["w"], 3),
            height=round(p["h"], 3),
            label=label,
            adjacent_to=p["adjacent_to"]
        ))
    return result
