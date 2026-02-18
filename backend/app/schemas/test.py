from pydantic import BaseModel, Field, field_serializer
from datetime import datetime
from typing import Optional, List
from ..utils.timezone import format_almaty_time, utc_to_almaty


class QuestionBase(BaseModel):
    test_session_id: str
    question_type: str
    content: str
    options: Optional[str] = None
    correct_answer: Optional[str] = None


class QuestionCreate(QuestionBase):
    pass


class QuestionUpdate(BaseModel):
    user_answer: Optional[str] = None
    score: Optional[float] = None
    feedback: Optional[str] = None


class Question(QuestionBase):
    id: int
    user_answer: Optional[str] = None
    score: Optional[float] = None
    feedback: Optional[str] = None

    class Config:
        from_attributes = True


class TestSessionBase(BaseModel):
    user_id: int
    status: str = "in_progress"
    cefr_level: Optional[str] = None
    reading_score: Optional[float] = None
    listening_score: Optional[float] = None
    writing_score: Optional[float] = None
    speaking_score: Optional[float] = None


class TestSessionCreate(TestSessionBase):
    pass


class TestSessionUpdate(BaseModel):
    status: Optional[str] = None
    end_time: Optional[datetime] = None
    cefr_level: Optional[str] = None
    reading_score: Optional[float] = None
    listening_score: Optional[float] = None
    writing_score: Optional[float] = None
    speaking_score: Optional[float] = None
    initial_photo_path: Optional[str] = None
    screen_recording_path: Optional[str] = None
    recordings_finalized: Optional[bool] = None


class TestSession(TestSessionBase):
    id: str
    start_time: datetime
    end_time: Optional[datetime] = None
    questions: List[Question] = []

    class Config:
        from_attributes = True


class TestStartRequest(BaseModel):
    session_id: str


class TestCompletionRequest(BaseModel):
    score: int


class GenerateTestRequest(BaseModel):
    level: str = "B1"


class SubmitAnswerRequest(BaseModel):
    question_id: int
    answer: str


class SubmitWritingAnswerRequest(BaseModel):
    question_id: int
    answer: str
    level: str = "B1"


                                         
class PreliminaryTestSessionBase(BaseModel):
    user_id: int
    status: str = "in_progress"
    current_level: str
    score_percentage: Optional[float] = None
    next_action: Optional[str] = None
    determined_level: Optional[str] = None


class PreliminaryTestSessionCreate(PreliminaryTestSessionBase):
    pass


class PreliminaryTestSessionUpdate(BaseModel):
    status: Optional[str] = None
    completed_at: Optional[datetime] = None
    score_percentage: Optional[float] = None
    next_action: Optional[str] = None
    determined_level: Optional[str] = None


class PreliminaryQuestionBase(BaseModel):
    session_id: int
    category: str
    question_data: str
    order_number: int


class PreliminaryQuestionCreate(PreliminaryQuestionBase):
    pass


class PreliminaryQuestionUpdate(BaseModel):
    user_answer: Optional[str] = None
    is_correct: Optional[bool] = None
    answered_at: Optional[datetime] = None


                                                       
class TestResultResponse(BaseModel):
    id: int
    user_id: int
    start_time: datetime
    end_time: Optional[datetime] = None
    status: str
    final_cefr_level: Optional[str] = None
    final_score: Optional[float] = None
    preliminary_completed: bool
    main_test_completed: bool
    ai_test_completed: bool
    violations_count: int
    is_invalidated: bool
    invalidation_reason: Optional[str] = None
    test_version: str
    created_at: datetime
    updated_at: datetime
    
                                           
    start_time_almaty: Optional[str] = None
    end_time_almaty: Optional[str] = None
    created_at_almaty: Optional[str] = None
    updated_at_almaty: Optional[str] = None
    
    @field_serializer('start_time_almaty')
    def serialize_start_time_almaty(self, value):
        if self.start_time:
            return format_almaty_time(self.start_time, "%d.%m.%Y, %H:%M:%S")
        return None
    
    @field_serializer('end_time_almaty')
    def serialize_end_time_almaty(self, value):
        if self.end_time:
            return format_almaty_time(self.end_time, "%d.%m.%Y, %H:%M:%S")
        return None
    
    @field_serializer('created_at_almaty')
    def serialize_created_at_almaty(self, value):
        if self.created_at:
            return format_almaty_time(self.created_at, "%d.%m.%Y, %H:%M:%S")
        return None
    
    @field_serializer('updated_at_almaty')
    def serialize_updated_at_almaty(self, value):
        if self.updated_at:
            return format_almaty_time(self.updated_at, "%d.%m.%Y, %H:%M:%S")
        return None

    class Config:
        from_attributes = True


class TestSessionResponse(BaseModel):
    id: str
    user_id: int
    start_time: datetime
    end_time: Optional[datetime] = None
    status: str
    cefr_level: Optional[str] = None
    reading_score: Optional[float] = None
    listening_score: Optional[float] = None
    writing_score: Optional[float] = None
    speaking_score: Optional[float] = None
    
                                           
    start_time_almaty: Optional[str] = None
    end_time_almaty: Optional[str] = None
    
    @field_serializer('start_time_almaty')
    def serialize_start_time_almaty(self, value):
        if self.start_time:
            return format_almaty_time(self.start_time, "%d.%m.%Y, %H:%M:%S")
        return None
    
    @field_serializer('end_time_almaty')
    def serialize_end_time_almaty(self, value):
        if self.end_time:
            return format_almaty_time(self.end_time, "%d.%m.%Y, %H:%M:%S")
        return None

    class Config:
        from_attributes = True