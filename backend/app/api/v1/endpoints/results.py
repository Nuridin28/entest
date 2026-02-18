from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
from datetime import datetime

from ....core.database import get_async_db, get_db
from ....api.deps import get_current_active_user
from ....models.user import User
from ....models.test import TestSession, PreliminaryTestSession
from ....services.test_result_service import TestResultService
from ....schemas.test import TestResultResponse

router = APIRouter()


@router.get("/{result_id}")
async def get_test_result(
    result_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Получает результат теста по ID"""
    service = TestResultService(db)
    test_result = await service.get_test_result(result_id)
    
    if not test_result:
        raise HTTPException(status_code=404, detail="Test result not found")
    
    if test_result.user_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    return await service.get_complete_test_results(result_id)


@router.get("/{result_id}/progress")
async def get_test_progress(
    result_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Получает прогресс прохождения теста"""
    service = TestResultService(db)
    test_result = await service.get_test_result(result_id)
    
    if not test_result:
        raise HTTPException(status_code=404, detail="Test result not found")
    
    if test_result.user_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    return await service.get_test_progress(result_id)


@router.get("/user/all")
async def get_user_test_results(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_async_db)
) -> List[TestResultResponse]:
    """Получает все результаты тестов текущего пользователя"""
    service = TestResultService(db)
    test_results = await service.get_user_test_results(current_user.id)
    
    return [
        TestResultResponse(
            id=result.id,
            user_id=result.user_id,
            start_time=result.start_time,
            end_time=result.end_time,
            status=result.status,
            final_cefr_level=result.final_cefr_level,
            final_score=result.final_score,
            preliminary_completed=result.preliminary_completed,
            main_test_completed=result.main_test_completed,
            ai_test_completed=result.ai_test_completed,
            violations_count=result.violations_count,
            is_invalidated=result.is_invalidated,
            invalidation_reason=result.invalidation_reason,
            test_version=result.test_version,
            created_at=result.created_at,
            updated_at=result.updated_at
        )
        for result in test_results
    ]


@router.get("/complete/{main_test_id}")
async def get_complete_test_results(
    main_test_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Получает полные результаты теста включая предварительный и основной тест"""
    
                               
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


@router.post("/{result_id}/invalidate")
async def invalidate_test_result(
    result_id: int,
    reason: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Аннулирует результат теста (только для админов)"""
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    service = TestResultService(db)
    test_result = await service.invalidate_test_result(result_id, reason)
    
    if not test_result:
        raise HTTPException(status_code=404, detail="Test result not found")
    
    return {
        "message": "Test result invalidated successfully",
        "result_id": result_id,
        "reason": reason
    }


@router.get("/admin/all")
async def get_all_test_results(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Получает все результаты тестов (только для админов)"""
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Admin access required")
    
                                              
                                       
    return {"message": "Admin endpoint for all test results"}
