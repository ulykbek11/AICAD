from dotenv import load_dotenv
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(BACKEND_DIR / ".env", override=True)
load_dotenv()

import os
print("GOOGLE_API_KEY loaded:", (os.getenv("GOOGLE_API_KEY") or "")[:8] + "...")

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

# Загружаем .env до импортов роутеров/сервисов, чтобы ключи были доступны при инициализации.
load_dotenv(override=False)

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


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={
            "error": str(exc),
            "type": type(exc).__name__,
        },
    )
