from sqlalchemy import Column, String, DateTime, ForeignKey, Float, Text, Boolean, Integer, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from ..core.database import Base
from ..utils.timezone import get_almaty_now


class TestResult(Base):
    """Единая таблица для хранения финальных результатов тестирования"""
    __tablename__ = "test_results"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    
                                 
    start_time = Column(DateTime, default=lambda: get_almaty_now().replace(tzinfo=None))
    end_time = Column(DateTime, nullable=True)
    status = Column(String, default="in_progress")                                       
    
                         
    final_cefr_level = Column(String, nullable=True)                          
    final_score = Column(Float, nullable=True)                      
    
                        
    preliminary_completed = Column(Boolean, default=False)
    main_test_completed = Column(Boolean, default=False)
    ai_test_completed = Column(Boolean, default=False)
    
                                    
    preliminary_results = Column(JSON, nullable=True)                                     
    main_test_results = Column(JSON, nullable=True)                                
    ai_test_results = Column(JSON, nullable=True)                           
    
                                     
    preliminary_test_id = Column(Integer, ForeignKey("preliminary_test_sessions.id"), nullable=True)
    main_test_id = Column(String, ForeignKey("test_sessions.id"), nullable=True)
    
                   
    violations_count = Column(Integer, default=0)
    is_invalidated = Column(Boolean, default=False)
    invalidation_reason = Column(String, nullable=True)
    
                
    test_version = Column(String, default="1.0")                                 
    created_at = Column(DateTime, default=lambda: get_almaty_now().replace(tzinfo=None))
    updated_at = Column(DateTime, default=lambda: get_almaty_now().replace(tzinfo=None), 
                       onupdate=lambda: get_almaty_now().replace(tzinfo=None))

                   
    user = relationship("User", back_populates="test_results")
    preliminary_test = relationship("PreliminaryTestSession")
    main_test = relationship("TestSession")