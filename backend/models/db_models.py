"""
Database models for Draftly platform.
Includes User, Project, Drawing, and Waitlist models.
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from database import Base


class User(Base):
    """User account model."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    projects = relationship("Project", back_populates="owner", cascade="all, delete-orphan")


class Project(Base):
    """User project containing multiple drawings."""
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    owner = relationship("User", back_populates="projects")
    drawings = relationship("Drawing", back_populates="project", cascade="all, delete-orphan")


class Drawing(Base):
    """Individual floor plan drawing."""
    __tablename__ = "drawings"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    
    prompt = Column(Text, nullable=True)
    total_area_m2 = Column(Float, nullable=True)
    rooms_count = Column(Integer, nullable=True)
    shape = Column(String(50), nullable=True)
    num_floors = Column(Integer, default=1)
    
    elements = Column(JSON, nullable=True)
    rooms_data = Column(JSON, nullable=True)
    
    dxf_path = Column(String(500), nullable=True)
    svg_path = Column(String(500), nullable=True)
    pdf_path = Column(String(500), nullable=True)
    
    layers_enabled = Column(JSON, default=lambda: {
        "walls": True,
        "doors": True,
        "windows": True,
        "furniture": True,
        "dimensions": True,
        "electrical": False,
        "plumbing": False
    })
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    project = relationship("Project", back_populates="drawings")


class WaitlistEntry(Base):
    """Beta waitlist signup."""
    __tablename__ = "waitlist"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    is_verified = Column(Boolean, default=False)
    verification_token = Column(String(255), nullable=True)
    source = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    verified_at = Column(DateTime, nullable=True)
