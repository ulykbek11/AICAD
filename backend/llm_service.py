import asyncio

async def generate_room_graph(prompt: str) -> dict:
    """
    Шаг 1: LLM API
    Преобразует текстовый промпт пользователя в граф комнат с примерными координатами.
    """
    await asyncio.sleep(1) # Имитация задержки сети (обращение к LLM)
    return {
        "status": "success",
        "room_graph": {"nodes": ["Living Room", "Bedroom"], "edges": []},
        "raw_coordinates": [[0, 0, 10, 10], [10, 0, 20, 10]]
    }
