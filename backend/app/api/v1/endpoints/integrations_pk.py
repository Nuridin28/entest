from datetime import timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ... import deps
from ....core.config import settings
from ....core.database import get_db
from ....core.security import create_access_token, get_password_hash
from ....models.user import User
from fastapi.responses import FileResponse

from ....models.external_test import ExternalAttempt
from ....schemas.external_test import (
    AiGenerateQuestionsIn,
    AiGenerateQuestionsOut,
    AttemptStartOut,
    AttemptSubmitIn,
    AttemptSubmitOut,
    ExternalTestCreate,
    ExternalTestOut,
    ExternalTestSummary,
    ExternalTestUpdate,
    IssueAttemptTokenIn,
    IssueAttemptTokenOut,
    ProctoringDetailsOut,
    ProctoringEventOut,
)
from ....services.external_attempt_service import AttemptError, ExternalAttemptService
from ....services.external_proctoring_service import ExternalProctoringService
from ....services.external_question_ai import AIQuestionGenerator, check_rate_limit
from ....services.external_test_service import ExternalTestService


router = APIRouter()


class AdminSsoExchangeIn(BaseModel):
    token: str


class AdminSsoExchangeOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    email: str


@router.post(
    "/tests",
    response_model=ExternalTestOut,
    status_code=201,
    dependencies=[Depends(deps.require_pk_api_key_or_admin)],
)
def create_test(payload: ExternalTestCreate, db: Session = Depends(get_db)):
    service = ExternalTestService(db)
    return service.create(payload)


@router.get(
    "/tests",
    response_model=List[ExternalTestSummary],
    dependencies=[Depends(deps.require_pk_api_key_or_admin)],
)
def list_tests(
    db: Session = Depends(get_db),
    external_owner_id: Optional[str] = Query(None),
    include_archived: bool = Query(False),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    service = ExternalTestService(db)
    tests = service.list(
        external_owner_id=external_owner_id,
        include_archived=include_archived,
        offset=offset,
        limit=limit,
    )
    counts = service.question_counts([t.id for t in tests])
    return [
        ExternalTestSummary(
            id=t.id,
            title=t.title,
            description=t.description,
            default_attempt_limit=t.default_attempt_limit,
            default_deadline_at=t.default_deadline_at,
            is_archived=t.is_archived,
            is_draft=t.is_draft,
            question_count=counts.get(t.id, 0),
            created_at=t.created_at,
        )
        for t in tests
    ]


@router.get(
    "/tests/{test_id}",
    response_model=ExternalTestOut,
    dependencies=[Depends(deps.require_pk_api_key_or_admin)],
)
def get_test(test_id: int, db: Session = Depends(get_db)):
    test = ExternalTestService(db).get(test_id)
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    return test


@router.patch(
    "/tests/{test_id}",
    response_model=ExternalTestOut,
    dependencies=[Depends(deps.require_pk_api_key_or_admin)],
)
def update_test(test_id: int, payload: ExternalTestUpdate, db: Session = Depends(get_db)):
    try:
        test = ExternalTestService(db).update(test_id, payload)
    except ExternalTestService.QuestionsLocked as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    return test


@router.post(
    "/tests/{test_id}/archive",
    status_code=204,
    dependencies=[Depends(deps.require_pk_api_key_or_admin)],
)
def archive_test(test_id: int, db: Session = Depends(get_db)):
    ok = ExternalTestService(db).archive(test_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Test not found")
    return None


@router.delete(
    "/tests/{test_id}",
    status_code=204,
    dependencies=[Depends(deps.require_pk_api_key_or_admin)],
)
def delete_test(test_id: int, db: Session = Depends(get_db)):
    """Hard-delete the test (drops the row + cascade questions/attempts)."""
    ok = ExternalTestService(db).delete(test_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Test not found")
    return None


@router.post(
    "/attempts/issue-token",
    response_model=IssueAttemptTokenOut,
    dependencies=[Depends(deps.verify_pk_api_key)],
)
def issue_attempt_token(payload: IssueAttemptTokenIn, db: Session = Depends(get_db)):
    service = ExternalAttemptService(db)
    try:
        attempt, token, expires_at = service.issue_token(
            test_id=payload.test_id,
            external_user_id=payload.external_user_id,
            external_user_email=payload.external_user_email,
            external_user_name=payload.external_user_name,
            external_assignment_id=payload.external_assignment_id,
            attempt_limit_override=payload.attempt_limit,
            deadline_override=payload.deadline_at,
            pk_attempts_used=payload.pk_attempts_used,
        )
    except AttemptError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    base = (settings.entest_frontend_url or "").rstrip("/")
    take_url = f"/take?token={token}" if not base else f"{base}/take?token={token}"
    return IssueAttemptTokenOut(
        attempt_id=attempt.id,
        token=token,
        take_url=take_url,
        expires_at=expires_at,
    )


@router.post(
    "/tests/generate-questions",
    response_model=AiGenerateQuestionsOut,
    dependencies=[Depends(deps.require_pk_api_key_or_admin)],
)
def generate_questions(payload: AiGenerateQuestionsIn, authorization: Optional[str] = Header(None)):
    # Rate-limit per caller (admin user token or S2S key).
    caller_key = (authorization or "anon").split(" ", 1)[-1][:32]
    allowed, retry_in = check_rate_limit(caller_key)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Слишком много генераций подряд. Попробуйте через {retry_in} сек.",
            headers={"Retry-After": str(retry_in)},
        )

    generator = AIQuestionGenerator()
    if not generator.is_available():
        raise HTTPException(
            status_code=503,
            detail="AI generation is not configured (OPENAI_API_KEY missing in entest backend)",
        )
    try:
        questions = generator.generate(
            topic=payload.topic,
            count=payload.count,
            difficulty=payload.difficulty,
            language=payload.language,
            question_types=payload.question_types,
            instructions=payload.instructions,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    if not questions:
        raise HTTPException(status_code=502, detail="AI did not return any valid questions")
    return {"questions": questions}


@router.get(
    "/attempts/{attempt_id}/proctoring",
    response_model=ProctoringDetailsOut,
    dependencies=[Depends(deps.require_pk_api_key_or_admin)],
)
def get_proctoring_details(attempt_id: int, db: Session = Depends(get_db)):
    attempt = db.query(ExternalAttempt).filter(ExternalAttempt.id == attempt_id).first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    proctor = ExternalProctoringService(db)
    events = proctor.list_events(attempt.id)
    return ProctoringDetailsOut(
        attempt_id=attempt.id,
        initial_photo_url=(
            f"/api/v1/integrations/pk/attempts/{attempt.id}/proctoring/photo"
            if attempt.initial_photo_path else None
        ),
        violation_count=attempt.violation_count or 0,
        events=[
            ProctoringEventOut(
                id=e.id,
                event_type=e.event_type,
                severity=e.severity,
                description=e.description,
                metadata=e.event_metadata,
                recorded_at=e.recorded_at,
            )
            for e in events
        ],
    )


@router.get(
    "/attempts/{attempt_id}/proctoring/photo",
    dependencies=[Depends(deps.require_pk_api_key_or_admin)],
)
def get_proctoring_photo(attempt_id: int, db: Session = Depends(get_db)):
    attempt = db.query(ExternalAttempt).filter(ExternalAttempt.id == attempt_id).first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    proctor = ExternalProctoringService(db)
    p = proctor.get_photo_path(attempt)
    if not p:
        raise HTTPException(status_code=404, detail="Initial photo not captured")
    return FileResponse(str(p))


@router.post("/sso/admin/exchange", response_model=AdminSsoExchangeOut)
def admin_sso_exchange(payload: AdminSsoExchangeIn, db: Session = Depends(get_db)):
    """Exchanges a pk-issued JWT for an entest access token (admin SSO).

    The pk backend issues a short-lived JWT signed with PK_SSO_SECRET. Expected claims:
        sub:   admin's email
        name:  admin's display name (optional)
        role:  "admin"
        iss:   "pk"
        exp:   unix timestamp
    """
    secret = settings.pk_sso_secret
    if not secret:
        raise HTTPException(status_code=503, detail="SSO is not configured: PK_SSO_SECRET missing")

    try:
        claims = jwt.decode(payload.token, secret, algorithms=[settings.algorithm])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid SSO token")

    if claims.get("iss") != "pk":
        raise HTTPException(status_code=401, detail="Untrusted token issuer")
    if claims.get("role") != "admin":
        raise HTTPException(status_code=403, detail="SSO token is not an admin token")

    email = claims.get("sub")
    if not email:
        raise HTTPException(status_code=400, detail="SSO token missing subject")

    user = db.query(User).filter(User.email == email).first()
    if user is None:
        user = User(
            email=email,
            full_name=claims.get("name") or email,
            hashed_password=get_password_hash(f"pk-sso-{email}-{secret[:8]}"),
            is_superuser=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    elif not user.is_superuser:
        user.is_superuser = True
        db.commit()

    access_token = create_access_token(
        data={"sub": user.email},
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )
    return AdminSsoExchangeOut(access_token=access_token, email=user.email)
