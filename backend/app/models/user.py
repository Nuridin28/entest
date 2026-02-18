from sqlalchemy import Column, String, Boolean, Integer
from sqlalchemy.orm import relationship
from .base import BaseModel


class User(BaseModel):
    __tablename__ = "users"

    full_name = Column(String, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    is_superuser = Column(Boolean(), default=False)
    test_attempts_used = Column(Integer, default=0)                                     
    max_test_attempts = Column(Integer, default=3)                                    

    test_sessions = relationship("TestSession", back_populates="user")
    preliminary_test_sessions = relationship("PreliminaryTestSession", back_populates="user")
    test_results = relationship("TestResult", back_populates="user")