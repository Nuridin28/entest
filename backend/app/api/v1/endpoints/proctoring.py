from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, Dict, Any
from datetime import datetime

from ....core.database import get_db
from ....models.user import User
from ....models.test import TestSession, PreliminaryTestSession
from ....models.proctoring_violations import ProctoringViolation
from ....models.preliminary_proctoring_violations import PreliminaryProctoringViolation
from ....api.deps import get_current_active_user
from pydantic import BaseModel

router = APIRouter()

class ViolationCreate(BaseModel):
    session_id: str
    violation_type: str
    severity: Optional[str] = "medium"
    description: Optional[str] = None
    violation_metadata: Optional[Dict[str, Any]] = None

class ViolationResponse(BaseModel):
    id: int
    session_id: str                                                    
    user_id: int
    violation_type: str
    severity: str
    description: Optional[str]
    violation_metadata: Optional[Dict[str, Any]]
    timestamp: datetime

    class Config:
        from_attributes = True

@router.post("/log-violation", response_model=ViolationResponse)
async def log_proctoring_violation(
    violation: ViolationCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Log a proctoring violation"""
    
                                                                                   
                                                        
    session = db.query(TestSession).filter(
        TestSession.id == violation.session_id,
        TestSession.user_id == current_user.id
    ).first()
    
                                                                             
    if not session:
        try:
                                                                                      
            prelim_session_id = int(violation.session_id)
            prelim_session = db.query(PreliminaryTestSession).filter(
                PreliminaryTestSession.id == prelim_session_id,
                PreliminaryTestSession.user_id == current_user.id
            ).first()
            
            if prelim_session:
                                                                           
                print(f"Found preliminary test session with ID {prelim_session_id}")
                                                                                      
                session = prelim_session
        except (ValueError, TypeError):
                                                                                    
            pass
    
    if not session:
        raise HTTPException(status_code=404, detail="Test session not found")
    
                                                           
    if isinstance(session, PreliminaryTestSession):
                                       
        db_violation = PreliminaryProctoringViolation(
            session_id=session.id,
            user_id=current_user.id,
            violation_type=violation.violation_type,
            severity=violation.severity,
            description=violation.description,
            violation_metadata=violation.violation_metadata
        )
    else:
                                   
        db_violation = ProctoringViolation(
            session_id=violation.session_id,
            user_id=current_user.id,
            violation_type=violation.violation_type,
            severity=violation.severity,
            description=violation.description,
            violation_metadata=violation.violation_metadata
        )
    
    db.add(db_violation)
    db.commit()
    db.refresh(db_violation)
    
                                                                 
    from ....models.test_result import TestResult
    from ....services.test_result_service import TestResultService
    
                                               
    if isinstance(session, PreliminaryTestSession):
        test_result = db.query(TestResult).filter(
            TestResult.preliminary_test_id == session.id
        ).first()
    else:
        test_result = db.query(TestResult).filter(
            TestResult.main_test_id == session.id
        ).first()
    
    if test_result:
                                                              
        from ....core.database import get_async_db
        import asyncio
        
        async def update_violations():
            async for async_db in get_async_db():
                service = TestResultService(async_db)
                await service.update_violations_count(test_result.id)
                break
        
                                     
        try:
            asyncio.create_task(update_violations())
        except Exception as e:
            print(f"Failed to update violations count: {e}")
    
                                                 
    if isinstance(db_violation, PreliminaryProctoringViolation):
                                                           
        return {
            "id": db_violation.id,
            "session_id": str(db_violation.session_id),
            "user_id": db_violation.user_id,
            "violation_type": db_violation.violation_type,
            "severity": db_violation.severity,
            "description": db_violation.description,
            "violation_metadata": db_violation.violation_metadata,
            "timestamp": db_violation.timestamp
        }
    else:
        return db_violation

@router.get("/violations/{session_id}")
async def get_session_violations(
    session_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get all violations for a test session"""
    
                                                               
    session = db.query(TestSession).filter(TestSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Test session not found")
    
    if session.user_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Access denied")
    
    violations = db.query(ProctoringViolation).filter(
        ProctoringViolation.session_id == session_id
    ).order_by(ProctoringViolation.timestamp.desc()).all()
    
    return violations

@router.get("/statistics/{session_id}")
async def get_violation_statistics(
    session_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get violation statistics for a test session"""
    
                   
    session = db.query(TestSession).filter(TestSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Test session not found")
    
    if session.user_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Access denied")
    
    violations = db.query(ProctoringViolation).filter(
        ProctoringViolation.session_id == session_id
    ).all()
    
                          
    stats = {
        "total_violations": len(violations),
        "by_type": {},
        "by_severity": {"low": 0, "medium": 0, "high": 0, "critical": 0},
        "timeline": []
    }
    
    for violation in violations:
                       
        if violation.violation_type not in stats["by_type"]:
            stats["by_type"][violation.violation_type] = 0
        stats["by_type"][violation.violation_type] += 1
        
                           
        if violation.severity in stats["by_severity"]:
            stats["by_severity"][violation.severity] += 1
        
                  
        stats["timeline"].append({
            "timestamp": violation.timestamp,
            "type": violation.violation_type,
            "severity": violation.severity
        })
    
    return stats 