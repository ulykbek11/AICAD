from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
from dotenv import load_dotenv

from routers import generate, export

load_dotenv()

app = FastAPI(title="AICAD Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("CORS_ORIGIN", "http://localhost:5173")],
    allow_credentials=True,
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
