from pydantic import BaseModel, EmailStr
from typing import Optional


class UserBase(BaseModel):
    full_name: str
    email: EmailStr


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = None


class UserInDB(UserBase):
    id: int
    hashed_password: str

    class Config:
        from_attributes = True


class User(UserBase):
    id: int
    is_superuser: bool

    class Config:
        from_attributes = True