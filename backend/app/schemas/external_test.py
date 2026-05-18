from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, Field


class ExternalQuestionIn(BaseModel):
    question_type: str = Field(..., description="mcq | multi | text")
    content: str
    options: Optional[List[Any]] = None
    correct_answer: Optional[Any] = None
    points: float = 1.0
    order_number: Optional[int] = None


class ExternalQuestionOut(BaseModel):
    id: int
    test_id: int
    order_number: int
    question_type: str
    content: str
    options: Optional[List[Any]] = None
    correct_answer: Optional[Any] = None
    points: float

    class Config:
        from_attributes = True


class ExternalQuestionStudentOut(BaseModel):
    """Question payload shown to students — no correct_answer."""
    id: int
    order_number: int
    question_type: str
    content: str
    options: Optional[List[Any]] = None
    points: float

    class Config:
        from_attributes = True


class ExternalTestCreate(BaseModel):
    title: str
    description: Optional[str] = None
    default_attempt_limit: int = 1
    default_deadline_at: Optional[datetime] = None
    external_owner_id: Optional[str] = None
    is_draft: bool = True
    questions: List[ExternalQuestionIn] = []


class ExternalTestUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    default_attempt_limit: Optional[int] = None
    default_deadline_at: Optional[datetime] = None
    is_archived: Optional[bool] = None
    is_draft: Optional[bool] = None
    questions: Optional[List[ExternalQuestionIn]] = None


class ExternalTestOut(BaseModel):
    id: int
    source: str
    external_owner_id: Optional[str] = None
    title: str
    description: Optional[str] = None
    default_attempt_limit: int
    default_deadline_at: Optional[datetime] = None
    is_archived: bool
    is_draft: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    questions: List[ExternalQuestionOut] = []

    class Config:
        from_attributes = True


class ExternalTestSummary(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    default_attempt_limit: int
    default_deadline_at: Optional[datetime] = None
    is_archived: bool
    is_draft: bool
    question_count: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class IssueAttemptTokenIn(BaseModel):
    test_id: int
    external_user_id: str
    external_user_email: Optional[str] = None
    external_user_name: Optional[str] = None
    external_assignment_id: Optional[str] = None
    attempt_limit: Optional[int] = None
    deadline_at: Optional[datetime] = None
    pk_attempts_used: Optional[int] = None  # authoritative counter from pk side


class IssueAttemptTokenOut(BaseModel):
    attempt_id: int
    token: str
    take_url: str
    expires_at: datetime


class AttemptStartOut(BaseModel):
    attempt_id: int
    test_id: int
    title: str
    description: Optional[str] = None
    status: str
    questions: List[ExternalQuestionStudentOut]


class SubmitAnswer(BaseModel):
    question_id: int
    answer: Any


class AttemptSubmitIn(BaseModel):
    answers: List[SubmitAnswer]


class AttemptSubmitOut(BaseModel):
    attempt_id: int
    status: str
    score: float


class AiGenerateQuestionsIn(BaseModel):
    topic: str
    count: int = 5
    difficulty: str = "medium"
    language: str = "ru"
    question_types: List[str] = ["mcq"]
    instructions: Optional[str] = None


class AiGenerateQuestionsOut(BaseModel):
    questions: List[ExternalQuestionIn]


class ProctoringEventIn(BaseModel):
    event_type: str
    severity: str = "low"
    description: Optional[str] = None
    metadata: Optional[Any] = None
    recorded_at: Optional[datetime] = None


class ProctoringEventOut(BaseModel):
    id: int
    event_type: str
    severity: str
    description: Optional[str] = None
    metadata: Optional[Any] = None
    recorded_at: datetime

    class Config:
        from_attributes = True


class ProctoringDetailsOut(BaseModel):
    attempt_id: int
    initial_photo_url: Optional[str] = None
    violation_count: int
    events: List[ProctoringEventOut]
