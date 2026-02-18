from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional, Dict, Any
from datetime import datetime
import json
import os
from fastapi.responses import FileResponse

from .... import schemas
from ... import deps
from ....models.user import User
from ....models.test import TestSession
from ....models.proctoring_log import ProctoringLog
from ....core.security import verify_token
from ....utils.file_paths import get_full_upload_path, get_relative_upload_path, FileTypes

router = APIRouter()


class TestAttemptBrief(BaseModel):
    id: str
    start_time: datetime
    end_time: datetime | None = None
    status: str
    cefr_level: str | None = None
    final_score: float | None = None

    class Config:
        from_attributes = True

class UserWithAttempts(schemas.User):
    test_sessions: List[TestAttemptBrief] = []

    class Config:
        from_attributes = True


class ProctoringViolationDetail(BaseModel):
    id: int
    timestamp: datetime
    violation_type: str
    severity: str
    event_data: Optional[Dict[str, Any]] = Field(None, alias='violation_metadata')

    class Config:
        from_attributes = True
        populate_by_name = True

class QuestionResponse(BaseModel):
    id: int
    question_type: str
    content: dict | None = None
    options: dict | None = None
    correct_answer: str | None = None
    user_answer: str | None = None
    score: float | None = None
    feedback: str | None = None

    class Config:
        from_attributes = True

class QuestionDetail(BaseModel):
    id: int
    question_type: str
    content: dict | None = None
    options: dict | None = None
    correct_answer: str | None = None
    user_answer: str | None = None
    score: float | None = None
    feedback: str | None = None
    reading_score: float | None = None
    listening_score: float | None = None
    writing_score: float | None = None
    speaking_score: float | None = None
    final_score: float | None = None
    initial_photo_path: str | None = None
    screen_recording_path: str | None = None
    violations: List[ProctoringViolationDetail] = []
    is_invalidated: bool | None = None
    invalidation_reason: str | None = None

    class Config:
        from_attributes = True

QuestionDetail.model_rebuild()

class TestAttemptDetail(BaseModel):
    id: str
    start_time: datetime
    end_time: datetime | None = None
    status: str
    cefr_level: str | None = None
    reading_score: float | None = None
    listening_score: float | None = None
    writing_score: float | None = None
    speaking_score: float | None = None
    final_score: float | None = None
    initial_photo_path: str | None = None
    screen_recording_path: str | None = None
    proctoring_logs: List[ProctoringViolationDetail] = []
    violations: List[ProctoringViolationDetail] = []
    questions: List[QuestionResponse] = []
    is_invalidated: bool | None = None
    invalidation_reason: str | None = None

    class Config:
        from_attributes = True


@router.get("/users", response_model=List[schemas.User])
def get_all_users(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_superuser),
):
    """
    Retrieve all users. Only accessible by superusers.
    """
    users = db.query(User).all()
    return users


@router.get("/users/{user_id}/attempts", response_model=UserWithAttempts)
def get_user_attempts(
    user_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_superuser),
):
    """
    Retrieve a specific user and all of their test attempts based on TestResult.
    """
    from ....models.test_result import TestResult
    
    user = (
        db.query(User)
        .options(joinedload(User.test_results))
        .filter(User.id == user_id)
        .first()
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

                                                                    
    all_attempts = []
    
    for test_result in user.test_results:
                                                        
        status = test_result.status
        final_score = test_result.final_score
        cefr_level = test_result.final_cefr_level
        end_time = test_result.end_time
        
                                            
        if test_result.is_invalidated:
            status = "invalidated"
                                                                   
        elif status == "in_progress":
            if not test_result.preliminary_completed:
                status = "preliminary_in_progress"
            elif test_result.preliminary_completed and not test_result.ai_test_completed and not test_result.main_test_completed:
                                            
                if test_result.preliminary_results and test_result.preliminary_results.get("next_action") == "ai_test":
                    status = "ai_test_generating"
                elif test_result.preliminary_results and test_result.preliminary_results.get("next_action") == "continue_test":
                    status = "main_test_in_progress"
                else:
                    status = "completed"
            else:
                status = "generating"
        
        all_attempts.append(TestAttemptBrief(
            id=str(test_result.id),                                               
            start_time=test_result.start_time,
            end_time=end_time,
            status=status,
            cefr_level=cefr_level,
            final_score=final_score
        ))
    
                                       
    all_attempts.sort(key=lambda x: x.start_time, reverse=True)
    
                                           
    user_response = UserWithAttempts.model_validate(user)
    user_response.test_sessions = all_attempts
    
    return user_response 


@router.get("/attempts/{attempt_id}", response_model=TestAttemptDetail)
def get_attempt_details(
    attempt_id: str,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_superuser),
):
    """
    Retrieve full details for a specific test attempt using TestResult as primary source.
    """
    from ....models.test_result import TestResult
    from ....models.test import PreliminaryTestSession, PreliminaryQuestion
    from ....models.preliminary_proctoring_violations import PreliminaryProctoringViolation
    
                                        
    try:
        test_result_id = int(attempt_id)
        test_result = (
            db.query(TestResult)
            .options(
                joinedload(TestResult.preliminary_test),
                joinedload(TestResult.main_test)
            )
            .filter(TestResult.id == test_result_id)
            .first()
        )
        
        if test_result:
                                                     
            violations_data = []
            questions_data = []
            
                                                      
            if test_result.preliminary_test:
                prelim_test = test_result.preliminary_test
                
                                                       
                prelim_violations = db.query(PreliminaryProctoringViolation).filter(
                    PreliminaryProctoringViolation.session_id == prelim_test.id
                ).all()
                
                for violation in prelim_violations:
                    violation_data = ProctoringViolationDetail(
                        id=violation.id,
                        timestamp=violation.timestamp,
                        violation_type=violation.violation_type,
                        severity=violation.severity,
                        event_data=json.loads(violation.violation_metadata) if isinstance(violation.violation_metadata, str) else violation.violation_metadata
                    )
                    violations_data.append(violation_data)
            
                                               
            if test_result.main_test:
                main_test = test_result.main_test
                
                                          
                for violation in main_test.violations:
                    if isinstance(violation.violation_metadata, str):
                        try:
                            violation.violation_metadata = json.loads(violation.violation_metadata)
                        except json.JSONDecodeError:
                            pass
                    
                    violation_data = ProctoringViolationDetail(
                        id=violation.id,
                        timestamp=violation.timestamp,
                        violation_type=violation.violation_type,
                        severity=violation.severity,
                        event_data=violation.violation_metadata
                    )
                    violations_data.append(violation_data)
                
                                         
                for question in main_test.questions:
                    if isinstance(question.content, str):
                        try:
                            question.content = json.loads(question.content)
                        except json.JSONDecodeError:
                            question.content = {}
                    if isinstance(question.options, str):
                        try:
                            question.options = json.loads(question.options)
                        except json.JSONDecodeError:
                            question.options = {}
                    
                    question_data = QuestionResponse(
                        id=question.id,
                        question_type=question.question_type,
                        content=question.content,
                        options=question.options,
                        correct_answer=question.correct_answer,
                        user_answer=question.user_answer,
                        score=question.score,
                        feedback=question.feedback
                    )
                    questions_data.append(question_data)
            
                              
            status = test_result.status
            if test_result.is_invalidated:
                status = "invalidated"
            elif status == "in_progress":
                if not test_result.preliminary_completed:
                    status = "preliminary_in_progress"
                elif test_result.preliminary_results and test_result.preliminary_results.get("next_action") == "ai_test":
                    status = "ai_test_generating"
                elif test_result.preliminary_results and test_result.preliminary_results.get("next_action") == "continue_test":
                    status = "main_test_in_progress"
                else:
                    status = "completed"
            
                                                                                    
            initial_photo_path = None
            screen_recording_path = None
            
                                                                                                            
            if test_result.main_test and test_result.main_test.screen_recording_path:
                screen_recording_path = test_result.main_test.screen_recording_path
            elif test_result.preliminary_test and test_result.preliminary_test.screen_recording_path:
                screen_recording_path = test_result.preliminary_test.screen_recording_path
            
                                                                                                         
            if test_result.main_test and test_result.main_test.initial_photo_path:
                initial_photo_path = test_result.main_test.initial_photo_path
            elif test_result.preliminary_test and test_result.preliminary_test.initial_photo_path:
                initial_photo_path = test_result.preliminary_test.initial_photo_path
            
            response_data = TestAttemptDetail(
                id=str(test_result.id),
                start_time=test_result.start_time,
                end_time=test_result.end_time,
                status=status,
                cefr_level=test_result.final_cefr_level,
                reading_score=test_result.main_test_results.get("reading_score") if test_result.main_test_results else None,
                listening_score=test_result.main_test_results.get("listening_score") if test_result.main_test_results else None,
                writing_score=test_result.main_test_results.get("writing_score") if test_result.main_test_results else None,
                speaking_score=test_result.main_test_results.get("speaking_score") if test_result.main_test_results else None,
                final_score=test_result.final_score,
                initial_photo_path=initial_photo_path,
                screen_recording_path=screen_recording_path,
                proctoring_logs=violations_data,
                violations=violations_data,
                questions=questions_data,
                is_invalidated=test_result.is_invalidated,
                invalidation_reason=test_result.invalidation_reason
            )
            return response_data
            
    except ValueError:
                                                            
        pass
    
                                                       
    attempt = (
        db.query(TestSession)
        .options(
            joinedload(TestSession.violations),
            joinedload(TestSession.questions),
            joinedload(TestSession.proctoring_logs)
        )
        .filter(TestSession.id == attempt_id)
        .first()
    )
    
    if attempt:
                                                                      
        for violation in attempt.violations:
            if isinstance(violation.violation_metadata, str):
                try:
                    violation.violation_metadata = json.loads(violation.violation_metadata)
                except json.JSONDecodeError:
                    pass

        for question in attempt.questions:
            if isinstance(question.content, str):
                try:
                    question.content = json.loads(question.content)
                except json.JSONDecodeError:
                    question.content = {}
            if isinstance(question.options, str):
                try:
                    question.options = json.loads(question.options)
                except json.JSONDecodeError:
                    question.options = {}

        response_data = TestAttemptDetail.model_validate(attempt)

                                                                                  
        if response_data.status == "completed" and response_data.final_score is None:
            scores = [s for s in [response_data.reading_score, response_data.listening_score, 
                                response_data.writing_score, response_data.speaking_score] if s is not None]
            if scores:
                response_data.final_score = sum(scores) / len(scores)

        return response_data
    
    raise HTTPException(status_code=404, detail="Test attempt not found")


class InvalidateAttemptRequest(BaseModel):
    reason: str = Field(..., min_length=1, description="Reason for invalidation")


@router.post("/attempts/{attempt_id}/invalidate")
def invalidate_attempt(
    attempt_id: str,
    request: InvalidateAttemptRequest,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_superuser),
):
    """
    Invalidate a test attempt with a reason.
    """
    from ....models.test_result import TestResult
    
                                        
    try:
        test_result_id = int(attempt_id)
        test_result = db.query(TestResult).filter(TestResult.id == test_result_id).first()
        
        if test_result:
            test_result.is_invalidated = True
            test_result.invalidation_reason = request.reason
            test_result.status = "invalidated"
            
            db.commit()
            db.refresh(test_result)
            
            return {"message": "Test attempt invalidated successfully", "reason": request.reason}
            
    except ValueError:
        pass
    
                     
    attempt = db.query(TestSession).filter(TestSession.id == attempt_id).first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Test attempt not found")

    attempt.is_invalidated = True
    attempt.invalidation_reason = request.reason
    attempt.status = "invalidated"
    
    db.commit()
    db.refresh(attempt)
    
    return {"message": "Test attempt invalidated successfully", "reason": request.reason}


@router.post("/attempts/{attempt_id}/validate")
def validate_attempt(
    attempt_id: str,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_superuser),
):
    """
    Validate (un-invalidate) a test attempt.
    """
    from ....models.test_result import TestResult
    
                                        
    try:
        test_result_id = int(attempt_id)
        test_result = db.query(TestResult).filter(TestResult.id == test_result_id).first()
        
        if test_result:
            test_result.is_invalidated = False
            test_result.invalidation_reason = None
            test_result.status = "completed"
            
            db.commit()
            db.refresh(test_result)
            
            return {"message": "Test attempt validated successfully"}
            
    except ValueError:
        pass
    
                     
    attempt = db.query(TestSession).filter(TestSession.id == attempt_id).first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Test attempt not found")

    attempt.is_invalidated = False
    attempt.invalidation_reason = None
    attempt.status = "completed"
    
    db.commit()
    db.refresh(attempt)
    
    return {"message": "Test attempt validated successfully"}


@router.get("/media/{attempt_id}/{file_type}")
def get_media_file(
    attempt_id: str,
    file_type: str,                      
    token: str = Query(...),
    download: bool = Query(False, description="Force download instead of inline display"),
    db: Session = Depends(deps.get_db),
):
    """
    Retrieve media files (initial photo or screen recording) for a test session.
    """
    email = verify_token(token)
    if not email:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = db.query(User).filter(User.email == email).first()
    if not user or not user.is_superuser:
        raise HTTPException(status_code=403, detail="The user doesn't have enough privileges")

    from ....models.test_result import TestResult
    from ....models.test import PreliminaryTestSession
    
    attempt = None
    
                                        
    try:
        test_result_id = int(attempt_id)
        test_result = (
            db.query(TestResult)
            .options(
                joinedload(TestResult.preliminary_test),
                joinedload(TestResult.main_test)
            )
            .filter(TestResult.id == test_result_id)
            .first()
        )
        
        if test_result:
            print(f"DEBUG: Found test_result with ID: {test_result.id}")
            print(f"DEBUG: test_result.preliminary_test_id: {test_result.preliminary_test_id}")
            print(f"DEBUG: test_result.main_test_id: {test_result.main_test_id}")
            
                                                              
            main_test = test_result.main_test
            prelim_test = test_result.preliminary_test
            
            print(f"DEBUG: main_test exists: {main_test is not None}")
            print(f"DEBUG: prelim_test exists: {prelim_test is not None}")
            
            if prelim_test:
                print(f"DEBUG: prelim_test.id: {prelim_test.id}")
            if main_test:
                print(f"DEBUG: main_test.id: {main_test.id}")
            
            if file_type == "screen":
                                                                             
                main_has_file = main_test and main_test.screen_recording_path
                prelim_has_file = prelim_test and prelim_test.screen_recording_path
                
                print(f"DEBUG: main_has_file: {main_has_file}")
                print(f"DEBUG: prelim_has_file: {prelim_has_file}")
                
                if main_has_file:
                    print(f"DEBUG: main_test.screen_recording_path: {main_test.screen_recording_path}")
                if prelim_has_file:
                    print(f"DEBUG: prelim_test.screen_recording_path: {prelim_test.screen_recording_path}")
                
                if main_has_file and prelim_has_file:
                                                                          
                    main_file_path = get_full_upload_path(main_test.screen_recording_path)
                    prelim_file_path = get_full_upload_path(prelim_test.screen_recording_path)
                    
                    main_exists = os.path.exists(main_file_path)
                    prelim_exists = os.path.exists(prelim_file_path)
                    
                    print(f"DEBUG: main_file_path: {main_file_path}, exists: {main_exists}")
                    print(f"DEBUG: prelim_file_path: {prelim_file_path}, exists: {prelim_exists}")
                    
                    if main_exists:
                        attempt = main_test
                        print("DEBUG: Selected main_test (file exists)")
                    elif prelim_exists:
                        attempt = prelim_test
                        print("DEBUG: Selected prelim_test (file exists)")
                    else:
                                                                                  
                        attempt = main_test
                        print("DEBUG: Selected main_test (neither file exists)")
                elif main_has_file:
                    main_file_path = get_full_upload_path(main_test.screen_recording_path)
                    main_exists = os.path.exists(main_file_path)
                    print(f"DEBUG: Only main has file: {main_file_path}, exists: {main_exists}")
                    
                    if main_exists:
                        attempt = main_test
                        print("DEBUG: Selected main_test (only main has file and exists)")
                    else:
                                                                                                
                        if prelim_test:
                            attempt = prelim_test
                            print("DEBUG: Selected prelim_test (main file doesn't exist)")
                        else:
                            attempt = main_test
                            print("DEBUG: Selected main_test (no prelim test available)")
                elif prelim_has_file:
                    prelim_file_path = get_full_upload_path(prelim_test.screen_recording_path)
                    prelim_exists = os.path.exists(prelim_file_path)
                    print(f"DEBUG: Only prelim has file: {prelim_file_path}, exists: {prelim_exists}")
                    
                    attempt = prelim_test
                    print("DEBUG: Selected prelim_test (only prelim has file)")
                else:
                                                                          
                    attempt = main_test if main_test else prelim_test
                    print(f"DEBUG: No file paths, selected: {'main_test' if main_test else 'prelim_test'}")
            elif file_type == "photo":
                                               
                main_has_file = main_test and main_test.initial_photo_path
                prelim_has_file = prelim_test and prelim_test.initial_photo_path
                
                if main_has_file and prelim_has_file:
                                                                          
                    main_file_path = get_full_upload_path(main_test.initial_photo_path)
                    prelim_file_path = get_full_upload_path(prelim_test.initial_photo_path)
                    
                    if os.path.exists(main_file_path):
                        attempt = main_test
                    elif os.path.exists(prelim_file_path):
                        attempt = prelim_test
                    else:
                                                                                  
                        attempt = main_test
                elif main_has_file:
                    attempt = main_test
                elif prelim_has_file:
                    attempt = prelim_test
                else:
                                                               
                    attempt = main_test if main_test else prelim_test
            else:
                                                          
                if main_test:
                    attempt = main_test
                elif prelim_test:
                    attempt = prelim_test
                
    except ValueError:
                                                            
        pass
    
                                                             
    if not attempt:
        attempt = db.query(TestSession).filter(TestSession.id == attempt_id).first()
    
                                                 
    if not attempt:
        try:
            prelim_attempt = db.query(PreliminaryTestSession).filter(PreliminaryTestSession.id == int(attempt_id)).first()
            if prelim_attempt:
                attempt = prelim_attempt
        except ValueError:
            pass
    
    if not attempt:
        raise HTTPException(status_code=404, detail="Test attempt not found")

    file_path_in_db = None
    media_type_header = None
    filename = None
    
    if file_type == "photo":
        file_path_in_db = attempt.initial_photo_path
        media_type_header = "image/png"
        filename = f"test_{attempt_id}_initial_photo.png"
    elif file_type == "screen":
        file_path_in_db = attempt.screen_recording_path
        media_type_header = "video/webm"
        filename = f"test_{attempt_id}_screen_recording.webm"
    else:
        raise HTTPException(status_code=400, detail="Invalid file type. Use 'photo' or 'screen'.")

    print(f"DEBUG: Attempt {attempt_id}, file_type: {file_type}, file_path_in_db: {file_path_in_db}")
    print(f"DEBUG: Attempt type: {type(attempt).__name__}")
    print(f"DEBUG: Attempt ID in DB: {attempt.id}")

    if not file_path_in_db:
                                                         
        if file_type == "screen":
            print(f"DEBUG: Screen recording path is None/empty for attempt {attempt_id}")
            print(f"DEBUG: Attempt status: {getattr(attempt, 'status', 'N/A')}")
            print(f"DEBUG: Attempt completed_at: {getattr(attempt, 'completed_at', 'N/A')}")
            
                                                     
            possible_relative_paths = [
                get_relative_upload_path(FileTypes.SCREEN_RECORDINGS, f"{attempt_id}.webm"),
                get_relative_upload_path(FileTypes.SCREEN_RECORDINGS, f"prelim_{attempt_id}.webm"),
                get_relative_upload_path(FileTypes.SCREEN_RECORDINGS, f"{attempt_id}_recovered.webm"),
                get_relative_upload_path(FileTypes.SCREEN_RECORDINGS, f"prelim_{attempt_id}_recovered.webm")
            ]
            
            possible_paths = [get_full_upload_path(path) for path in possible_relative_paths]
            
            for i, possible_path in enumerate(possible_paths):
                if os.path.exists(possible_path):
                    print(f"DEBUG: Found file at alternative path: {possible_path}")
                                                  
                    relative_path = possible_relative_paths[i]
                    attempt.screen_recording_path = relative_path
                    db.add(attempt)
                    db.commit()
                    file_path_in_db = relative_path
                    break
            
            if not file_path_in_db:
                print(f"DEBUG: No screen recording file found in any expected location")
                                                                                  
                raise HTTPException(
                    status_code=404, 
                    detail={
                        "error": "screen_recording_not_found",
                        "message": f"Screen recording not available for test {attempt_id}",
                        "details": "The screen recording was either not uploaded during the test or the upload failed. This could happen if the user denied screen sharing permissions, had network issues during upload, or the test was terminated before recording could be saved.",
                        "session_id": attempt_id,
                        "session_type": type(attempt).__name__
                    }
                )
        
        if not file_path_in_db:
            raise HTTPException(status_code=404, detail=f"{file_type.capitalize()} file path not recorded in database for session {attempt_id}")
    
                                                                    
    full_file_path = get_full_upload_path(file_path_in_db)
    
    print(f"DEBUG: Looking for file at: {full_file_path}")
    
    if os.path.exists(full_file_path):
        file_size = os.path.getsize(full_file_path)
        print(f"DEBUG: File found! Size: {file_size} bytes ({file_size / 1024 / 1024:.2f} MB)")
    
    if not os.path.exists(full_file_path):
        print(f"DEBUG: File not found at expected path: {full_file_path}")
        
                                                                      
        dir_path = os.path.dirname(full_file_path)
        if os.path.exists(dir_path):
            files_in_dir = os.listdir(dir_path)
            print(f"DEBUG: Files in directory {dir_path}: {files_in_dir}")
            
                                                                                     
            base_filename = os.path.basename(full_file_path)
            name_without_ext = os.path.splitext(base_filename)[0]
            ext = os.path.splitext(base_filename)[1]
            
            alternative_names = [
                f"{name_without_ext}_recovered{ext}",
                f"{name_without_ext}_validated{ext}",
                f"{name_without_ext}_final{ext}"
            ]
            
            for alt_name in alternative_names:
                alt_path = os.path.join(dir_path, alt_name)
                if os.path.exists(alt_path):
                    print(f"DEBUG: Found alternative file: {alt_path}")
                                            
                    full_file_path = alt_path
                                                  
                    relative_alt_path = os.path.join(os.path.dirname(file_path_in_db), alt_name)
                    if file_type == "screen":
                        attempt.screen_recording_path = relative_alt_path
                    elif file_type == "photo":
                        attempt.initial_photo_path = relative_alt_path
                    db.add(attempt)
                    db.commit()
                    print(f"DEBUG: Updated database with alternative path: {relative_alt_path}")
                    break
            else:
                                                      
                raise HTTPException(status_code=404, detail=f"{file_type.capitalize()} file not found on disk at {full_file_path}")
        else:
            print(f"DEBUG: Directory does not exist: {dir_path}")
            raise HTTPException(status_code=404, detail=f"{file_type.capitalize()} file not found on disk at {full_file_path}")
        
                                                                                     
    if file_type == "screen":
        print(f"DEBUG: Returning video file: {full_file_path}")
        
                                                      
        try:
            with open(full_file_path, 'rb') as f:
                first_bytes = f.read(32)
                print(f"DEBUG: First 32 bytes of file: {first_bytes.hex()}")
                
                                          
                if first_bytes.startswith(b'\x1a\x45\xdf\xa3'):
                    print("DEBUG: File has valid WebM/Matroska signature")
                else:
                    print("DEBUG: WARNING - File does not have WebM/Matroska signature!")
        except Exception as e:
            print(f"DEBUG: Error reading file header: {e}")
        
        headers = {
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "Range, Content-Range, Content-Length, Authorization",
        }
        
        if download:
            headers["Content-Disposition"] = f"attachment; filename={filename}"
        else:
            headers["Content-Disposition"] = "inline"
        
        return FileResponse(
            path=full_file_path,
            media_type="video/webm",
            headers=headers
        )
    else:
        return FileResponse(
            path=full_file_path,
            media_type=media_type_header,
            filename=filename
        ) 


class ResetAttemptsRequest(BaseModel):
    user_id: int
    reason: str = Field(..., min_length=1, description="Reason for resetting attempts")


@router.post("/users/{user_id}/reset-attempts")
def reset_user_attempts(
    user_id: int,
    request: ResetAttemptsRequest,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_superuser),
):
    """
    Reset test attempts for a specific user. Only accessible by superusers.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    old_attempts = user.test_attempts_used
    user.test_attempts_used = 0
    
    db.commit()
    db.refresh(user)
    
    return {
        "message": f"Test attempts reset successfully for user {user.full_name}",
        "user_id": user_id,
        "previous_attempts": old_attempts,
        "current_attempts": user.test_attempts_used,
        "max_attempts": user.max_test_attempts,
        "reason": request.reason
    }


@router.get("/users/{user_id}/attempts-info")
def get_user_attempts_info(
    user_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_superuser),
):
    """
    Get detailed information about user's test attempts.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {
        "user_id": user_id,
        "user_name": user.full_name,
        "user_email": user.email,
        "attempts_used": user.test_attempts_used,
        "max_attempts": user.max_test_attempts,
        "remaining_attempts": max(0, user.max_test_attempts - user.test_attempts_used),
        "can_start_test": user.test_attempts_used < user.max_test_attempts
    }