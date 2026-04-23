from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from models.schemas import GenerateRequest, GenerateResponse
from services.llm_service import answer_project_chat, detect_intent, generate_room_graph_pkl
from services.floorplan_gan_service import generate_room_bboxes
from services.symbol_service import enrich_with_symbols
from services.dxf_service import generate_dxf
from services.svg_service import dxf_to_svg
import pickle
import json
import traceback

router = APIRouter()


@router.post("/chat", response_model=GenerateResponse)
async def chat_generate(request: GenerateRequest):
    try:
        intent = detect_intent(request.prompt)
        if intent == "offtopic":
            raise HTTPException(
                status_code=400,
                detail="Я отвечаю только по тематике AICAD: CAD-планы, DXF/SVG, слои и генерация.",
            )
        if intent == "chat":
            text = answer_project_chat(request.prompt)
            return {
                "job_id": "",
                "svg": "",
                "download_url": "",
                "rooms_count": 0,
                "total_area": 0,
                "message": text,
            }

        room_graph_pkl = generate_room_graph_pkl(request.prompt)
        room_graph = pickle.loads(room_graph_pkl)
        room_bboxes = generate_room_bboxes(room_graph_pkl)
        rooms_with_symbols = enrich_with_symbols(room_bboxes)
        job_id, filepath = generate_dxf(rooms_with_symbols)
        svg = dxf_to_svg(filepath)

        return GenerateResponse(
            job_id=job_id,
            svg=svg,
            download_url=f"/static/downloads/{job_id}.dxf",
            rooms_count=len(room_bboxes),
            total_area=room_graph.get("total_area_m2", 0),
            message=f"Чертеж готов! {len(room_bboxes)} комнат, "
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
        intent = detect_intent(prompt)
        if intent == "offtopic":
            await websocket.send_json(
                {
                    "stage": "done",
                    "progress": 100,
                    "message": "Я работаю по тематике AICAD: CAD-планы, DXF/SVG, слои и инструменты.",
                }
            )
            return
        if intent == "chat":
            await websocket.send_json(
                {"stage": "llm", "progress": 20, "message": "Формирую ответ по проекту..."}
            )
            await websocket.send_json(
                {
                    "stage": "done",
                    "progress": 100,
                    "message": answer_project_chat(prompt),
                    "rooms_count": 0,
                    "total_area": 0,
                }
            )
            return

        await websocket.send_json(
            {"stage": "llm", "progress": 10, "message": "Анализирую запрос..."}
        )
        room_graph_pkl = generate_room_graph_pkl(prompt)
        room_graph = pickle.loads(room_graph_pkl)

        await websocket.send_json(
            {"stage": "floorplangan", "progress": 40, "message": "FloorplanGAN: генерирую координаты комнат..."}
        )
        room_bboxes = generate_room_bboxes(room_graph_pkl)

        await websocket.send_json(
            {"stage": "symbols", "progress": 60, "message": "Symbol Service: добавляю мебель..."}
        )
        rooms_with_symbols = enrich_with_symbols(room_bboxes)

        await websocket.send_json(
            {"stage": "dxf", "progress": 80, "message": "DXF Service: генерирую чертеж..."}
        )
        job_id, filepath = generate_dxf(rooms_with_symbols)

        await websocket.send_json(
            {"stage": "svg", "progress": 90, "message": "Подготавливаю отображение..."}
        )
        svg = dxf_to_svg(filepath)

        await websocket.send_json(
            {
                "stage": "done",
                "progress": 100,
                "message": f"Готово! {len(room_bboxes)} комнат",
                "svg": svg,
                "download_url": f"/static/downloads/{job_id}.dxf",
                "rooms_count": len(room_bboxes),
                "total_area": room_graph.get("total_area_m2", 0),
            }
        )
    except WebSocketDisconnect:
        pass
    except Exception as e:
        await websocket.send_json({"stage": "error", "message": str(e)})
