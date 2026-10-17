"""
Tests for authentication service.
"""

import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from services.auth_service import (
    verify_password,
    get_password_hash,
    create_access_token,
    decode_token,
    UserCreate,
    WaitlistCreate,
)


class TestPasswordHashing:
    def test_hash_and_verify(self):
        password = "secure_password_123"
        hashed = get_password_hash(password)
        assert hashed != password
        assert verify_password(password, hashed)

    def test_wrong_password_fails(self):
        password = "secure_password_123"
        wrong_password = "wrong_password"
        hashed = get_password_hash(password)
        assert not verify_password(wrong_password, hashed)

    def test_different_hashes_for_same_password(self):
        password = "secure_password_123"
        hash1 = get_password_hash(password)
        hash2 = get_password_hash(password)
        assert hash1 != hash2
        assert verify_password(password, hash1)
        assert verify_password(password, hash2)


class TestJwtTokens:
    def test_create_and_decode_token(self):
        data = {"sub": "test@example.com", "user_id": 123}
        token = create_access_token(data)
        assert token is not None
        
        decoded = decode_token(token)
        assert decoded is not None
        assert decoded.email == "test@example.com"
        assert decoded.user_id == 123

    def test_invalid_token_returns_none(self):
        invalid_token = "this.is.not.a.valid.token"
        decoded = decode_token(invalid_token)
        assert decoded is None

    def test_tampered_token_returns_none(self):
        data = {"sub": "test@example.com", "user_id": 123}
        token = create_access_token(data)
        tampered = token[:-5] + "xxxxx"
        decoded = decode_token(tampered)
        assert decoded is None


class TestUserCreate:
    def test_valid_user_create(self):
        user = UserCreate(
            email="test@example.com",
            password="password123",
            full_name="Test User"
        )
        assert user.email == "test@example.com"
        assert user.password == "password123"
        assert user.full_name == "Test User"

    def test_user_create_without_name(self):
        user = UserCreate(
            email="test@example.com",
            password="password123"
        )
        assert user.email == "test@example.com"
        assert user.full_name is None

    def test_invalid_email_raises_error(self):
        with pytest.raises(Exception):
            UserCreate(
                email="not-an-email",
                password="password123"
            )


class TestWaitlistCreate:
    def test_valid_waitlist_entry(self):
        entry = WaitlistCreate(
            email="test@example.com",
            source="landing"
        )
        assert entry.email == "test@example.com"
        assert entry.source == "landing"

    def test_default_source(self):
        entry = WaitlistCreate(email="test@example.com")
        assert entry.source == "landing"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
