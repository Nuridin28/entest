from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File, Form
from fastapi.responses import FileResponse, StreamingResponse
from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
import os
import time
import uuid
import asyncio
import aiofiles

from ....core.database import get_async_db
from ....api import deps
from ....services.test_service import TestService
from ....schemas.test import TestSession, TestStartRequest, TestSessionUpdate
from ....schemas.user import User
from ....utils.audio_service import audio_service
from pydantic import BaseModel
from ....utils.file_paths import (
    ensure_upload_directory, 
    get_relative_upload_path, 
    get_full_upload_path,
    FileTypes
)

router = APIRouter()

                                    
class InitRequest(BaseModel):
    uploadId: str
    totalChunks: int
    filename: str

class FinalizeRequest(BaseModel):
    uploadId: str

class CleanupRequest(BaseModel):
    uploadId: str


class GenerateTestRequest(BaseModel):
    level: str = "B1"


class SubmitAnswerRequest(BaseModel):
    question_id: int
    answer: str


class SaveWritingDraftRequest(BaseModel):
    question_id: int
    answer: str


class SubmitWritingAnswerRequest(BaseModel):
    question_id: int
    answer: str
    level: str = "B1"


@router.get("/attempts/check")
async def check_test_attempts(
    current_user: User = Depends(deps.get_current_active_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Проверяет количество доступных попыток для пользователя"""
    from ....services.test_result_service import TestResultService
    
    test_result_service = TestResultService(db)
    attempts_info = await test_result_service.can_user_start_test(current_user.id)
    return attempts_info


@router.post("/start", response_model=TestSession)
async def start_test(
    current_user: User = Depends(deps.get_current_active_user),
    db: AsyncSession = Depends(get_async_db)
):
    from ....services.test_result_service import TestResultService
    
                                             
    test_result_service = TestResultService(db)
    attempts_info = await test_result_service.can_user_start_test(current_user.id)
    
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
    
    test_service = TestService(db)
    session_id = str(uuid.uuid4())
    
    try:
                                                                
        test_result = await test_result_service.create_test_result(current_user.id)
        
                              
        test_session = await test_service.create_test_session(session_id, current_user.id)
        
        return test_session
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(e)
        )


@router.get("/sessions", response_model=List[TestSession])
async def get_user_test_sessions(
    current_user: User = Depends(deps.get_current_active_user),
    db: AsyncSession = Depends(get_async_db)
):
    test_service = TestService(db)
    sessions = await test_service.get_user_test_sessions(current_user.id)
    return sessions


@router.get("/{session_id}", response_model=TestSession)
async def get_test_session(
    session_id: str,
    current_user: User = Depends(deps.get_current_active_user),
    db: AsyncSession = Depends(get_async_db)
):
    test_service = TestService(db)
    session = await test_service.get_test_session(session_id)
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Test session not found"
        )
    
    if session.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this test session"
        )
    
    return session


@router.post("/{session_id}/generate-full-test")
async def generate_full_test(
    session_id: str,
    request: GenerateTestRequest,
    current_user: User = Depends(deps.get_current_active_user),
    db: AsyncSession = Depends(get_async_db)
):
    test_service = TestService(db)
    session = await test_service.get_test_session(session_id)
    
    if not session:
        raise HTTPException(status_code=404, detail="Test session not found")
    
    if session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    if session.status == "ready":
                                   
        return await test_service.get_session_questions(session_id)

    try:
                                                                         
        result = await test_service.generate_full_test(session_id, request.level)
        
                                                                      
        if result.get("status") == "generating":
            return {
                "status": "generating",
                "task_id": result.get("task_id"),
                "message": result.get("message"),
                "estimated_time": result.get("estimated_time"),
                "session_id": session_id,
                "check_status_url": f"/api/v1/tests/{session_id}/generation-status"
            }
        
        return result
        
    except Exception as e:
                                          
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to generate full test for session {session_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to generate full test: {str(e)}")

@router.get("/{session_id}/generation-status")
async def get_generation_status(
    session_id: str,
    current_user: User = Depends(deps.get_current_active_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Check the status of test generation"""
    from app.core.cache import cache
    import logging
    
    logger = logging.getLogger(__name__)
    logger.info(f"Checking generation status for session: {session_id}")
    
    test_service = TestService(db)
    session = await test_service.get_test_session(session_id)
    
    if not session:
        logger.error(f"Test session not found: {session_id}")
        raise HTTPException(status_code=404, detail="Test session not found")
    
    if session.user_id != current_user.id:
        logger.error(f"Unauthorized access to session {session_id} by user {current_user.id}")
        raise HTTPException(status_code=403, detail="Not authorized")
    
    logger.info(f"Session {session_id} status: {session.status}")
    
                            
    if session.status == "ready":
                                                  
        questions = await test_service.get_session_questions(session_id)
        question_count = len(questions) if questions else 0
        logger.info(f"Session {session_id} is ready with {question_count} questions")
        
        return {
            "status": "completed",
            "message": "Test generation completed",
            "session_id": session_id,
            "ready": True,
            "question_count": question_count
        }
    
                                 
    generation_key = f"generating:{session_id}"
    is_generating = await cache.aexists(generation_key)
    logger.info(f"Session {session_id} is_generating (cache): {is_generating}")
    
    if not is_generating and session.status != "generating":
        logger.info(f"Session {session_id} generation not started")
        return {
            "status": "not_started",
            "message": "Test generation not started",
            "session_id": session_id
        }
    
    logger.info(f"Session {session_id} is generating")
    return {
        "status": "generating",
        "message": "Test generation in progress",
        "session_id": session_id,
        "estimated_remaining": "1-3 minutes"
    }


@router.get("/{session_id}/questions/{question_type}")
async def get_questions_by_type(
    session_id: str,
    question_type: str,
    current_user: User = Depends(deps.get_current_active_user),
    db: AsyncSession = Depends(get_async_db)
):
    test_service = TestService(db)
    session = await test_service.get_test_session(session_id)
    
    if not session:
        raise HTTPException(status_code=404, detail="Test session not found")
    
    if session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    questions = await test_service.get_session_questions_by_type(session_id, question_type)
    print(f"[DEBUG] Found {len(questions) if questions else 0} questions of type '{question_type}' for session {session_id}")
    
                                                                              
    if question_type == "reading" and questions:
        import json
                                                                                            
        first_question_content = json.loads(questions[0].content)
        passage = first_question_content.get("passage", "")
        
        formatted_questions = []
        for q in questions:
            content = json.loads(q.content)
            formatted_questions.append({
                "id": q.id,
                "question": content["question"],
                "options": json.loads(q.options) if q.options else {},
                "question_number": content.get("question_number", 1)
            })
        
        return {
            "passage": passage,
            "questions": formatted_questions
        }
    
                                                                    
    if question_type == "listening":
        print(f"[DEBUG] Processing listening questions for session {session_id}")
        print(f"[DEBUG] Found {len(questions)} raw listening questions")
        
        if not questions:
            print(f"[WARNING] No listening questions found for session {session_id}")
            return []
            
        import json
        formatted_scenarios = []
        for i, q in enumerate(questions):
            try:
                content = json.loads(q.content) if q.content else {}
                options = json.loads(q.options) if q.options else {}
                
                scenario = {
                    "id": q.id,
                    "audio_path": content.get("audio_path", ""),
                    "question": content.get("question", ""),
                    "options": options,
                    "scenario_number": content.get("scenario_number", i + 1)
                }
                formatted_scenarios.append(scenario)
                print(f"[DEBUG] Formatted scenario {i+1}: audio_path={scenario['audio_path']}, question_len={len(scenario['question'])}")
                
            except Exception as e:
                print(f"[ERROR] Failed to format listening question {q.id}: {e}")
                continue
        
        print(f"[DEBUG] Returning {len(formatted_scenarios)} listening scenarios for session {session_id}")
        return formatted_scenarios
    
                                                                
    if question_type == "writing":
        print(f"[DEBUG] Processing writing questions for session {session_id}")
        print(f"[DEBUG] Found {len(questions)} raw writing questions")
        
        if not questions:
            print(f"[WARNING] No writing questions found for session {session_id}")
            return []
            
        import json
        formatted_prompts = []
        for i, q in enumerate(questions):
            try:
                content = json.loads(q.content) if q.content else {}
                
                prompt = {
                    "id": q.id,
                    "title": content.get("title", ""),
                    "prompt": content.get("prompt", ""),
                    "instructions": content.get("instructions", ""),
                    "word_count": content.get("word_count", 250),
                    "time_limit": content.get("time_limit", 25),
                    "evaluation_criteria": content.get("evaluation_criteria", []),
                    "prompt_number": content.get("prompt_number", i + 1)
                }
                formatted_prompts.append(prompt)
                print(f"[DEBUG] Formatted prompt {i+1}: title={prompt['title']}, word_count={prompt['word_count']}")
                
            except Exception as e:
                print(f"[ERROR] Failed to format writing question {q.id}: {e}")
                continue
        
        print(f"[DEBUG] Returning {len(formatted_prompts)} writing prompts for session {session_id}")
        return formatted_prompts
    
                                                                   
    if question_type == "speaking":
        print(f"[DEBUG] Processing speaking questions for session {session_id}")
        print(f"[DEBUG] Found {len(questions)} raw speaking questions")
        
        if not questions:
            print(f"[WARNING] No speaking questions found for session {session_id}")
            return []
            
        import json
        formatted_questions = []
        for i, q in enumerate(questions):
            try:
                content = json.loads(q.content) if q.content else {}
                
                question = {
                    "id": q.id,
                    "type": content.get("type", "personal"),
                    "question": content.get("question", ""),
                    "follow_up": content.get("follow_up", ""),
                    "preparation_time": content.get("preparation_time", 15),
                    "speaking_time": content.get("speaking_time", 60),
                    "evaluation_criteria": content.get("evaluation_criteria", []),
                    "audio_path": content.get("audio_path", ""),
                    "question_number": content.get("question_number", i + 1)
                }
                formatted_questions.append(question)
                print(f"[DEBUG] Formatted speaking question {i+1}: type={question['type']}, has_audio={bool(question['audio_path'])}")
                
            except Exception as e:
                print(f"[ERROR] Failed to format speaking question {q.id}: {e}")
                continue
        
        print(f"[DEBUG] Returning {len(formatted_questions)} speaking questions for session {session_id}")
        return formatted_questions
    
    return questions


@router.post("/{session_id}/submit/reading")
async def submit_reading_answer(
    session_id: str,
    request: SubmitAnswerRequest,
    current_user: User = Depends(deps.get_current_active_user),
    db: AsyncSession = Depends(get_async_db)
):
    test_service = TestService(db)
    session = await test_service.get_test_session(session_id)
    
    if not session:
        raise HTTPException(status_code=404, detail="Test session not found")
    
    if session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    try:
        evaluation = await test_service.submit_reading_answer(
            request.question_id, request.answer
        )
        return evaluation
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{session_id}/submit/listening")
async def submit_listening_answer(
    session_id: str,
    request: SubmitAnswerRequest,
    current_user: User = Depends(deps.get_current_active_user),
    db: AsyncSession = Depends(get_async_db)
):
    test_service = TestService(db)
    session = await test_service.get_test_session(session_id)
    
    if not session:
        raise HTTPException(status_code=404, detail="Test session not found")
    
    if session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    try:
        evaluation = await test_service.submit_listening_answer(
            request.question_id, request.answer
        )
        return evaluation
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{session_id}/save/writing")
async def save_writing_draft(
    session_id: str,
    request: SaveWritingDraftRequest,
    current_user: User = Depends(deps.get_current_active_user),
    db: AsyncSession = Depends(get_async_db)
):
    test_service = TestService(db)
    session = await test_service.get_test_session(session_id)
    
    if not session:
        raise HTTPException(status_code=404, detail="Test session not found")
    
    if session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    try:
        result = await test_service.save_writing_draft(
            request.question_id, request.answer
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{session_id}/submit/writing")
async def submit_writing_answer(
    session_id: str,
    request: SubmitWritingAnswerRequest,
    current_user: User = Depends(deps.get_current_active_user),
    db: AsyncSession = Depends(get_async_db)
):
    test_service = TestService(db)
    session = await test_service.get_test_session(session_id)
    
    if not session:
        raise HTTPException(status_code=404, detail="Test session not found")
    
    if session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    try:
        evaluation = await test_service.submit_writing_answer(
            request.question_id, request.answer, request.level
        )
        return evaluation
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{session_id}/submit/speaking/{question_id}")
async def submit_speaking_answer(
    session_id: str,
    question_id: int,
    audio_file: UploadFile = File(...),
    level: str = Form("B1"),
    current_user: User = Depends(deps.get_current_active_user),
    db: AsyncSession = Depends(get_async_db)
):
    test_service = TestService(db)
    session = await test_service.get_test_session(session_id)
    if not session or session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    try:
        audio_data = await audio_file.read()
        evaluation = await test_service.submit_speaking_answer(
            question_id, audio_data, level
        )
        return evaluation
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{session_id}/audio/{filename}")
async def get_audio_file(
    session_id: str,
    filename: str,
    current_user: User = Depends(deps.get_current_active_user),
    db: AsyncSession = Depends(get_async_db)
):
    test_service = TestService(db)
    session = await test_service.get_test_session(session_id)
    if not session or session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    file_path = os.path.join("/app/audio", filename)
    if os.path.exists(file_path):
        return FileResponse(
            path=file_path, 
            media_type="audio/mpeg", 
            filename=filename,
            headers={"Content-Disposition": f"inline; filename=\"{filename}\""}
        )
    raise HTTPException(status_code=404, detail="Audio file not found")


@router.get("/{session_id}/results")
async def get_test_results(
    session_id: str,
    current_user: User = Depends(deps.get_current_active_user),
    db: AsyncSession = Depends(get_async_db)
):
    test_service = TestService(db)
    results = await test_service.get_test_results(session_id)
    if "error" in results:
        raise HTTPException(status_code=404, detail=results["error"])
    return results


@router.post("/{session_id}/complete", response_model=TestSession)
async def complete_test(
    session_id: str,
    current_user: User = Depends(deps.get_current_active_user),
    db: AsyncSession = Depends(get_async_db)
):
    test_service = TestService(db)
    session = await test_service.get_test_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Test session not found")
    if session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
                                  
    test_result_id = await test_service.get_test_result_id_by_main_session(session_id)
    
                                             
    completed_session = await test_service.complete_test_session(session_id, test_result_id)
    return completed_session





                                                                                   





@router.post("/{session_id}/annul")
async def annul_main_test(
    session_id: str,
    current_user: User = Depends(deps.get_current_active_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Аннулирует основной тест из-за нарушений прокторинга"""
    from ....services.test_result_service import TestResultService
    from ....utils.timezone import get_almaty_now
    
    test_service = TestService(db)
    result_service = TestResultService(db)
    
                                                   
    session = await test_service.get_test_session(session_id)
    if not session or session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
                                  
    from ....models.test_result import TestResult
    from sqlalchemy import select
    
    result = await db.execute(
        select(TestResult).filter(TestResult.main_test_id == session_id)
    )
    test_result = result.scalars().first()
    
    if not test_result:
        raise HTTPException(status_code=404, detail="Test result not found")
    
    try:
                                          
        from ....schemas.test import TestSessionUpdate
        await test_service.update_test_session(
            session_id, 
            TestSessionUpdate(
                status="annulled",
                end_time=get_almaty_now().replace(tzinfo=None)
            )
        )
        
                                    
        await result_service.invalidate_test_result(
            test_result.id, 
            "Тест автоматически завершен из-за многократных серьезных нарушений."
        )
        
        return {
            "session_id": session_id,
            "test_result_id": test_result.id,
            "status": "annulled",
            "message": "Test has been annulled due to proctoring violations"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to annul test: {str(e)}")