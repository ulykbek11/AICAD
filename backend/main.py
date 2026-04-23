from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
from pathlib import Path
from dotenv import load_dotenv

# Загружаем .env до импортов роутеров/сервисов, чтобы ключи были доступны при инициализации.
BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(BACKEND_DIR / ".env")
load_dotenv()

from routers import generate, export

app = FastAPI(title="AICAD Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("static/downloads", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

app.include_router(generate.router, prefix="/api")
app.include_router(export.router, prefix="/api")

@app.get("/")
def health():
    return {"status": "ok", "service": "AICAD Backend"}
