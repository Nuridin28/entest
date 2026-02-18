from datetime import timedelta
from sqlalchemy.orm import Session
from typing import Optional

from ..core.security import create_access_token, verify_token, create_refresh_token
from ..core.config import settings
from .user_service import UserService
from ..schemas.auth import Token
from ..models.user import User


class AuthService:
    def __init__(self, db: Session):
        self.db = db
        self.user_service = UserService(db)

    def authenticate_and_create_token(self, email: str, password: str) -> Optional[Token]:
        user = self.user_service.authenticate_user(email, password)
        if not user:
            return None

        access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
        access_token = create_access_token(
            data={"sub": user.email}, 
            expires_delta=access_token_expires
        )
        refresh_token = create_refresh_token(
            data={"sub": user.email}
        )
        
        return Token(access_token=access_token, token_type="bearer", refresh_token=refresh_token)

    def refresh_token(self, refresh_token: str) -> Optional[Token]:
        email = verify_token(refresh_token)
        if email is None:
            return None
        
        user = self.user_service.get_user_by_email(email)
        if not user:
            return None

        access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
        new_access_token = create_access_token(
            data={"sub": user.email}, 
            expires_delta=access_token_expires
        )
        new_refresh_token = create_refresh_token(
            data={"sub": user.email}
        )
        
        return Token(access_token=new_access_token, token_type="bearer", refresh_token=new_refresh_token)

    def get_current_user(self, token: str) -> Optional[User]:
        try:
            email = verify_token(token)
            if email is None:
                return None
            user = self.user_service.get_user_by_email(email)
            return user
        except Exception:
            return None 