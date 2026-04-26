# ═══════════════════════════════════════════════════════
# DEPRECATED: Старый cursor-based алгоритм расстановки.
# Весь функционал перенесён в layout_algorithm.py
# (layout_by_topology).
# Этот файл оставлен для обратной совместимости импортов.
# ═══════════════════════════════════════════════════════

from services.layout_algorithm import layout_by_topology  # noqa: F401

ROOM_LABELS = {
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
}
