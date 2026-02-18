from sqlalchemy import Column, String, DateTime, ForeignKey, Text, Integer
from sqlalchemy.orm import relationship
from datetime import datetime
from ..core.database import Base

class ProctoringLog(Base):
    __tablename__ = "proctoring_logs"

    id = Column(Integer, primary_key=True, index=True)
    test_session_id = Column(String, ForeignKey("test_sessions.id"))
    timestamp = Column(DateTime, default=datetime.utcnow)
    event_type = Column(String, index=True)   
    event_data = Column(Text, nullable=True)   

    test_session = relationship("TestSession", back_populates="proctoring_logs") 