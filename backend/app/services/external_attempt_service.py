import hashlib
import hmac
import json
import logging
import time
from datetime import datetime, timedelta
from typing import Optional, Tuple

import httpx
from jose import JWTError, jwt
from sqlalchemy.orm import Session, joinedload

from ..core.config import settings
from ..models.external_test import ExternalAttempt, ExternalQuestion, ExternalTest


logger = logging.getLogger(__name__)


class AttemptError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


class ExternalAttemptService:
    TOKEN_AUD = "pk-student-attempt"

    def __init__(self, db: Session):
        self.db = db

    # ---------- token issuance ----------

    def issue_token(
        self,
        *,
        test_id: int,
        external_user_id: str,
        external_user_email: Optional[str] = None,
        external_user_name: Optional[str] = None,
        external_assignment_id: Optional[str] = None,
        attempt_limit_override: Optional[int] = None,
        deadline_override: Optional[datetime] = None,
        pk_attempts_used: Optional[int] = None,
    ) -> Tuple[ExternalAttempt, str, datetime]:
        test = self.db.query(ExternalTest).filter(ExternalTest.id == test_id).first()
        if not test:
            raise AttemptError(404, "Test not found")
        if test.is_archived:
            raise AttemptError(409, "Test is archived")
        if test.is_draft:
            raise AttemptError(409, "Test is a draft — publish it before assigning")

        attempt_limit = attempt_limit_override if attempt_limit_override is not None else test.default_attempt_limit
        deadline = deadline_override if deadline_override is not None else test.default_deadline_at

        if deadline and deadline < datetime.utcnow():
            raise AttemptError(409, "Deadline has passed")

        existing_in_progress = (
            self.db.query(ExternalAttempt)
            .filter(
                ExternalAttempt.test_id == test_id,
                ExternalAttempt.external_user_id == external_user_id,
                ExternalAttempt.status == "in_progress",
            )
            .order_by(ExternalAttempt.id.desc())
            .first()
        )
        if existing_in_progress is not None:
            attempt = existing_in_progress
        else:
            # pk is the source of truth for attempts_used (webhook-driven).
            # We trust pk's count if provided; otherwise fall back to local count.
            if pk_attempts_used is not None:
                used = pk_attempts_used
            else:
                used = (
                    self.db.query(ExternalAttempt)
                    .filter(
                        ExternalAttempt.test_id == test_id,
                        ExternalAttempt.external_user_id == external_user_id,
                        ExternalAttempt.status.in_(["completed", "in_progress"]),
                    )
                    .count()
                )
            if attempt_limit is not None and used >= attempt_limit:
                raise AttemptError(409, "Attempt limit reached")

            attempt = ExternalAttempt(
                test_id=test.id,
                external_user_id=external_user_id,
                external_user_email=external_user_email,
                external_user_name=external_user_name,
                external_assignment_id=external_assignment_id,
                status="in_progress",
                started_at=datetime.utcnow(),
            )
            self.db.add(attempt)
            self.db.commit()
            self.db.refresh(attempt)

        ttl = timedelta(minutes=settings.pk_student_token_ttl_minutes)
        expires_at = datetime.utcnow() + ttl
        token = jwt.encode(
            {
                "sub": external_user_id,
                "aud": self.TOKEN_AUD,
                "attempt_id": attempt.id,
                "test_id": test.id,
                "exp": expires_at,
            },
            settings.secret_key,
            algorithm=settings.algorithm,
        )
        return attempt, token, expires_at

    def attempt_from_token(self, token: str) -> ExternalAttempt:
        try:
            claims = jwt.decode(
                token,
                settings.secret_key,
                algorithms=[settings.algorithm],
                audience=self.TOKEN_AUD,
            )
        except JWTError:
            raise AttemptError(401, "Invalid or expired attempt token")
        attempt_id = claims.get("attempt_id")
        if not attempt_id:
            raise AttemptError(401, "Token missing attempt_id")
        attempt = (
            self.db.query(ExternalAttempt)
            .options(joinedload(ExternalAttempt.test).joinedload(ExternalTest.questions))
            .filter(ExternalAttempt.id == attempt_id)
            .first()
        )
        if not attempt:
            raise AttemptError(404, "Attempt not found")
        return attempt

    # ---------- submission ----------

    def submit(self, attempt: ExternalAttempt, answers: list) -> ExternalAttempt:
        if attempt.status != "in_progress":
            raise AttemptError(409, f"Attempt is already {attempt.status}")

        questions = {q.id: q for q in attempt.test.questions}
        total_points = sum(q.points for q in attempt.test.questions) or 1.0
        earned = 0.0
        graded = []

        for entry in answers:
            qid = entry.question_id if hasattr(entry, "question_id") else entry["question_id"]
            given = entry.answer if hasattr(entry, "answer") else entry.get("answer")
            q = questions.get(qid)
            if not q:
                continue
            is_correct = self._grade_answer(q, given)
            if is_correct is True:
                earned += q.points
            graded.append({
                "question_id": qid,
                "given": given,
                "correct": is_correct,
                "points_awarded": q.points if is_correct is True else 0.0,
            })

        score = round((earned / total_points) * 100.0, 2) if total_points else 0.0

        attempt.answers = {"graded": graded, "total_points": total_points, "earned": earned}
        attempt.score = score
        attempt.status = "completed"
        attempt.completed_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(attempt)

        try:
            self._fire_webhook(attempt)
            self.db.commit()
        except Exception as exc:
            logger.warning("webhook delivery to pk failed: %s", exc)

        return attempt

    @staticmethod
    def _grade_answer(question: ExternalQuestion, given) -> Optional[bool]:
        correct = question.correct_answer
        if correct is None:
            return None
        if question.question_type == "mcq":
            return given == correct
        if question.question_type == "multi":
            try:
                return sorted(list(given)) == sorted(list(correct))
            except TypeError:
                return given == correct
        if question.question_type == "text":
            if isinstance(correct, list):
                return any(str(given).strip().lower() == str(c).strip().lower() for c in correct)
            return str(given).strip().lower() == str(correct).strip().lower()
        return None

    # ---------- webhook delivery ----------

    # Retry config: exponential backoff. Last attempt at ~0.5s, ~1s, ~2s after first failure.
    _WEBHOOK_MAX_ATTEMPTS = 4
    _WEBHOOK_BACKOFF_BASE = 0.5

    @staticmethod
    def _fire_webhook(attempt: ExternalAttempt) -> None:
        url = settings.pk_webhook_url
        secret = settings.pk_webhook_secret
        if not url or not secret:
            logger.info("pk webhook not configured; skipping delivery")
            return
        payload = {
            "entest_attempt_id": str(attempt.id),
            "external_assignment_id": attempt.external_assignment_id,
            "external_user_id": attempt.external_user_id,
            "test_id": attempt.test_id,
            "status": attempt.status,
            "score": attempt.score,
            "started_at": attempt.started_at.isoformat() if attempt.started_at else None,
            "completed_at": attempt.completed_at.isoformat() if attempt.completed_at else None,
            "violation_count": int(attempt.violation_count or 0),
            "has_initial_photo": bool(attempt.initial_photo_path),
        }
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        signature = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
        headers = {
            "Content-Type": "application/json",
            "X-Signature": f"sha256={signature}",
        }

        last_err: Optional[str] = None
        for i in range(ExternalAttemptService._WEBHOOK_MAX_ATTEMPTS):
            try:
                with httpx.Client(timeout=10.0) as client:
                    resp = client.post(url, content=body, headers=headers)
                if 200 <= resp.status_code < 300:
                    attempt.webhook_delivered_at = datetime.utcnow()
                    if i > 0:
                        logger.info("pk webhook delivered on retry %s/%s for attempt=%s", i + 1, ExternalAttemptService._WEBHOOK_MAX_ATTEMPTS, attempt.id)
                    return
                # 4xx is non-retryable except 408 / 429
                if 400 <= resp.status_code < 500 and resp.status_code not in (408, 429):
                    raise RuntimeError(f"pk webhook returned {resp.status_code}: {resp.text[:200]}")
                last_err = f"{resp.status_code}: {resp.text[:200]}"
            except (httpx.RequestError, httpx.TimeoutException) as exc:
                last_err = f"network: {exc}"

            sleep_s = ExternalAttemptService._WEBHOOK_BACKOFF_BASE * (2 ** i)
            logger.warning("pk webhook attempt %s/%s failed (%s); retry in %.1fs", i + 1, ExternalAttemptService._WEBHOOK_MAX_ATTEMPTS, last_err, sleep_s)
            time.sleep(sleep_s)

        raise RuntimeError(f"pk webhook failed after {ExternalAttemptService._WEBHOOK_MAX_ATTEMPTS} attempts: {last_err}")
