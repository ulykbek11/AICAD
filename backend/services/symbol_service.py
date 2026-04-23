def enrich_with_symbols(room_bboxes: list[dict]) -> list[dict]:
    """
    Шаг 3 (Symbol Service):
    Принимает координаты комнат и добавляет в каждую комнату
    набор мебельных символов (без AI, чистая геометрическая логика).
    """
    enriched: list[dict] = []
    for room in room_bboxes:
        x0, y0, x1, y1 = room["x0"], room["y0"], room["x1"], room["y1"]
        w = x1 - x0
        h = y1 - y0
        t = room["type"]
        symbols: list[dict] = []

        if t == "living_room":
            symbols.append({"type": "sofa", "x": x0 + w * 0.1, "y": y0 + h * 0.1, "w": min(w * 0.6, 2.2), "h": 0.9})
            symbols.append({"type": "coffee_table", "x": x0 + w * 0.2, "y": y0 + h * 0.45, "w": min(w * 0.3, 1.0), "h": 0.6})
        elif t == "bedroom":
            symbols.append({"type": "bed", "x": x0 + w * 0.2, "y": y0 + h * 0.15, "w": min(w * 0.6, 1.6), "h": min(h * 0.5, 2.0)})
            symbols.append({"type": "wardrobe", "x": x0 + w * 0.05, "y": y0 + h * 0.7, "w": min(w * 0.4, 1.2), "h": 0.6})
        elif t == "kitchen":
            symbols.append({"type": "stove", "x": x0 + w * 0.05, "y": y0 + h * 0.7, "w": 0.6, "h": 0.6})
            symbols.append({"type": "sink", "x": x0 + w * 0.05, "y": y0 + h * 0.5, "w": 0.5, "h": 0.5})
            symbols.append({"type": "counter", "x": x0 + w * 0.05, "y": y0 + h * 0.4, "w": w * 0.9, "h": 0.6})
        elif t == "bathroom":
            symbols.append({"type": "bathtub", "x": x0 + w * 0.1, "y": y0 + h * 0.1, "w": min(w * 0.7, 1.7), "h": min(h * 0.4, 0.75)})
            symbols.append({"type": "toilet", "x": x0 + w * 0.6, "y": y0 + h * 0.6, "w": 0.4, "h": 0.65})
            symbols.append({"type": "wash_basin", "x": x0 + w * 0.1, "y": y0 + h * 0.65, "w": 0.5, "h": 0.4})
        elif t == "toilet":
            symbols.append({"type": "toilet", "x": x0 + w * 0.2, "y": y0 + h * 0.2, "w": min(w * 0.6, 0.4), "h": min(h * 0.5, 0.65)})

        enriched.append({**room, "symbols": symbols})
    return enriched


def draw_symbols(msp, rooms_with_symbols: list[dict], scale: float = 100.0):
    for room in rooms_with_symbols:
        for symbol in room.get("symbols", []):
            st = symbol["type"]
            x = symbol["x"] * scale
            y = symbol["y"] * scale
            w = symbol["w"] * scale
            h = symbol["h"] * scale

            if st == "sofa":
                _add_sofa(msp, x, y, w)
            elif st == "coffee_table":
                _add_coffee_table(msp, x, y, w, h)
            elif st == "bed":
                _add_bed(msp, x, y, w, h)
            elif st == "wardrobe":
                _add_wardrobe(msp, x, y, w, h)
            elif st == "stove":
                _add_stove(msp, x, y, w, h)
            elif st == "sink":
                _add_sink(msp, x, y, w, h)
            elif st == "counter":
                _add_counter(msp, x, y, w, h)
            elif st == "bathtub":
                _add_bathtub(msp, x, y, w, h)
            elif st == "toilet":
                _add_toilet(msp, x, y, w, h)
            elif st == "wash_basin":
                _add_wash_basin(msp, x, y, w, h)


def _add_sofa(msp, x, y, width):
    layer = "Мебель"
    depth = min(width * 0.45, 90)
    msp.add_lwpolyline([(x, y), (x + width, y), (x + width, y + depth), (x, y + depth)], dxfattribs={"layer": layer, "closed": True})
    msp.add_line((x, y + depth - 12), (x + width, y + depth - 12), dxfattribs={"layer": layer})
    pw = (width - 10) / 3
    for i in range(3):
        cx = x + 5 + i * pw
        msp.add_lwpolyline([(cx + 3, y + 4), (cx + pw - 3, y + 4), (cx + pw - 3, y + depth - 16), (cx + 3, y + depth - 16)], dxfattribs={"layer": layer, "closed": True})


def _add_bed(msp, x, y, width, length):
    layer = "Мебель"
    msp.add_lwpolyline([(x, y), (x + width, y), (x + width, y + length), (x, y + length)], dxfattribs={"layer": layer, "closed": True})
    msp.add_line((x, y + length - 25), (x + width, y + length - 25), dxfattribs={"layer": layer})
    for i in range(2):
        cx = x + 15 + i * (width / 2)
        cy = y + length - 22
        msp.add_ellipse(center=(cx, cy), major_axis=(width / 4 - 10, 0), ratio=0.5, dxfattribs={"layer": layer})


def _add_wardrobe(msp, x, y, width, depth):
    layer = "Мебель"
    msp.add_lwpolyline([(x, y), (x + width, y), (x + width, y + depth), (x, y + depth)], dxfattribs={"layer": layer, "closed": True})
    msp.add_line((x, y), (x + width, y + depth), dxfattribs={"layer": layer})
    msp.add_line((x + width, y), (x, y + depth), dxfattribs={"layer": layer})


def _add_stove(msp, x, y, width, depth):
    layer = "Мебель"
    msp.add_lwpolyline([(x, y), (x + width, y), (x + width, y + depth), (x, y + depth)], dxfattribs={"layer": layer, "closed": True})
    for ox, oy in [(0.25, 0.25), (0.75, 0.25), (0.25, 0.75), (0.75, 0.75)]:
        msp.add_circle(center=(x + width * ox, y + depth * oy), radius=min(width, depth) * 0.12, dxfattribs={"layer": layer})


def _add_sink(msp, x, y, width, depth):
    layer = "Мебель"
    msp.add_lwpolyline([(x, y), (x + width, y), (x + width, y + depth), (x, y + depth)], dxfattribs={"layer": layer, "closed": True})
    msp.add_circle(center=(x + width / 2, y + depth / 2), radius=min(width, depth) * 0.3, dxfattribs={"layer": layer})


def _add_counter(msp, x, y, width, depth):
    msp.add_lwpolyline([(x, y), (x + width, y), (x + width, y + depth), (x, y + depth)], dxfattribs={"layer": "Мебель", "closed": True})


def _add_coffee_table(msp, x, y, width, depth):
    msp.add_lwpolyline([(x, y), (x + width, y), (x + width, y + depth), (x, y + depth)], dxfattribs={"layer": "Мебель", "closed": True})


def _add_bathtub(msp, x, y, width, depth):
    layer = "Мебель"
    msp.add_lwpolyline([(x, y), (x + width, y), (x + width, y + depth), (x, y + depth)], dxfattribs={"layer": layer, "closed": True})
    msp.add_lwpolyline([(x + 8, y + 8), (x + width - 8, y + 8), (x + width - 8, y + depth - 8), (x + 8, y + depth - 8)], dxfattribs={"layer": layer, "closed": True})


def _add_toilet(msp, x, y, width, depth):
    layer = "Мебель"
    msp.add_lwpolyline([(x, y + depth * 0.65), (x + width, y + depth * 0.65), (x + width, y + depth), (x, y + depth)], dxfattribs={"layer": layer, "closed": True})
    msp.add_ellipse(center=(x + width / 2, y + depth * 0.35), major_axis=(width / 2, 0), ratio=0.75, dxfattribs={"layer": layer})


def _add_wash_basin(msp, x, y, width, depth):
    layer = "Мебель"
    msp.add_lwpolyline([(x, y), (x + width, y), (x + width, y + depth), (x, y + depth)], dxfattribs={"layer": layer, "closed": True})
    msp.add_circle(center=(x + width / 2, y + depth / 2), radius=min(width, depth) * 0.3, dxfattribs={"layer": layer})
