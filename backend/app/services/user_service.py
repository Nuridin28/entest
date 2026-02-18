from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import Optional

from ..models.user import User
from ..schemas.user import UserCreate, UserUpdate
from ..core.security import get_password_hash, verify_password


class UserService:
    def __init__(self, db: Session):
        self.db = db

    def get_user_by_email(self, email: str) -> Optional[User]:
        return self.db.query(User).filter(User.email == email).first()

    def get_user_by_id(self, user_id: int) -> Optional[User]:
        return self.db.query(User).filter(User.id == user_id).first()

    def create_user(self, user_data: UserCreate) -> User:
        hashed_password = get_password_hash(user_data.password)
        db_user = User(
            full_name=user_data.full_name,
            email=user_data.email,
            hashed_password=hashed_password
        )
        self.db.add(db_user)
        try:
            self.db.commit()
            self.db.refresh(db_user)
            return db_user
        except IntegrityError as e:
            self.db.rollback()
            if "duplicate key value violates unique constraint" in str(e) and "email" in str(e):
                raise ValueError("Email already registered")
            raise e

    def update_user(self, user_id: int, user_data: UserUpdate) -> Optional[User]:
        db_user = self.get_user_by_id(user_id)
        if not db_user:
            return None

        update_data = user_data.dict(exclude_unset=True)
        if "password" in update_data:
            update_data["hashed_password"] = get_password_hash(update_data.pop("password"))

        for field, value in update_data.items():
            setattr(db_user, field, value)

        self.db.commit()
        self.db.refresh(db_user)
        return db_user

    def authenticate_user(self, email: str, password: str) -> Optional[User]:
        user = self.get_user_by_email(email)
        if not user or not verify_password(password, user.hashed_password):
            return None
        return user 

    def can_start_test(self, user_id: int) -> bool:
        """Проверяет, может ли пользователь начать новый тест"""
        user = self.get_user_by_id(user_id)
        if not user:
            return False
        return user.test_attempts_used < user.max_test_attempts

    def get_remaining_attempts(self, user_id: int) -> int:
        """Возвращает количество оставшихся попыток"""
        user = self.get_user_by_id(user_id)
        if not user:
            return 0
        return max(0, user.max_test_attempts - user.test_attempts_used)

    def increment_test_attempt(self, user_id: int) -> bool:
        """Увеличивает счетчик попыток пользователя"""
        user = self.get_user_by_id(user_id)
        if not user or user.test_attempts_used >= user.max_test_attempts:
            return False
        
        user.test_attempts_used += 1
        self.db.commit()
        self.db.refresh(user)
        return True

    def reset_test_attempts(self, user_id: int) -> bool:
        """Сбрасывает счетчик попыток (только для админов)"""
        user = self.get_user_by_id(user_id)
        if not user:
            return False
        
        user.test_attempts_used = 0
        self.db.commit()
        self.db.refresh(user)
        return True