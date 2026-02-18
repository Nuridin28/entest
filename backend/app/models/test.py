from sqlalchemy import Column, String, DateTime, ForeignKey, Float, Text, Boolean, Integer
from sqlalchemy.orm import relationship
from datetime import datetime
from ..core.database import Base
from .proctoring_log import ProctoringLog


class TestSession(Base):
    __tablename__ = "test_sessions"

    id = Column(String, primary_key=True, index=True)   
    user_id = Column(Integer, ForeignKey("users.id"))
    start_time = Column(DateTime, default=datetime.utcnow)
    end_time = Column(DateTime, nullable=True)
    status = Column(String, default="in_progress") 
    cefr_level = Column(String, nullable=True)
    reading_score = Column(Float, nullable=True)
    listening_score = Column(Float, nullable=True)
    writing_score = Column(Float, nullable=True)
    speaking_score = Column(Float, nullable=True)
    final_score = Column(Float, nullable=True)
    initial_photo_path = Column(String, nullable=True)
    screen_recording_path = Column(String, nullable=True)
    recordings_finalized = Column(Boolean, default=False)
    is_invalidated = Column(Boolean, default=False)
    invalidation_reason = Column(String, nullable=True)
    preliminary_test_id = Column(Integer, ForeignKey("preliminary_test_sessions.id"), nullable=True)

    user = relationship("User", back_populates="test_sessions")
    questions = relationship("Question", back_populates="test_session")
    proctoring_logs = relationship("ProctoringLog", back_populates="test_session")
    violations = relationship("ProctoringViolation", back_populates="session")
    preliminary_test = relationship("PreliminaryTestSession", backref="main_test")


class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)
    test_session_id = Column(String, ForeignKey("test_sessions.id"))
    question_type = Column(String)   
    content = Column(Text)  
    options = Column(Text, nullable=True)  
    correct_answer = Column(Text, nullable=True)
    user_answer = Column(Text, nullable=True)
    score = Column(Float, nullable=True)
    feedback = Column(Text, nullable=True)

    test_session = relationship("TestSession", back_populates="questions")


class PreliminaryTestSession(Base):
    __tablename__ = "preliminary_test_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    start_time = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    status = Column(String, default="in_progress")                                 
    current_level = Column(String)                                                                
    score_percentage = Column(Float, nullable=True)
    next_action = Column(String, nullable=True)                                     
    determined_level = Column(String, nullable=True)
    screen_recording_path = Column(String, nullable=True)                            
    initial_photo_path = Column(String, nullable=True)                         

    user = relationship("User", back_populates="preliminary_test_sessions")
    questions = relationship("PreliminaryQuestion", back_populates="session")


class PreliminaryQuestion(Base):
    __tablename__ = "preliminary_questions"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("preliminary_test_sessions.id"))
    category = Column(String)                                
    question_data = Column(Text)                       
    user_answer = Column(String, nullable=True)
    is_correct = Column(Boolean, nullable=True)
    answered_at = Column(DateTime, nullable=True)
    order_number = Column(Integer)

    session = relationship("PreliminaryTestSession", back_populates="questions") 