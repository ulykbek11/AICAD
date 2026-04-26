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


def layout_by_topology(rooms, topology, offset_x=0.0, offset_y=0.0):
    """
    Compact zone-based layout algorithm.
    
    Zones are placed in a grid, but empty grid cells are collapsed
    so there are NO gaps between zones. Within each zone rooms are
    stacked vertically and stretched to the zone width.
    """
    rooms_dict = {r["id"] if isinstance(r, dict) else r.id: r for r in rooms}
    result = []

    zone_positions = topology.get("zone_positions", {})
    zones = topology.get("zones", {})

    logger.info("Начинаем компактную расстановку по топологии")

    # 1. Calculate room dimensions
    room_dims = {}
    for rid, r_data in rooms_dict.items():
        is_dict = isinstance(r_data, dict)
        rtype = r_data.get("type", "unknown") if is_dict else r_data.type
        rarea = r_data.get("area_m2", 10.0) if is_dict else r_data.area_m2
        w, h = get_dimensions(rtype, rarea)
        room_dims[rid] = (rtype, w, h)

    # 2. Build zone list with grid positions
    zone_list = []
    for zone_name, room_ids in zones.items():
        valid_rids = [rid for rid in room_ids if rid in rooms_dict]
        if not valid_rids:
            continue
        pos_name = zone_positions.get(zone_name, "center")
        col, row = GRID_POSITIONS.get(pos_name, (1, 1))

        # Zone: rooms stacked vertically, width = widest room
        z_width = max(room_dims[rid][1] for rid in valid_rids)
        z_height = (sum(room_dims[rid][2] for rid in valid_rids)
                    + WALL_THICKNESS * max(0, len(valid_rids) - 1))

        zone_list.append({
            "name": zone_name,
            "rooms": valid_rids,
            "col": col,
            "row": row,
            "width": z_width,
            "height": z_height,
        })

    if not zone_list:
        logger.warning("Нет зон для расстановки")
        return result

    # 3. Group zones by rows and compact each row independently.
    # This avoids artificial empty columns (e.g. center-bottom hallway creating
    # a global middle gap between left/right rooms in upper rows).
    row_groups = {}
    for z in zone_list:
        row_groups.setdefault(z["row"], []).append(z)

    sorted_rows = sorted(row_groups.keys())
    row_heights = {}
    row_widths = {}
    row_x_start = {}

    # Build compact left-to-right width for each row.
    for row in sorted_rows:
        zones_in_row = sorted(row_groups[row], key=lambda z: z["col"])
        row_groups[row] = zones_in_row
        row_heights[row] = max(z["height"] for z in zones_in_row)

        row_w = 0.0
        for idx, z in enumerate(zones_in_row):
            row_w += z["width"]
            if idx < len(zones_in_row) - 1:
                row_w += WALL_THICKNESS
        row_widths[row] = row_w

    total_plan_width = max(row_widths.values()) if row_widths else 0.0

    # Align narrow rows according to intended horizontal zone position.
    for row in sorted_rows:
        zones_in_row = row_groups[row]
        min_col = min(z["col"] for z in zones_in_row)
        max_col = max(z["col"] for z in zones_in_row)
        span = max_col - min_col

        if len(zones_in_row) == 1:
            single_col = zones_in_row[0]["col"]
            if single_col == 1:
                row_x_start[row] = offset_x + (total_plan_width - row_widths[row]) / 2
            elif single_col == 2:
                row_x_start[row] = offset_x + (total_plan_width - row_widths[row])
            else:
                row_x_start[row] = offset_x
        elif span == 0:
            row_x_start[row] = offset_x
        else:
            # Keep multi-zone rows compact and naturally left-anchored.
            row_x_start[row] = offset_x

    row_y = {}
    cy = offset_y
    for idx, row in enumerate(sorted_rows):
        row_y[row] = cy
        cy += row_heights[row]
        if idx < len(sorted_rows) - 1:
            cy += WALL_THICKNESS

    logger.info(f"Compact rows: rows={sorted_rows}")
    logger.info(f"row_widths={row_widths}, row_heights={row_heights}")
    logger.info(f"row_x_start={row_x_start}, row_y={row_y}")

    # 6. Place rooms — stack vertically inside each zone
    for row in sorted_rows:
        zones_in_row = row_groups[row]
        zx = row_x_start[row]
        for zone in zones_in_row:
            zy = row_y[row]
            zone_w = zone["width"]
        
            # Keep vertical compactness while filling the row's max zone height.
            target_h = row_heights[row] - WALL_THICKNESS * max(0, len(zone["rooms"]) - 1)
            current_h = sum(room_dims[rid][2] for rid in zone["rooms"])
            scale_h = target_h / current_h if current_h > 0 else 1.0

            for rid in zone["rooms"]:
                rtype, w, h = room_dims[rid]
                adjusted_h = h * scale_h

                result.append(RoomWithCoords(
                    id=rid,
                    type=rtype,
                    x=round(zx, 3),
                    y=round(zy, 3),
                    width=round(zone_w, 3),
                    height=round(adjusted_h, 3),
                    label=f"{rtype} ({rid})"
                ))
                zy += adjusted_h + WALL_THICKNESS

            zx += zone_w + WALL_THICKNESS

    logger.info(f"Расстановка завершена, комнат: {len(result)}")
    logger.info("=== ФИНАЛЬНЫЕ КООРДИНАТЫ КОМНАТ ===")
    for room in result:
        logger.info(
            f"{room.type}: x={room.x} y={room.y} "
            f"w={room.width} h={room.height}"
        )

    return result
