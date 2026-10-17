"""
Projects API routes.
Handles CRUD operations for user projects and drawings.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from database import get_db
from models.db_models import Project, Drawing
from routers.auth import get_current_user

router = APIRouter(prefix="/projects", tags=["projects"])


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class DrawingCreate(BaseModel):
    name: str
    prompt: Optional[str] = None
    total_area_m2: Optional[float] = None
    rooms_count: Optional[int] = None
    shape: Optional[str] = None
    num_floors: Optional[int] = 1
    elements: Optional[list] = None
    rooms_data: Optional[list] = None
    layers_enabled: Optional[dict] = None


class DrawingUpdate(BaseModel):
    name: Optional[str] = None
    elements: Optional[list] = None
    rooms_data: Optional[list] = None
    layers_enabled: Optional[dict] = None
    dxf_path: Optional[str] = None
    svg_path: Optional[str] = None
    pdf_path: Optional[str] = None


class DrawingResponse(BaseModel):
    id: int
    name: str
    project_id: int
    prompt: Optional[str]
    total_area_m2: Optional[float]
    rooms_count: Optional[int]
    shape: Optional[str]
    num_floors: int
    elements: Optional[list]
    rooms_data: Optional[list]
    layers_enabled: Optional[dict]
    dxf_path: Optional[str]
    svg_path: Optional[str]
    pdf_path: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ProjectResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    owner_id: int
    created_at: datetime
    updated_at: datetime
    drawings: List[DrawingResponse] = []

    class Config:
        from_attributes = True


class ProjectListResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    drawings_count: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("/", response_model=List[ProjectListResponse])
async def list_projects(
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all projects for the current user."""
    projects = db.query(Project).filter(Project.owner_id == current_user.id).all()
    
    result = []
    for p in projects:
        result.append(ProjectListResponse(
            id=p.id,
            name=p.name,
            description=p.description,
            drawings_count=len(p.drawings),
            created_at=p.created_at,
            updated_at=p.updated_at
        ))
    
    return result


@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    project_data: ProjectCreate,
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new project."""
    project = Project(
        name=project_data.name,
        description=project_data.description,
        owner_id=current_user.id
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: int,
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific project with all its drawings."""
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.owner_id == current_user.id
    ).first()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    return project


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int,
    project_data: ProjectUpdate,
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a project."""
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.owner_id == current_user.id
    ).first()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    if project_data.name is not None:
        project.name = project_data.name
    if project_data.description is not None:
        project.description = project_data.description
    
    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: int,
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a project and all its drawings."""
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.owner_id == current_user.id
    ).first()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    db.delete(project)
    db.commit()


@router.post("/{project_id}/drawings", response_model=DrawingResponse, status_code=status.HTTP_201_CREATED)
async def create_drawing(
    project_id: int,
    drawing_data: DrawingCreate,
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new drawing in a project."""
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.owner_id == current_user.id
    ).first()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    drawing = Drawing(
        name=drawing_data.name,
        project_id=project_id,
        prompt=drawing_data.prompt,
        total_area_m2=drawing_data.total_area_m2,
        rooms_count=drawing_data.rooms_count,
        shape=drawing_data.shape,
        num_floors=drawing_data.num_floors or 1,
        elements=drawing_data.elements,
        rooms_data=drawing_data.rooms_data,
        layers_enabled=drawing_data.layers_enabled
    )
    db.add(drawing)
    db.commit()
    db.refresh(drawing)
    return drawing


@router.get("/{project_id}/drawings/{drawing_id}", response_model=DrawingResponse)
async def get_drawing(
    project_id: int,
    drawing_id: int,
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific drawing."""
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.owner_id == current_user.id
    ).first()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    drawing = db.query(Drawing).filter(
        Drawing.id == drawing_id,
        Drawing.project_id == project_id
    ).first()
    
    if not drawing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Drawing not found"
        )
    
    return drawing


@router.put("/{project_id}/drawings/{drawing_id}", response_model=DrawingResponse)
async def update_drawing(
    project_id: int,
    drawing_id: int,
    drawing_data: DrawingUpdate,
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a drawing."""
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.owner_id == current_user.id
    ).first()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    drawing = db.query(Drawing).filter(
        Drawing.id == drawing_id,
        Drawing.project_id == project_id
    ).first()
    
    if not drawing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Drawing not found"
        )
    
    if drawing_data.name is not None:
        drawing.name = drawing_data.name
    if drawing_data.elements is not None:
        drawing.elements = drawing_data.elements
    if drawing_data.rooms_data is not None:
        drawing.rooms_data = drawing_data.rooms_data
    if drawing_data.layers_enabled is not None:
        drawing.layers_enabled = drawing_data.layers_enabled
    if drawing_data.dxf_path is not None:
        drawing.dxf_path = drawing_data.dxf_path
    if drawing_data.svg_path is not None:
        drawing.svg_path = drawing_data.svg_path
    if drawing_data.pdf_path is not None:
        drawing.pdf_path = drawing_data.pdf_path
    
    db.commit()
    db.refresh(drawing)
    return drawing


@router.delete("/{project_id}/drawings/{drawing_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_drawing(
    project_id: int,
    drawing_id: int,
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a drawing."""
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.owner_id == current_user.id
    ).first()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    drawing = db.query(Drawing).filter(
        Drawing.id == drawing_id,
        Drawing.project_id == project_id
    ).first()
    
    if not drawing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Drawing not found"
        )
    
    db.delete(drawing)
    db.commit()
