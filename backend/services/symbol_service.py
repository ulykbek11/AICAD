def add_furniture(msp, rooms: list, scale: float = 100.0):
    for room in rooms:
        x = room.x * scale
        y = room.y * scale
        w = room.width * scale
        h = room.height * scale
        t = room.type

        if t == "living_room":
            _add_sofa(msp, x + w * 0.1, y + h * 0.1, min(w * 0.6, 220))
            _add_coffee_table(msp, x + w * 0.2, y + h * 0.45, min(w * 0.3, 100), 60)
        elif t == "bedroom":
            _add_bed(msp, x + w * 0.2, y + h * 0.15, min(w * 0.6, 160), min(h * 0.5, 200))
            _add_wardrobe(msp, x + w * 0.05, y + h * 0.7, min(w * 0.4, 120), 60)
        elif t == "kitchen":
            _add_stove(msp, x + w * 0.05, y + h * 0.7, 60, 60)
            _add_sink(msp, x + w * 0.05, y + h * 0.5, 50, 50)
            _add_counter(msp, x + w * 0.05, y + h * 0.4, w * 0.9, 60)
        elif t in ("bathroom",):
            _add_bathtub(msp, x + w * 0.1, y + h * 0.1, min(w * 0.7, 170), min(h * 0.4, 75))
            _add_toilet(msp, x + w * 0.6, y + h * 0.6, 40, 65)
            _add_wash_basin(msp, x + w * 0.1, y + h * 0.65, 50, 40)
        elif t == "toilet":
            _add_toilet(msp, x + w * 0.2, y + h * 0.2, min(w * 0.6, 40), min(h * 0.5, 65))


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
