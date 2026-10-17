from dotenv import load_dotenv
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(BACKEND_DIR / ".env", override=True)
load_dotenv()

import os
print("GOOGLE_API_KEY loaded:", (os.getenv("GOOGLE_API_KEY") or "")[:8] + "...")

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

load_dotenv(override=False)

from database import init_db
from routers import generate, export
from routers.auth import router as auth_router
from routers.projects import router as projects_router

app = FastAPI(
    title="Draftly API",
    description="AI-Powered Architectural CAD Platform",
    version="1.0.0"
)

FRONTEND_ORIGINS = os.getenv("FRONTEND_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS + ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("static/downloads", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

app.include_router(auth_router, prefix="/api")
app.include_router(projects_router, prefix="/api")
app.include_router(generate.router, prefix="/api")
app.include_router(export.router, prefix="/api")


@app.on_event("startup")
def startup_event():
    """Initialize database on startup."""
    init_db()
    print("Database initialized")


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "Draftly Backend", "version": "1.0.0"}


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={
            "error": str(exc),
            "type": type(exc).__name__,
        },
    )


# Serve frontend static files in production
FRONTEND_BUILD_DIR = BACKEND_DIR.parent / "frontend" / "dist"

if FRONTEND_BUILD_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_BUILD_DIR / "assets")), name="frontend-assets")
    
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        """Serve the frontend SPA for all non-API routes."""
        if full_path.startswith("api/") or full_path.startswith("static/"):
            return JSONResponse(status_code=404, content={"detail": "Not found"})
        
        file_path = FRONTEND_BUILD_DIR / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        
        return FileResponse(FRONTEND_BUILD_DIR / "index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

