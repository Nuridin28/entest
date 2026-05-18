from pydantic import BaseModel

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ....core.database import get_db
from ....schemas.external_test import (
    AttemptStartOut,
    AttemptSubmitIn,
    AttemptSubmitOut,
    ExternalQuestionStudentOut,
    ProctoringEventIn,
)
from ....services.external_attempt_service import AttemptError, ExternalAttemptService
from ....services.external_proctoring_service import ExternalProctoringService


class ProctoringPhotoIn(BaseModel):
    photo: str  # data: URL


class ProctoringEventOk(BaseModel):
    ok: bool = True
    event_id: int


router = APIRouter()


@router.get("/start", response_model=AttemptStartOut)
def start_attempt(token: str = Query(...), db: Session = Depends(get_db)):
    service = ExternalAttemptService(db)
    try:
        attempt = service.attempt_from_token(token)
    except AttemptError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    return AttemptStartOut(
        attempt_id=attempt.id,
        test_id=attempt.test_id,
        title=attempt.test.title,
        description=attempt.test.description,
        status=attempt.status,
        questions=[ExternalQuestionStudentOut.from_orm(q) for q in attempt.test.questions],
    )


@router.post("/submit", response_model=AttemptSubmitOut)
def submit_attempt(
    payload: AttemptSubmitIn,
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    service = ExternalAttemptService(db)
    try:
        attempt = service.attempt_from_token(token)
        attempt = service.submit(attempt, payload.answers)
    except AttemptError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    return AttemptSubmitOut(
        attempt_id=attempt.id,
        status=attempt.status,
        score=attempt.score or 0.0,
    )


@router.post("/proctoring/photo")
def save_proctoring_photo(
    payload: ProctoringPhotoIn,
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    service = ExternalAttemptService(db)
    try:
        attempt = service.attempt_from_token(token)
    except AttemptError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    if attempt.status != "in_progress":
        raise HTTPException(status_code=409, detail="Attempt is not in progress")
    proctor = ExternalProctoringService(db)
    try:
        proctor.save_initial_photo(attempt, payload.photo)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"ok": True}


@router.post("/proctoring/event", response_model=ProctoringEventOk)
def log_proctoring_event(
    payload: ProctoringEventIn,
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    service = ExternalAttemptService(db)
    try:
        attempt = service.attempt_from_token(token)
    except AttemptError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    if attempt.status != "in_progress":
        raise HTTPException(status_code=409, detail="Attempt is not in progress")
    proctor = ExternalProctoringService(db)
    ev = proctor.log_event(
        attempt,
        event_type=payload.event_type,
        severity=payload.severity,
        description=payload.description,
        metadata=payload.metadata if isinstance(payload.metadata, dict) else (None if payload.metadata is None else {"value": payload.metadata}),
        recorded_at=payload.recorded_at,
    )
    return ProctoringEventOk(event_id=ev.id)
