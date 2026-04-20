from fastapi import APIRouter
from fastapi.responses import FileResponse
import os

router = APIRouter()


@router.get("/export/dxf/{job_id}")
def export_dxf(job_id: str):
    filepath = f"static/downloads/{job_id}.dxf"
    if not os.path.exists(filepath):
        return {"error": "File not found"}
    return FileResponse(
        filepath,
        media_type="application/octet-stream",
        filename=f"drawing_{job_id}.dxf",
    )
