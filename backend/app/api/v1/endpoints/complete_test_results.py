from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, Dict, Any, List
from datetime import datetime

from ....core.database import get_db
from ....models.user import User
from ....models.test import TestSession, PreliminaryTestSession
from ....api.deps import get_current_active_user

router = APIRouter()

@router.get("/{main_test_id}")
async def get_complete_test_results(
    main_test_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get complete test results including preliminary and main test"""
    
                               
    main_test = db.query(TestSession).filter(
        TestSession.id == main_test_id,
        TestSession.user_id == current_user.id
    ).first()
    
    if not main_test:
        raise HTTPException(status_code=404, detail="Main test session not found")
    
                                      
    preliminary_test = None
    if main_test.preliminary_test_id:
        preliminary_test = db.query(PreliminaryTestSession).filter(
            PreliminaryTestSession.id == main_test.preliminary_test_id
        ).first()
    
                          
    result = {
        "user_id": current_user.id,
        "user_name": current_user.full_name,
        "main_test": {
            "id": main_test.id,
            "status": main_test.status,
            "start_time": main_test.start_time,
            "end_time": main_test.end_time,
            "cefr_level": main_test.cefr_level,
            "reading_score": main_test.reading_score,
            "listening_score": main_test.listening_score,
            "writing_score": main_test.writing_score,
            "speaking_score": main_test.speaking_score,
            "final_score": main_test.final_score,
            "is_invalidated": main_test.is_invalidated,
            "invalidation_reason": main_test.invalidation_reason
        }
    }
    
    if preliminary_test:
        result["preliminary_test"] = {
            "id": preliminary_test.id,
            "status": preliminary_test.status,
            "start_time": preliminary_test.start_time,
            "completed_at": preliminary_test.completed_at,
            "current_level": preliminary_test.current_level,
            "score_percentage": preliminary_test.score_percentage,
            "determined_level": preliminary_test.determined_level
        }
    
                                              
    from ....models.proctoring_violations import ProctoringViolation
    from ....models.preliminary_proctoring_violations import PreliminaryProctoringViolation
    
    main_violations = db.query(ProctoringViolation).filter(
        ProctoringViolation.session_id == main_test.id
    ).all()
    
    preliminary_violations = []
    if preliminary_test:
        preliminary_violations = db.query(PreliminaryProctoringViolation).filter(
            PreliminaryProctoringViolation.session_id == preliminary_test.id
        ).all()
    
                                    
    result["violations"] = {
        "main_test": [
            {
                "type": v.violation_type,
                "severity": v.severity,
                "timestamp": v.timestamp,
                "description": v.description
            } for v in main_violations
        ],
        "preliminary_test": [
            {
                "type": v.violation_type,
                "severity": v.severity,
                "timestamp": v.timestamp,
                "description": v.description
            } for v in preliminary_violations
        ]
    }
    
                                
    result["total_violations"] = len(main_violations) + len(preliminary_violations)
    
    return result