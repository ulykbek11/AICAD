from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from models.schemas import GenerateRequest, GenerateResponse
from services.llm_service import answer_project_chat, detect_intent, generate_room_graph_pkl
from services.router_agent import classify_request
# from services.floorplan_gan_service import generate_room_bboxes
# from services.layout_service import layout_rooms, layout_two_floors
from services.topology_agent import generate_topology
from services.layout_algorithm import layout_by_topology
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
def chat_generate(request: GenerateRequest):
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
        rooms = room_graph.get("rooms", [])
        logger.info(f"LLM ответ получен. Комнаты: {len(rooms)}")

        # Шаг 3 — НОВАЯ СИСТЕМА
        logger.info("Генерирую топологию...")
        topology = generate_topology(rooms)
        logger.info(f"Топология: {topology}")

        if route.get("floors", 1) == 2:
            # Двухэтажный — разбить на этажи
            rooms_with_coords = layout_two_floors_topology(
                rooms, topology
            )
        else:
            # Один этаж — новый алгоритм
            rooms_with_coords = layout_by_topology(
                rooms, topology
            )

        logger.info(f"Расставлено комнат: {len(rooms_with_coords)}")

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
            message=f"Готово! {len(rooms_with_coords)} комнат",
            layers_used=layers_used,
            engine_used="topology_layout",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"ОШИБКА в /api/chat: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Ошибка пайплайна: {str(e)}")


from fastapi.concurrency import run_in_threadpool

@router.websocket("/ws/{session_id}")
async def websocket_generate(websocket: WebSocket, session_id: str):
    await websocket.accept()
    try:
        data = await websocket.receive_text()
        request = json.loads(data)
        prompt = request.get("prompt", "")
        intent = await run_in_threadpool(detect_intent, prompt)
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
            ans = await run_in_threadpool(answer_project_chat, prompt)
            await websocket.send_json(
                {
                    "stage": "done",
                    "progress": 100,
                    "message": ans,
                    "rooms_count": 0,
                    "total_area": 0,
                }
            )
            return

        # Router Agent
        await websocket.send_json(
            {"stage": "router", "progress": 5, "message": "Классификация запроса..."}
        )
        route = await run_in_threadpool(classify_request, prompt)

        await websocket.send_json(
            {"stage": "llm", "progress": 10, "message": "Анализирую запрос..."}
        )
        room_graph_pkl = await run_in_threadpool(generate_room_graph_pkl, prompt)
        room_graph = pickle.loads(room_graph_pkl)

        # Layout
        await websocket.send_json(
            {"stage": "layout", "progress": 40, "message": "Генерирую топологию плана..."}
        )

        topology = await run_in_threadpool(generate_topology, room_graph["rooms"])

        if route.get("floors", 1) == 2:
            rooms_with_coords = await run_in_threadpool(layout_two_floors_topology, room_graph["rooms"], topology)
            room_bboxes = await run_in_threadpool(_rooms_with_coords_to_bboxes, rooms_with_coords)
        else:
            rooms_with_coords = await run_in_threadpool(layout_by_topology, room_graph["rooms"], topology)
            room_bboxes = await run_in_threadpool(_rooms_with_coords_to_bboxes, rooms_with_coords)

        await websocket.send_json(
            {"stage": "symbols", "progress": 60, "message": "Symbol Service: добавляю мебель..."}
        )
        rooms_with_symbols = await run_in_threadpool(enrich_with_symbols, room_bboxes)

        await websocket.send_json(
            {"stage": "elements", "progress": 70, "message": "Генерирую CAD-элементы..."}
        )
        elements = await run_in_threadpool(generate_elements, rooms_with_symbols)

        await websocket.send_json(
            {"stage": "dxf", "progress": 85, "message": "DXF Service: генерирую чертеж..."}
        )
        job_id, filepath = await run_in_threadpool(generate_dxf, rooms_with_symbols)

        layers_used = list(set(e["layer"] for e in elements))
        n_rooms = len(room_bboxes)

        await websocket.send_json(
            {
                "stage": "done",
                "progress": 100,
                "message": f"Готово! {n_rooms} комнат",
                "elements": elements,
                "download_url": f"/static/downloads/{job_id}.dxf",
                "rooms_count": n_rooms,
                "total_area": room_graph.get("total_area_m2", 0),
                "layers_used": layers_used,
                "engine_used": "topology_layout",
            }
        )
    except WebSocketDisconnect:
        pass
    except Exception as e:
        await websocket.send_json({"stage": "error", "message": str(e)})

def layout_two_floors_topology(rooms, topology):
    FLOOR1 = ["living_room","kitchen","hallway",
               "bathroom","dining_room","garage"]
    FLOOR2 = ["bedroom","bedroom_2","bedroom_3",
               "bathroom_2","office","toilet","balcony"]
    
    floor1_rooms = [r for r in rooms if r["type"] in FLOOR1]
    floor2_rooms = [r for r in rooms if r["type"] not in FLOOR1]
    
    # Разделить топологию на два этажа
    topo1 = filter_topology(topology, 
                            [r["id"] for r in floor1_rooms])
    topo2 = filter_topology(topology,
                            [r["id"] for r in floor2_rooms])
    
    plan1 = layout_by_topology(floor1_rooms, topo1)
    
    max_x = max((r.x + r.width) for r in plan1) if plan1 else 0
    GAP = 3.0
    
    plan2 = layout_by_topology(floor2_rooms, topo2, offset_x=max_x + GAP)
    
    for r in plan1: r.label = f"1эт: {r.label}"
    for r in plan2: r.label = f"2эт: {r.label}"
    
    return plan1 + plan2

def filter_topology(topology, room_ids):
    """Фильтрует топологию оставляя только нужные комнаты"""
    id_set = set(room_ids)
    
    filtered_zones = {}
    for zone, ids in topology["zones"].items():
        filtered = [i for i in ids if i in id_set]
        if filtered:
            filtered_zones[zone] = filtered
    
    filtered_adjacency = [
        pair for pair in topology["adjacency"]
        if pair[0] in id_set and pair[1] in id_set
    ]
    
    filtered_zone_positions = {
        z: p for z, p in topology["zone_positions"].items()
        if z in filtered_zones
    }
    
    return {
        "entry_side": topology["entry_side"],
        "zones": filtered_zones,
        "zone_positions": filtered_zone_positions,
        "adjacency": filtered_adjacency
    }
