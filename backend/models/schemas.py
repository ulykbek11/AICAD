from pydantic import BaseModel
from typing import List, Optional


class GenerateRequest(BaseModel):
    prompt: str
    session_id: Optional[str] = None


class Room(BaseModel):
    id: str
    type: str
    area_m2: float
    min_width: float
    adjacent_to: List[str] = []


class RoomGraph(BaseModel):
    rooms: List[Room]
    total_area_m2: float
    shape: str = "rectangular"


class RoomWithCoords(BaseModel):
    id: str
    type: str
    x: float
    y: float
    width: float
    height: float
    label: str


class GenerateResponse(BaseModel):
    job_id: str
    svg: str
    download_url: str
    rooms_count: int
    total_area: float
    message: str
