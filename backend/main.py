from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import os

from llm_service import generate_room_graph
from gan_service import generate_floorplan_coords
from dxf_service import create_dxf_from_coords

app = FastAPI(title="AICAD Backend API")

# Mount static files for downloads
static_dir = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(os.path.join(static_dir, "downloads"), exist_ok=True)
app.mount("/downloads", StaticFiles(directory=os.path.join(static_dir, "downloads")), name="downloads")

# Настройка CORS для работы с React (Vite по умолчанию использует порт 5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # В продакшене следует ограничить
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class GenerateRequest(BaseModel):
    prompt: str

class ChatRequest(BaseModel):
    message: str

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Бэкенд AICAD работает"}

@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    """
    Эндпоинт чата для генерации чертежа через сквозной пайплайн
    """
    try:
        # 1. LLM API
        llm_result = await generate_room_graph(request.message)
        
        # 2. FloorplanGAN
        gan_result = await generate_floorplan_coords(llm_result)
        
        # 3. ezdxf
        dxf_url = await create_dxf_from_coords(gan_result)
        
        # Полный URL для скачивания (предполагаем, что сервер запущен на localhost:8000)
        full_dxf_url = f"http://localhost:8000{dxf_url}"
        
        reply_msg = "Чертеж успешно сгенерирован! Вы можете скачать его по ссылке ниже:"
        
        return {
            "reply": reply_msg,
            "status": "success",
            "download_url": full_dxf_url
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate-floorplan")
async def generate_floorplan(request: GenerateRequest):
    """
    Основной пайплайн генерации чертежа.
    Пользователь -> LLM -> FloorplanGAN -> ezdxf -> Фронтенд
    """
    try:
        # 1. LLM API
        llm_result = await generate_room_graph(request.prompt)
        
        # 2. FloorplanGAN
        gan_result = await generate_floorplan_coords(llm_result)
        
        # 3. ezdxf
        dxf_url = await create_dxf_from_coords(gan_result)
        
        return {
            "status": "success",
            "message": "Чертеж успешно сгенерирован",
            "download_url": dxf_url,
            "pipeline_data": {
                "llm": llm_result,
                "gan": gan_result
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/action/{action_id}")
def perform_action(action_id: str):
    # Универсальный эндпоинт для обработки кликов по кнопкам (Draw, Modify, Layers и т.д.)
    return {
        "status": "success",
        "action": action_id,
        "message": f"Действие '{action_id}' успешно обработано сервером."
    }
