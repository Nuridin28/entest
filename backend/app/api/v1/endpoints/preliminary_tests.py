from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any
import os
import time
import asyncio

from ....core.database import get_async_db
from ....api.deps import get_current_active_user
from ....services.preliminary_test_service import PreliminaryTestService
from ....schemas.user import User
from ....utils.timezone import get_almaty_now
from ....utils.file_paths import ensure_upload_directory, FileTypes, get_relative_upload_path
from pydantic import BaseModel

router = APIRouter()


class SubmitAnswerRequest(BaseModel):
    question_id: int
    answer: str


                                    
class InitRequest(BaseModel):
    uploadId: str
    totalChunks: int
    filename: str


class FinalizeRequest(BaseModel):
    uploadId: str


class CleanupRequest(BaseModel):
    uploadId: str




@router.get("/attempts/check")
async def check_preliminary_test_attempts(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Проверяет количество доступных попыток для пользователя"""
    from ....services.test_result_service import TestResultService
    
    test_result_service = TestResultService(db)
    attempts_info = await test_result_service.can_user_start_test(current_user.id)
    return attempts_info


@router.post("/start")
async def start_preliminary_test(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Начинает предварительное тестирование"""
    from ....services.test_result_service import TestResultService
    
                                             
    result_service = TestResultService(db)
    attempts_info = await result_service.can_user_start_test(current_user.id)
    
    if not attempts_info["can_start"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "message": "Maximum test attempts exceeded",
                "attempts_used": attempts_info["attempts_used"],
                "max_attempts": attempts_info["max_attempts"],
                "remaining_attempts": attempts_info["remaining_attempts"]
            }
        )
    
    try:
                                                                
        test_result = await result_service.create_test_result(current_user.id)
        
                                      
        service = PreliminaryTestService(db)
        session = await service.create_preliminary_test_session(current_user.id)
        
                                                            
        test_result.preliminary_test_id = session.id
        db.add(test_result)
        await db.commit()
        
        return {
            "session_id": session.id,
            "test_result_id": test_result.id,
            "status": "created",
            "remaining_attempts": attempts_info["remaining_attempts"] - 1
        }
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(e)
        )


@router.post("/{session_id}/generate/{level}")
async def generate_level_test(
    session_id: int,
    level: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Генерирует тест для определенного уровня"""
    service = PreliminaryTestService(db)
    
                                                   
    session = await service.get_preliminary_test_session(session_id)
    if not session or session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    try:
        result = await service.generate_level_test(session_id, level)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{session_id}/questions")
async def get_test_questions(
    session_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Получает все вопросы для сессии"""
    service = PreliminaryTestService(db)
    
                                                   
    session = await service.get_preliminary_test_session(session_id)
    if not session or session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    questions = await service.get_test_questions(session_id)
    return questions


@router.post("/{session_id}/submit")
async def submit_answer(
    session_id: int,
    request: SubmitAnswerRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Отправляет ответ на вопрос"""
    try:
        service = PreliminaryTestService(db)
        
                                                       
        session = await service.get_preliminary_test_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        if session.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized")
        
        result = await service.submit_answer(request.question_id, request.answer)
        
                                                                       
                                 
        return result
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in submit_answer endpoint: {str(e)}")
                                                         
        return {
            "is_correct": False,
            "correct_answer": None,
            "error": str(e)
        }


@router.post("/{session_id}/complete")
async def complete_test(
    session_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Завершает предварительное тестирование"""
    service = PreliminaryTestService(db)
    
                                                   
    session = await service.get_preliminary_test_session(session_id)
    if not session or session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
                                                          
    if session.status == "completed":
        print(f"Session {session_id} already completed, returning cached result")
                                               
        test_result_id = await service.get_test_result_id_by_preliminary_session(session_id)
        
                                                                                    
        next_action = {"action": session.next_action}
        if session.determined_level:
            next_action["level"] = session.determined_level
        
                                 
        cached_result = {
            "test_result_id": test_result_id,
            "score_percentage": session.score_percentage or 0,
            "passed": session.score_percentage >= 70 if session.score_percentage else False,
            "current_level": session.current_level,
            "next_action": next_action
        }
        
                                                                
        if session.next_action == "ai_test":
            from ....services.test_result_service import TestResultService
            result_service = TestResultService(db)
            test_result = await result_service.get_test_result(test_result_id) if test_result_id else None
            
            if test_result and test_result.main_test_id:
                cached_result.update({
                    "ai_test_session_id": test_result.main_test_id,
                    "ai_test_level": session.determined_level or "intermediate",
                    "ai_test_status": "ready"
                })
        
        return cached_result
    
                                                              
    if session.status not in ["in_progress", "ready"]:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot complete test in status: {session.status}"
        )
    
    try:
                                      
        test_result_id = await service.get_test_result_id_by_preliminary_session(session_id)
        
                                                 
        result = await service.complete_test_session(session_id, test_result_id)
        
                                          
        result["test_result_id"] = test_result_id
        
                                     
        print(f"DEBUG: Complete test result for session {session_id}: {result}")
        next_action = result.get("next_action", {})
        print(f"DEBUG: Next action: {next_action}")
        
                                                                       
        if next_action.get("action") == "ai_test":
            from ....services.test_service import TestService
            from ....services.test_result_service import TestResultService
            import uuid
            import asyncio
            
            test_service = TestService(db)
            result_service = TestResultService(db)
            
                                                
            main_session_id = str(uuid.uuid4())
            main_session = await test_service.create_test_session(main_session_id, current_user.id)
            
                                                
            main_session.preliminary_test_id = session_id
            db.add(main_session)
            await db.commit()
            await db.refresh(main_session)
            
                                                            
            test_result = await result_service.get_test_result(test_result_id)
            if test_result:
                test_result.main_test_id = main_session_id
                db.add(test_result)
                await db.commit()
            
                                             
            ai_test_level = result.get("next_action", {}).get("level", "intermediate")
            
                                                           
            async def generate_ai_test():
                try:
                    await test_service.generate_full_test(main_session_id, ai_test_level)
                    print(f"ИИ тест уровня {ai_test_level} успешно сгенерирован для сессии {main_session_id}")
                except Exception as e:
                    print(f"Ошибка генерации ИИ теста: {e}")
                                                       
                    main_session.status = "error"
                    db.add(main_session)
                    await db.commit()
            
                                                  
            asyncio.create_task(generate_ai_test())
            
                                                      
            result["ai_test_session_id"] = main_session_id
            result["ai_test_level"] = ai_test_level
            result["ai_test_status"] = "generating"
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{session_id}/status")
async def get_session_status(
    session_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Получает статус сессии предварительного тестирования"""
    service = PreliminaryTestService(db)
    
    session = await service.get_preliminary_test_session(session_id)
    if not session or session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    return {
        "session_id": session.id,
        "status": session.status,
        "current_level": session.current_level,
        "score_percentage": session.score_percentage,
        "next_action": session.next_action,
        "determined_level": session.determined_level,
        "completed_at": session.completed_at
    }


@router.post("/{session_id}/start-ai-test")
async def start_ai_test(
    session_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Запускает ИИ тест на основе результатов предварительного тестирования"""
    from ....services.test_service import TestService
    from ....services.test_result_service import TestResultService
    import uuid
    import asyncio
    
    prelim_service = PreliminaryTestService(db)
    test_service = TestService(db)
    result_service = TestResultService(db)
    
                                                
    session = await prelim_service.get_preliminary_test_session(session_id)
    if not session or session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    if session.status != "completed" or session.next_action != "ai_test":
        raise HTTPException(status_code=400, detail="AI test not required for this preliminary test")
    
                                  
    test_result_id = await prelim_service.get_test_result_id_by_preliminary_session(session_id)
    if not test_result_id:
        raise HTTPException(status_code=404, detail="Test result not found")
    
                                               
    test_result = await result_service.get_test_result(test_result_id)
    if test_result and test_result.main_test_id:
                                              
        existing_session = await test_service.get_test_session(test_result.main_test_id)
        if existing_session:
            return {
                "ai_test_session_id": test_result.main_test_id,
                "ai_test_level": session.determined_level,
                "ai_test_status": existing_session.status,
                "message": "AI test already exists"
            }
    
                                        
    main_session_id = str(uuid.uuid4())
    main_session = await test_service.create_test_session(main_session_id, current_user.id)
    
                                        
    main_session.preliminary_test_id = session_id
    db.add(main_session)
    await db.commit()
    await db.refresh(main_session)
    
                                                    
    if test_result:
        test_result.main_test_id = main_session_id
        db.add(test_result)
        await db.commit()
    
                                     
    ai_test_level = session.determined_level or "intermediate"
    
                                                   
    async def generate_ai_test():
        try:
            await test_service.generate_full_test(main_session_id, ai_test_level)
            print(f"ИИ тест уровня {ai_test_level} успешно сгенерирован для сессии {main_session_id}")
        except Exception as e:
            print(f"Ошибка генерации ИИ теста: {e}")
                                               
            main_session.status = "error"
            db.add(main_session)
            await db.commit()
    
                                          
    asyncio.create_task(generate_ai_test())
    
    return {
        "ai_test_session_id": main_session_id,
        "ai_test_level": ai_test_level,
        "ai_test_status": "generating",
        "test_result_id": test_result_id,
        "preliminary_session_id": session_id
    }


@router.post("/{session_id}/annul")
async def annul_preliminary_test(
    session_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Аннулирует предварительный тест из-за нарушений прокторинга"""
    from ....services.test_result_service import TestResultService
    
    prelim_service = PreliminaryTestService(db)
    result_service = TestResultService(db)
    
                                                   
    session = await prelim_service.get_preliminary_test_session(session_id)
    if not session or session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
                                  
    test_result_id = await prelim_service.get_test_result_id_by_preliminary_session(session_id)
    if not test_result_id:
        raise HTTPException(status_code=404, detail="Test result not found")
    
    try:
                                                 
        await prelim_service.update_preliminary_test_session(
            session_id, 
            status="annulled",
            completed_at=get_almaty_now().replace(tzinfo=None)
        )
        
                                    
        await result_service.invalidate_test_result(
            test_result_id, 
            "Тест автоматически завершен из-за многократных серьезных нарушений."
        )
        
        return {
            "session_id": session_id,
            "test_result_id": test_result_id,
            "status": "annulled",
            "message": "Test has been annulled due to proctoring violations"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to annul test: {str(e)}")


@router.post("/{session_id}/create-main-test")
async def create_main_test_from_preliminary(
    session_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Создает основной тест на основе результатов предварительного тестирования"""
    from ....services.test_service import TestService
    from ....services.test_result_service import TestResultService
    import uuid
    
    prelim_service = PreliminaryTestService(db)
    test_service = TestService(db)
    result_service = TestResultService(db)
    
                                                
    session = await prelim_service.get_preliminary_test_session(session_id)
    if not session or session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    if session.status != "completed" or not session.determined_level:
        raise HTTPException(status_code=400, detail="Preliminary test not completed")
    
                                  
    test_result_id = await prelim_service.get_test_result_id_by_preliminary_session(session_id)
    if not test_result_id:
        raise HTTPException(status_code=404, detail="Test result not found")
    
                                                  
    main_session_id = str(uuid.uuid4())
    main_session = await test_service.create_test_session(main_session_id, current_user.id)
    
                                                
    main_session.preliminary_test_id = session_id
    db.add(main_session)
    await db.commit()
    await db.refresh(main_session)
    
                                                    
    test_result = await result_service.get_test_result(test_result_id)
    if test_result:
        test_result.main_test_id = main_session_id
        db.add(test_result)
        await db.commit()
    
                                                     
    level_mapping = {
        "A1": "A1",
        "A2": "A2", 
        "B1": "B1",
        "B2": "B2",
        "C1": "C1"
    }
    
    test_level = level_mapping.get(session.determined_level, "B1")
    
    try:
        full_test = await test_service.generate_full_test(main_session_id, test_level)
        
        return {
            "main_test_session_id": main_session_id,
            "test_result_id": test_result_id,
            "determined_level": session.determined_level,
            "test_level": test_level,
            "preliminary_session_id": session_id,
            "test_data": full_test
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create main test: {str(e)}")


