from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Float, Text, Boolean
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from datetime import datetime
from ..core.database import Base


class ExternalTest(Base):
    """Test template created by an external admin (e.g. KBTU pk admin)."""
    __tablename__ = "external_tests"

    id = Column(Integer, primary_key=True, index=True)
    source = Column(String, nullable=False, default="pk", index=True)
    external_owner_id = Column(String, nullable=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    default_attempt_limit = Column(Integer, nullable=False, default=1)
    default_deadline_at = Column(DateTime, nullable=True)
    is_archived = Column(Boolean, nullable=False, default=False)
    is_draft = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    questions = relationship(
        "ExternalQuestion",
        back_populates="test",
        cascade="all, delete-orphan",
        order_by="ExternalQuestion.order_number",
    )
    attempts = relationship("ExternalAttempt", back_populates="test", cascade="all, delete-orphan")


class ExternalQuestion(Base):
    __tablename__ = "external_questions"

    id = Column(Integer, primary_key=True, index=True)
    test_id = Column(Integer, ForeignKey("external_tests.id", ondelete="CASCADE"), nullable=False, index=True)
    order_number = Column(Integer, nullable=False, default=0)
    question_type = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    options = Column(JSONB, nullable=True)
    correct_answer = Column(JSONB, nullable=True)
    points = Column(Float, nullable=False, default=1.0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    test = relationship("ExternalTest", back_populates="questions")


class ExternalAttempt(Base):
    __tablename__ = "external_attempts"

    id = Column(Integer, primary_key=True, index=True)
    test_id = Column(Integer, ForeignKey("external_tests.id", ondelete="CASCADE"), nullable=False, index=True)
    external_user_id = Column(String, nullable=False, index=True)
    external_user_email = Column(String, nullable=True)
    external_user_name = Column(String, nullable=True)
    external_assignment_id = Column(String, nullable=True, index=True)
    status = Column(String, nullable=False, default="in_progress", index=True)
    score = Column(Float, nullable=True)
    answers = Column(JSONB, nullable=True)
    initial_photo_path = Column(String, nullable=True)
    screen_recording_path = Column(String, nullable=True)
    violation_count = Column(Integer, nullable=False, default=0)
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    webhook_delivered_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    test = relationship("ExternalTest", back_populates="attempts")
    proctoring_events = relationship(
        "ExternalProctoringEvent",
        back_populates="attempt",
        cascade="all, delete-orphan",
        order_by="ExternalProctoringEvent.recorded_at",
    )
    violations = relationship(
        "ProctoringViolation",
        back_populates="external_attempt",
        cascade="all, delete-orphan",
    )


class ExternalProctoringEvent(Base):
    __tablename__ = "external_proctoring_events"

    id = Column(Integer, primary_key=True, index=True)
    attempt_id = Column(Integer, ForeignKey("external_attempts.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type = Column(String, nullable=False, index=True)
    severity = Column(String, nullable=False, default="low")
    description = Column(Text, nullable=True)
    event_metadata = Column(JSONB, nullable=True)
    recorded_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    attempt = relationship("ExternalAttempt", back_populates="proctoring_events")
