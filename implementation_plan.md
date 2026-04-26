# Аудит захардкоженных координат и план исправления

## 🔍 Результаты поиска

---

### 1. Все захардкоженные координаты

#### [layout_service.py](file:///c:/Users/bekmy/OneDrive/Desktop/AICAD/backend/services/layout_service.py) — СТАРЫЙ АЛГОРИТМ (cursor-based)

| Строка | Код | Проблема |
|--------|-----|----------|
| 47 | `cursor_x = 0.0` | Моковый начальный x |
| 48 | `cursor_y = 0.0` | Моковый начальный y |
| 64 | `cursor_x = 0.0` | Сброс x на 0 при переходе ряда |
| 65 | `cursor_y += row_height + 0.15` | Хардкод зазора 0.15 |
| 81 | `cursor_x += width + 0.15` | Хардкод зазора 0.15 |
| 73 | `x=round(cursor_x, 3)` | Координата из cursor, не из grid |
| 74 | `y=round(cursor_y, 3)` | Координата из cursor, не из grid |

> [!NOTE]
> Этот файл **не вызывается** из `generate.py` напрямую (import закомментирован на строке 6). Но `layout_two_floors` в нём использует `layout_rooms()` внутри, что ещё может быть вызвано.

#### [floorplan_gan_service.py](file:///c:/Users/bekmy/OneDrive/Desktop/AICAD/backend/services/floorplan_gan_service.py) — СТАРЫЙ АЛГОРИТМ (cursor-based)

| Строка | Код | Проблема |
|--------|-----|----------|
| 15 | `cursor_x = 0.0` | Моковый начальный x |
| 16 | `cursor_y = 0.0` | Моковый начальный y |
| 27 | `cursor_x = 0.0` | Сброс x при переходе ряда |
| 28 | `cursor_y += row_height + 0.15` | Хардкод зазора 0.15 |
| 31 | `x0 = round(cursor_x, 3)` | Координата из cursor, не из grid |
| 32 | `y0 = round(cursor_y, 3)` | Координата из cursor, не из grid |
| 47 | `cursor_x += width + 0.15` | Хардкод зазора 0.15 |

> [!NOTE]
> Этот файл также **не вызывается** из `generate.py` (import закомментирован на строке 5).

#### [layout_algorithm.py](file:///c:/Users/bekmy/OneDrive/Desktop/AICAD/backend/services/layout_algorithm.py) — АКТИВНЫЙ АЛГОРИТМ ✅

| Строка | Код | Проблема |
|--------|-----|----------|
| 7 | `WALL_THICKNESS = 0.15` | Допустимая константа (толщина стен) |
| 74 | `offset_x=0.0, offset_y=0.0` | Допустимые дефолтные параметры |

> [!TIP]
> `layout_algorithm.py` — **единственный активный** файл для расстановки. Координаты в нём вычисляются правильно через `col_x[col]` и `row_y[row]`. **Хардкоженных y=0 или x=0 внутри нет.**

---

### 2. Все места создания RoomWithCoords

| Файл | Строка | Откуда берётся x | Откуда берётся y |
|------|--------|-------------------|-------------------|
| [layout_service.py:70-78](file:///c:/Users/bekmy/OneDrive/Desktop/AICAD/backend/services/layout_service.py#L70-L78) | 73-74 | `cursor_x` ❌ (cursor-линейный) | `cursor_y` ❌ (cursor-линейный) |
| [layout_algorithm.py:191-199](file:///c:/Users/bekmy/OneDrive/Desktop/AICAD/backend/services/layout_algorithm.py#L191-L199) | 194-195 | `current_x` ← `col_x[col]` ✅ | `start_y` ← `row_y[row]` ✅ |

---

### 3. Места где y НЕ берётся из row_y/zone_grid

| Файл | Строки | Как вычисляется y |
|------|--------|-------------------|
| `layout_service.py` | 48, 65, 74 | `cursor_y = 0.0`, `cursor_y += row_height + 0.15` — **линейный cursor** ❌ |
| `floorplan_gan_service.py` | 16, 28, 32 | `cursor_y = 0.0`, `cursor_y += row_height + 0.15` — **линейный cursor** ❌ |

> [!IMPORTANT]
> `layout_algorithm.py` корректно использует `row_y[row]` (строка 173) и `col_x[col]` (строка 172). Это единственный файл без проблем.

---

### 4. Перезаписываются ли координаты после layout_by_topology?

#### [generate.py](file:///c:/Users/bekmy/OneDrive/Desktop/AICAD/backend/routers/generate.py)

**НЕТ** — координаты не перезаписываются. Пайплайн:
```
layout_by_topology → _rooms_with_coords_to_bboxes → enrich_with_symbols → generate_elements
```
Функция `_rooms_with_coords_to_bboxes` (строки 23-36) только **конвертирует** `RoomWithCoords` → `dict` с полями `x0, y0, x1, y1`. Координаты передаются как есть.

#### [symbol_service.py](file:///c:/Users/bekmy/OneDrive/Desktop/AICAD/backend/services/symbol_service.py)

**НЕТ** — `enrich_with_symbols` (строки 1-40) только **читает** `x0, y0, x1, y1` для размещения мебели. Координаты комнат не изменяются.

---

### 5. 🔴 КОРНЕВАЯ ПРИЧИНА: почему комнаты стоят в ряд

> [!CAUTION]
> Корневая причина **НЕ** в хардкоженных координатах `layout_algorithm.py` (он работает правильно). Проблема в **topology_agent.py fallback** и в поведении Gemini:

#### Проблема A: Fallback topology_agent.py (строки 82-89)

```python
except Exception as e:
    return {
        "entry_side": "bottom",
        "zones": {"day": [r["id"] for r in rooms]},  # ← ВСЕ КОМНАТЫ В ОДНУ ЗОНУ!
        "zone_positions": {"day": "center_bottom"},   # ← ОДНА ПОЗИЦИЯ!
        "adjacency": []
    }
```

Если Gemini упал или вернул невалидный JSON, **ВСЕ комнаты** попадают в одну зону `"day"` на позиции `"center_bottom"` → `col=1, row=2`. Это приводит к тому, что `layout_algorithm.py` раскладывает все комнаты внутри одной ячейки сетки — **в ряд**.

#### Проблема B: Gemini может вернуть все в одну зону

Даже если Gemini не падает, он может вернуть малое количество зон (проверка `zones_used < 2` есть, но при ошибке — снова fallback в одну зону).

---

## Proposed Changes

### Компонент 1: Удаление мёртвого кода

#### [DELETE] [layout_service.py](file:///c:/Users/bekmy/OneDrive/Desktop/AICAD/backend/services/layout_service.py)

Файл содержит старый cursor-based алгоритм. Не вызывается из generate.py. Функции `layout_rooms` и `layout_two_floors` заменены на `layout_by_topology` и `layout_two_floors_topology`.

**Удалить целиком**, вместо этого оставить заглушку с redirect:
```python
# Deprecated: use layout_algorithm.layout_by_topology
from services.layout_algorithm import layout_by_topology
```

#### [DELETE] [floorplan_gan_service.py](file:///c:/Users/bekmy/OneDrive/Desktop/AICAD/backend/services/floorplan_gan_service.py)

Файл не используется (import закомментирован в generate.py). Содержит cursor-based хардкод.

---

### Компонент 2: Исправление fallback в topology_agent.py

#### [MODIFY] [topology_agent.py](file:///c:/Users/bekmy/OneDrive/Desktop/AICAD/backend/services/topology_agent.py)

Fallback должен **распределять** комнаты по зонам детерминированно, а не класть все в одну:

```python
except Exception as e:
    # Детерминированный fallback — распределяем по типу комнат
    zone_map = {
        "entrance": [], "day": [], "night": [], "service": []
    }
    TYPE_TO_ZONE = {
        "hallway": "entrance",
        "living_room": "day", "dining_room": "day",
        "bedroom": "night", "bedroom_2": "night", "bedroom_3": "night",
        "office": "night",
        "kitchen": "service", "bathroom": "service", "bathroom_2": "service",
        "toilet": "service", "garage": "service", "balcony": "day",
    }
    for r in rooms:
        rid = r["id"] if isinstance(r, dict) else r.id
        rtype = r["type"] if isinstance(r, dict) else r.type
        zone = TYPE_TO_ZONE.get(rtype, "day")
        zone_map[zone].append(rid)
    
    zones = {k: v for k, v in zone_map.items() if v}
    ZONE_POS = {"entrance":"center_bottom","day":"left","night":"top_right","service":"top_left"}
    
    return {
        "entry_side": "bottom",
        "zones": zones,
        "zone_positions": {z: ZONE_POS[z] for z in zones},
        "adjacency": []
    }
```

---

### Компонент 3: layout_algorithm.py — без изменений

> [!TIP]
> `layout_algorithm.py` уже правильно вычисляет координаты через `col_x[col]` и `row_y[row]`. Хардкоженных координат нет. `WALL_THICKNESS = 0.15` — это допустимая архитектурная константа (150мм толщина стен), **не mock**.

---

## Open Questions

> [!IMPORTANT]
> 1. **Удалять ли `layout_service.py` и `floorplan_gan_service.py` полностью?** Они не используются, но могут быть нужны как fallback. Рекомендую удалить — весь функционал покрыт `layout_algorithm.py`.
> 2. **Нужно ли добавить retry для Gemini в topology_agent?** Сейчас при любой ошибке — fallback. Можно добавить 1-2 retry перед fallback'ом.

---

## Verification Plan

### Automated Tests
```bash
cd backend && python -c "
from services.topology_agent import generate_topology
from services.layout_algorithm import layout_by_topology

# Тест fallback
rooms = [
    {'id':'r1','type':'hallway','area_m2':6,'min_width':1.5,'adjacent_to':[]},
    {'id':'r2','type':'living_room','area_m2':20,'min_width':3,'adjacent_to':[]},
    {'id':'r3','type':'bedroom','area_m2':15,'min_width':3,'adjacent_to':[]},
    {'id':'r4','type':'kitchen','area_m2':12,'min_width':2.5,'adjacent_to':[]},
]
# Simulate fallback
topo = generate_topology.__wrapped__(rooms) if hasattr(generate_topology,'__wrapped__') else None
"
```

### Manual Verification
- Запустить сервер и сгенерировать план дома через UI
- Убедиться, что комнаты распределены по сетке 3×3, а не в ряд
