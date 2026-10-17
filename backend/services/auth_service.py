"""
Authentication service for Draftly.
Handles password hashing, JWT tokens, and user verification.
"""

import os
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from models.db_models import User, WaitlistEntry

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    email: Optional[str] = None
    user_id: Optional[int] = None


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: Optional[str]
    is_active: bool
    is_verified: bool
    created_at: datetime

    class Config:
        from_attributes = True


class WaitlistCreate(BaseModel):
    email: EmailStr
    source: Optional[str] = "landing"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password."""
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> Optional[TokenData]:
    """Decode and validate a JWT token."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        user_id: int = payload.get("user_id")
        if email is None:
            return None
        return TokenData(email=email, user_id=user_id)
    except JWTError:
        return None


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    """Get a user by email address."""
    return db.query(User).filter(User.email == email).first()


def get_user_by_id(db: Session, user_id: int) -> Optional[User]:
    """Get a user by ID."""
    return db.query(User).filter(User.id == user_id).first()


def create_user(db: Session, user_data: UserCreate) -> User:
    """Create a new user account."""
    hashed_password = get_password_hash(user_data.password)
    db_user = User(
        email=user_data.email,
        hashed_password=hashed_password,
        full_name=user_data.full_name,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


def authenticate_user(db: Session, email: str, password: str) -> Optional[User]:
    """Authenticate a user with email and password."""
    user = get_user_by_email(db, email)
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


def add_to_waitlist(db: Session, entry: WaitlistCreate) -> dict:
    """Add an email to the waitlist."""
    import secrets
    
    existing = db.query(WaitlistEntry).filter(WaitlistEntry.email == entry.email).first()
    
    if existing:
        if existing.is_verified:
            return {"message": "already_verified", "email": entry.email}
        return {"message": "resent", "email": entry.email}
    
    verification_token = secrets.token_urlsafe(32)
    db_entry = WaitlistEntry(
        email=entry.email,
        source=entry.source,
        verification_token=verification_token,
    )
    db.add(db_entry)
    db.commit()
    
    return {"message": "sent", "email": entry.email}


def verify_waitlist_email(db: Session, token: str) -> dict:
    """Verify a waitlist email using the token."""
    entry = db.query(WaitlistEntry).filter(WaitlistEntry.verification_token == token).first()
    
    if not entry:
        return {"verified": "error"}
    
    if entry.is_verified:
        return {"verified": "already"}
    
    entry.is_verified = True
    entry.verified_at = datetime.utcnow()
    entry.verification_token = None
    db.commit()
    
    return {"verified": "true"}
