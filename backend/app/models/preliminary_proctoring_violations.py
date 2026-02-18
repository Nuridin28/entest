from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..core.database import Base

class PreliminaryProctoringViolation(Base):
    __tablename__ = "preliminary_proctoring_violations"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("preliminary_test_sessions.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    violation_type = Column(String, nullable=False)                                   
    severity = Column(String, default="medium")                               
    description = Column(Text)
    violation_metadata = Column(JSON)                                       
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    
                   
    session = relationship("PreliminaryTestSession")
    user = relationship("User")
    
    def __repr__(self):
        return f"<PreliminaryProctoringViolation {self.violation_type} for session {self.session_id}>"