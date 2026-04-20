from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from models.schemas import GenerateRequest, GenerateResponse
from services.llm_service import generate_room_graph
from services.layout_service import layout_rooms
from services.dxf_service import generate_dxf
from services.svg_service import dxf_to_svg
import json
import traceback

router = APIRouter()


@router.post("/chat", response_model=GenerateResponse)
async def chat_generate(request: GenerateRequest):
    try:
        room_graph = generate_room_graph(request.prompt)
        rooms_with_coords = layout_rooms(room_graph["rooms"])
        job_id, filepath = generate_dxf(rooms_with_coords)
        svg = dxf_to_svg(filepath)

        return GenerateResponse(
            job_id=job_id,
            svg=svg,
            download_url=f"/static/downloads/{job_id}.dxf",
            rooms_count=len(rooms_with_coords),
            total_area=room_graph.get("total_area_m2", 0),
            message=f"Чертеж готов! {len(rooms_with_coords)} комнат, "
            f"{room_graph.get('total_area_m2', 0)}м²",
        )
    except Exception:
        traceback.print_exc()
        raise


@router.websocket("/ws/{session_id}")
async def websocket_generate(websocket: WebSocket, session_id: str):
    await websocket.accept()
    try:
        data = await websocket.receive_text()
        request = json.loads(data)
        prompt = request.get("prompt", "")

        await websocket.send_json(
            {"stage": "llm", "progress": 10, "message": "Анализирую запрос..."}
        )
        room_graph = generate_room_graph(prompt)

        await websocket.send_json(
            {"stage": "layout", "progress": 40, "message": "Расставляю комнаты..."}
        )
        rooms_with_coords = layout_rooms(room_graph["rooms"])

        await websocket.send_json(
            {"stage": "dxf", "progress": 70, "message": "Генерирую чертеж..."}
        )
        job_id, filepath = generate_dxf(rooms_with_coords)

        await websocket.send_json(
            {"stage": "svg", "progress": 90, "message": "Подготавливаю отображение..."}
        )
        svg = dxf_to_svg(filepath)

        await websocket.send_json(
            {
                "stage": "done",
                "progress": 100,
                "message": f"Готово! {len(rooms_with_coords)} комнат",
                "svg": svg,
                "download_url": f"/static/downloads/{job_id}.dxf",
                "rooms_count": len(rooms_with_coords),
                "total_area": room_graph.get("total_area_m2", 0),
            }
        )
    except WebSocketDisconnect:
        pass
    except Exception as e:
        await websocket.send_json({"stage": "error", "message": str(e)})
