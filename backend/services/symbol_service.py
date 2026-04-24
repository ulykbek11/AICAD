def enrich_with_symbols(room_bboxes: list[dict]) -> list[dict]:
    """
    Шаг 3 (Symbol Service):
    Принимает координаты комнат и добавляет в каждую комнату
    набор мебельных символов (без AI, чистая геометрическая логика).
    """
    enriched: list[dict] = []
    margin = 0.2  # 20 единиц отступа
    for room in room_bboxes:
        x0, y0, x1, y1 = room["x0"], room["y0"], room["x1"], room["y1"]
        w = x1 - x0
        h = y1 - y0
        t = room["type"]
        symbols: list[dict] = []

        if t == "living_room":
            sofa_w = min(w * 0.6, 2.0)
            sofa_d = 0.85
            symbols.append({"type": "sofa", "x": x0 + w / 2 - sofa_w / 2, "y": y0 + h - sofa_d - margin, "w": sofa_w, "h": sofa_d})
        elif t == "bedroom":
            bed_w = min(w * 0.55, 1.8)
            bed_l = min(h * 0.45, 2.1)
            symbols.append({"type": "bed", "x": x0 + w / 2 - bed_w / 2, "y": y0 + h - bed_l - margin, "w": bed_w, "h": bed_l})
            wardrobe_w = min(w * 0.35, 1.2)
            wardrobe_d = 0.55
            symbols.append({"type": "wardrobe", "x": x0 + margin, "y": y0 + margin, "w": wardrobe_w, "h": wardrobe_d})
        elif t == "kitchen":
            stove_w, stove_d = 0.65, 0.65
            symbols.append({"type": "stove", "x": x0 + margin, "y": y0 + h - stove_d - margin, "w": stove_w, "h": stove_d})
            sink_w, sink_d = 0.55, 0.50
            symbols.append({"type": "sink", "x": x0 + margin + stove_w, "y": y0 + h - sink_d - margin, "w": sink_w, "h": sink_d})
        elif t in ("bathroom", "toilet"):
            bath_w = min(w * 0.85, 1.65)
            bath_d = min(h * 0.4, 0.75)
            symbols.append({"type": "bathtub", "x": x0 + margin, "y": y0 + margin, "w": bath_w, "h": bath_d})
            toilet_w, toilet_d = 0.38, 0.46
            symbols.append({"type": "toilet", "x": x0 + w / 2 - toilet_w / 2, "y": y0 + h - toilet_d - margin, "w": toilet_w, "h": toilet_d})

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
                _add_sofa(msp, x, y, w, h)
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


def _add_sofa(msp, x, y, width, depth):
    layer = "Мебель"
    msp.add_lwpolyline([(x, y), (x + width, y), (x + width, y + depth), (x, y + depth), (x, y)], dxfattribs={"layer": layer})
    msp.add_line((x, y + depth - 20), (x + width, y + depth - 20), dxfattribs={"layer": layer})
    pw = (width - 10) / 3
    for i in range(3):
        cx = x + 5 + i * pw
        msp.add_lwpolyline([(cx + 2, y + 2), (cx + pw - 2, y + 2), (cx + pw - 2, y + depth - 22), (cx + 2, y + depth - 22), (cx + 2, y + 2)], dxfattribs={"layer": layer})


def _add_bed(msp, x, y, width, length):
    layer = "Мебель"
    msp.add_lwpolyline([(x, y), (x + width, y), (x + width, y + length), (x, y + length), (x, y)], dxfattribs={"layer": layer})
    msp.add_line((x, y + length - 25), (x + width, y + length - 25), dxfattribs={"layer": layer})
    for i in range(2):
        cx = x + 25 + i * (width - 50)
        cy = y + length - 12
        msp.add_ellipse(center=(cx, cy), major_axis=(15, 0), ratio=0.6, dxfattribs={"layer": layer})


def _add_wardrobe(msp, x, y, width, depth):
    layer = "Мебель"
    msp.add_lwpolyline([(x, y), (x + width, y), (x + width, y + depth), (x, y + depth), (x, y)], dxfattribs={"layer": layer})
    msp.add_line((x, y), (x + width, y + depth), dxfattribs={"layer": layer})
    msp.add_line((x + width, y), (x, y + depth), dxfattribs={"layer": layer})


def _add_stove(msp, x, y, width, depth):
    layer = "Сантехника"
    msp.add_lwpolyline([(x, y), (x + width, y), (x + width, y + depth), (x, y + depth), (x, y)], dxfattribs={"layer": layer})
    for ox, oy in [(0.25, 0.25), (0.75, 0.25), (0.25, 0.75), (0.75, 0.75)]:
        msp.add_circle(center=(x + width * ox, y + depth * oy), radius=min(width, depth) * 0.15, dxfattribs={"layer": layer})


def _add_sink(msp, x, y, width, depth):
    layer = "Сантехника"
    msp.add_lwpolyline([(x, y), (x + width, y), (x + width, y + depth), (x, y + depth), (x, y)], dxfattribs={"layer": layer})
    msp.add_circle(center=(x + width / 2, y + depth / 2), radius=min(width, depth) * 0.35, dxfattribs={"layer": layer})


def _add_counter(msp, x, y, width, depth):
    msp.add_lwpolyline([(x, y), (x + width, y), (x + width, y + depth), (x, y + depth), (x, y)], dxfattribs={"layer": "Мебель"})


def _add_coffee_table(msp, x, y, width, depth):
    msp.add_lwpolyline([(x, y), (x + width, y), (x + width, y + depth), (x, y + depth), (x, y)], dxfattribs={"layer": "Мебель"})


def _add_bathtub(msp, x, y, width, depth):
    layer = "Сантехника"
    msp.add_lwpolyline([(x, y), (x + width, y), (x + width, y + depth), (x, y + depth), (x, y)], dxfattribs={"layer": layer})
    msp.add_lwpolyline([(x + 8, y + 8), (x + width - 8, y + 8), (x + width - 8, y + depth - 8), (x + 8, y + depth - 8), (x + 8, y + 8)], dxfattribs={"layer": layer})


def _add_toilet(msp, x, y, width, depth):
    layer = "Сантехника"
    msp.add_lwpolyline([(x, y + depth * 0.65), (x + width, y + depth * 0.65), (x + width, y + depth), (x, y + depth), (x, y + depth * 0.65)], dxfattribs={"layer": layer})
    msp.add_ellipse(center=(x + width / 2, y + depth * 0.35), major_axis=(width / 3, 0), ratio=0.8, dxfattribs={"layer": layer})


def _add_wash_basin(msp, x, y, width, depth):
    layer = "Сантехника"
    msp.add_lwpolyline([(x, y), (x + width, y), (x + width, y + depth), (x, y + depth), (x, y)], dxfattribs={"layer": layer})
    msp.add_circle(center=(x + width / 2, y + depth / 2), radius=min(width, depth) * 0.3, dxfattribs={"layer": layer})
