from pydantic import BaseModel
from typing import Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query, File, UploadFile, Form
from sqlalchemy.orm import Session
import os
import logging

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
from ....models.proctoring_violations import ProctoringViolation
from ....utils.file_paths import ensure_upload_directory, FileTypes

logger = logging.getLogger(__name__)


class ProctoringPhotoIn(BaseModel):
    photo: str  # data: URL


class ProctoringEventOk(BaseModel):
    ok: bool = True
    event_id: int


class ViolationIn(BaseModel):
    violation_type: str
    severity: Optional[str] = "medium"
    description: Optional[str] = None
    violation_metadata: Optional[Dict[str, Any]] = None


class ViolationOut(BaseModel):
    id: int
    violation_type: str
    severity: str

    class Config:
        from_attributes = True


router = APIRouter()


def _get_attempt(token: str, db: Session):
    service = ExternalAttemptService(db)
    try:
        attempt = service.attempt_from_token(token)
    except AttemptError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    if attempt.status != "in_progress":
        raise HTTPException(status_code=409, detail="Attempt is not in progress")
    return attempt


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
    attempt = _get_attempt(token, db)
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
    attempt = _get_attempt(token, db)
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


@router.post("/proctoring/violation", response_model=ViolationOut)
def log_proctoring_violation(
    payload: ViolationIn,
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    """Log a legacy-style proctoring violation for an external attempt."""
    attempt = _get_attempt(token, db)
    meta = payload.violation_metadata
    if not isinstance(meta, dict):
        meta = None
    violation = ProctoringViolation(
        external_attempt_id=attempt.id,
        violation_type=payload.violation_type,
        severity=payload.severity,
        description=payload.description,
        violation_metadata=meta,
    )
    db.add(violation)
    attempt.violation_count = (attempt.violation_count or 0) + 1
    db.commit()
    db.refresh(violation)
    return violation


@router.post("/screen-chunk")
async def upload_screen_chunk(
    token: str = Query(...),
    chunk: UploadFile = File(...),
    chunk_index: int = Form(...),
    is_final: bool = Form(False),
    db: Session = Depends(get_db),
):
    """Chunked screen recording upload for external attempts (token-auth).

    Intentionally does NOT check attempt.status so that the final recording
    can finish uploading after the test has already been submitted.
    """
    service = ExternalAttemptService(db)
    try:
        attempt = service.attempt_from_token(token)
    except AttemptError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    attempt_key = f"ext_{attempt.id}"
    chunks_dir = ensure_upload_directory(f"{FileTypes.CHUNKS}/{attempt_key}")
    chunk_path = os.path.join(chunks_dir, f"{attempt_key}_chunk_{chunk_index:04d}.webm")

    content = await chunk.read()
    with open(chunk_path, "wb") as f:
        f.write(content)

    logger.info(f"External chunk saved: {chunk_path}, size: {len(content)} bytes")

    if is_final:
        final_dir = ensure_upload_directory(FileTypes.SCREEN_RECORDINGS)
        final_filename = f"{attempt_key}.webm"
        final_path = os.path.join(final_dir, final_filename)

        await _combine_chunks(chunks_dir, final_path, attempt_key)

        # Store relative path for serving later
        from ....utils.file_paths import get_upload_paths
        base_dir, uploads_dir = get_upload_paths()
        relative_path = os.path.join(uploads_dir, FileTypes.SCREEN_RECORDINGS, final_filename)
        attempt.screen_recording_path = relative_path
        db.commit()

        logger.info(f"External screen recording finalized: {relative_path}")
        return {"status": "completed", "path": relative_path}

    return {"status": "chunk_received", "chunk_index": chunk_index}


async def _combine_chunks(chunks_dir: str, output_path: str, base_filename: str):
    chunk_files = sorted(
        os.path.join(chunks_dir, f)
        for f in os.listdir(chunks_dir)
        if f.startswith(base_filename) and f.endswith(".webm")
    )
    with open(output_path, "wb") as out:
        for cf in chunk_files:
            with open(cf, "rb") as inp:
                out.write(inp.read())
    logger.info(f"Combined {len(chunk_files)} chunks into {output_path}")
    for cf in chunk_files:
        try:
            os.remove(cf)
        except Exception:
            pass
    try:
        os.rmdir(chunks_dir)
    except Exception:
        pass
