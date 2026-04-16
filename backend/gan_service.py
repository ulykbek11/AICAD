import asyncio

async def generate_floorplan_coords(room_graph: dict) -> dict:
    """
    Шаг 2: FloorplanGAN
    Принимает граф комнат и выдает точные координаты для нормального 2D чертежа.
    """
    await asyncio.sleep(2) # Имитация работы нейросети (инференс GAN)
    return {
        "status": "success",
        "refined_coordinates": [
            {"type": "wall", "start": (0, 0), "end": (100, 0)},
            {"type": "wall", "start": (100, 0), "end": (100, 100)},
            {"type": "wall", "start": (100, 100), "end": (0, 100)},
            {"type": "wall", "start": (0, 100), "end": (0, 0)}
        ]
    }
