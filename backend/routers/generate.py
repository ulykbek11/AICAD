from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from models.schemas import GenerateRequest, GenerateResponse
from services.llm_service import answer_project_chat, detect_intent, generate_room_graph_pkl
from services.router_agent import classify_request
from services.floorplan_gan_service import generate_room_bboxes
from services.layout_service import layout_rooms, layout_two_floors
from services.symbol_service import enrich_with_symbols
from services.element_generator import generate_elements
from services.dxf_service import generate_dxf
import pickle
import json
import logging
import traceback

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

router = APIRouter()


def _rooms_with_coords_to_bboxes(rooms_with_coords):
    """Convert RoomWithCoords objects to bbox dicts for symbol/dxf services."""
    return [
        {
            "id": r.id,
            "type": r.type,
            "x0": r.x,
            "y0": r.y,
            "x1": r.x + r.width,
            "y1": r.y + r.height,
            "label": r.label,
        }
        for r in rooms_with_coords
    ]


@router.post("/chat", response_model=GenerateResponse)
async def chat_generate(request: GenerateRequest):
    try:
        logger.info(f"Получен запрос: {request.prompt}")

        # Шаг 0: Определение intent
        logger.info("Шаг 0: Определение intent...")
        intent = detect_intent(request.prompt)
        logger.info(f"Определенный intent: {intent}")
        if intent == "offtopic":
            raise HTTPException(
                status_code=400,
                detail="Я отвечаю только по тематике AICAD: CAD-планы, DXF/SVG, слои и генерация.",
            )
        if intent == "chat":
            logger.info("Intent=chat: формирую текстовый ответ по проекту")
            text = answer_project_chat(request.prompt)
            return {
                "job_id": "",
                "elements": [],
                "download_url": "",
                "rooms_count": 0,
                "total_area": 0,
                "message": text,
                "layers_used": [],
                "engine_used": "",
            }

        # Шаг 1: Классификация запроса (Router Agent)
        logger.info("Шаг 1: Router Agent — классификация запроса...")
        route = classify_request(request.prompt)
        logger.info(f"Роутер: {route}")

        # Шаг 2: LLM генерация графа комнат
        logger.info("Шаг 2: Запрос к LLM и получение room_graph PKL...")
        room_graph_pkl = generate_room_graph_pkl(request.prompt)
        room_graph = pickle.loads(room_graph_pkl)
        logger.info(f"LLM ответ получен. Ключи: {list(room_graph.keys())}")

        # Шаг 3: Выбор движка расстановки
        if route.get("floors", 1) == 2:
            logger.info("Двухэтажный дом — layout_two_floors")
            rooms_with_coords = layout_two_floors(room_graph["rooms"])
        elif route["engine"] == "floorplan_gan" and route.get("floors", 1) == 1:
            logger.info("Используем FloorplanGAN")
            room_bboxes = generate_room_bboxes(room_graph_pkl)
            # FloorplanGAN already returns bbox dicts — enrich and generate
            rooms_with_symbols = enrich_with_symbols(room_bboxes)
            elements = generate_elements(rooms_with_symbols)
            job_id, filepath = generate_dxf(rooms_with_symbols)
            layers_used = list(set(e["layer"] for e in elements))
            return GenerateResponse(
                job_id=job_id,
                elements=elements,
                download_url=f"/static/downloads/{job_id}.dxf",
                rooms_count=len(room_bboxes),
                total_area=room_graph.get("total_area_m2", 0),
                message=f"Готово! {len(room_bboxes)} комнат. Движок: {route['engine']}",
                layers_used=layers_used,
                engine_used=route["engine"],
            )
        else:
            logger.info(f"Используем Constraint Solver. Причина: {route.get('reason', '')}")
            rooms_with_coords = layout_rooms(room_graph["rooms"])

        # Шаг 4: Конвертация RoomWithCoords -> bbox dicts для symbol/dxf
        room_bboxes = _rooms_with_coords_to_bboxes(rooms_with_coords)

        logger.info("Шаг 5: Symbol service...")
        rooms_with_symbols = enrich_with_symbols(room_bboxes)
        logger.info(f"Символами обогащено: {len(rooms_with_symbols)}")

        # Шаг 6: Генерация CAD-элементов (для фронтенда)
        logger.info("Шаг 6: Element Generator — CAD-примитивы...")
        elements = generate_elements(rooms_with_symbols)
        logger.info(f"Сгенерировано элементов: {len(elements)}")

        # Шаг 7: DXF генерация (для скачивания)
        logger.info("Шаг 7: DXF генерация...")
        job_id, filepath = generate_dxf(rooms_with_symbols)
        logger.info(f"DXF создан: {filepath}")

        layers_used = list(set(e["layer"] for e in elements))

        return GenerateResponse(
            job_id=job_id,
            elements=elements,
            download_url=f"/static/downloads/{job_id}.dxf",
            rooms_count=len(rooms_with_coords),
            total_area=room_graph.get("total_area_m2", 0),
            message=f"Готово! {len(rooms_with_coords)} комнат. Движок: {route['engine']}",
            layers_used=layers_used,
            engine_used=route["engine"],
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"ОШИБКА в /api/chat: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Ошибка пайплайна: {str(e)}")


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

        # Router Agent
        await websocket.send_json(
            {"stage": "router", "progress": 5, "message": "Классификация запроса..."}
        )
        route = classify_request(prompt)

        await websocket.send_json(
            {"stage": "llm", "progress": 10, "message": "Анализирую запрос..."}
        )
        room_graph_pkl = generate_room_graph_pkl(prompt)
        room_graph = pickle.loads(room_graph_pkl)

        # Layout
        await websocket.send_json(
            {"stage": "layout", "progress": 40, "message": f"Расстановка комнат ({route['engine']})..."}
        )

        if route.get("floors", 1) == 2:
            rooms_with_coords = layout_two_floors(room_graph["rooms"])
            room_bboxes = _rooms_with_coords_to_bboxes(rooms_with_coords)
        elif route["engine"] == "floorplan_gan":
            room_bboxes = generate_room_bboxes(room_graph_pkl)
            rooms_with_coords = None  # already have bboxes
        else:
            rooms_with_coords = layout_rooms(room_graph["rooms"])
            room_bboxes = _rooms_with_coords_to_bboxes(rooms_with_coords)

        await websocket.send_json(
            {"stage": "symbols", "progress": 60, "message": "Symbol Service: добавляю мебель..."}
        )
        rooms_with_symbols = enrich_with_symbols(room_bboxes)

        await websocket.send_json(
            {"stage": "elements", "progress": 70, "message": "Генерирую CAD-элементы..."}
        )
        elements = generate_elements(rooms_with_symbols)

        await websocket.send_json(
            {"stage": "dxf", "progress": 85, "message": "DXF Service: генерирую чертеж..."}
        )
        job_id, filepath = generate_dxf(rooms_with_symbols)

        layers_used = list(set(e["layer"] for e in elements))
        n_rooms = len(room_bboxes)

        await websocket.send_json(
            {
                "stage": "done",
                "progress": 100,
                "message": f"Готово! {n_rooms} комнат. Движок: {route['engine']}",
                "elements": elements,
                "download_url": f"/static/downloads/{job_id}.dxf",
                "rooms_count": n_rooms,
                "total_area": room_graph.get("total_area_m2", 0),
                "layers_used": layers_used,
                "engine_used": route["engine"],
            }
        )
    except WebSocketDisconnect:
        pass
    except Exception as e:
        await websocket.send_json({"stage": "error", "message": str(e)})
