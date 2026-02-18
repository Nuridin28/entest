from pydantic import BaseModel, EmailStr
from typing import Optional


class Token(BaseModel):
    access_token: str
    token_type: str
    refresh_token: Optional[str] = None


class TokenData(BaseModel):
    email: Optional[EmailStr] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str 