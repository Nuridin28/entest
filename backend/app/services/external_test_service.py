from typing import List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ..models.external_test import ExternalAttempt, ExternalQuestion, ExternalTest
from ..schemas.external_test import (
    ExternalQuestionIn,
    ExternalTestCreate,
    ExternalTestUpdate,
)


class ExternalTestService:
    def __init__(self, db: Session):
        self.db = db

    def create(self, payload: ExternalTestCreate) -> ExternalTest:
        test = ExternalTest(
            source="pk",
            external_owner_id=payload.external_owner_id,
            title=payload.title,
            description=payload.description,
            default_attempt_limit=payload.default_attempt_limit,
            default_deadline_at=payload.default_deadline_at,
            is_draft=payload.is_draft,
        )
        self.db.add(test)
        self.db.flush()
        for index, q in enumerate(payload.questions):
            self.db.add(self._build_question(test.id, q, fallback_order=index))
        self.db.commit()
        self.db.refresh(test)
        return test

    def list(
        self,
        *,
        external_owner_id: Optional[str] = None,
        include_archived: bool = False,
        offset: int = 0,
        limit: int = 50,
    ) -> List[ExternalTest]:
        q = self.db.query(ExternalTest)
        if external_owner_id is not None:
            q = q.filter(ExternalTest.external_owner_id == external_owner_id)
        if not include_archived:
            q = q.filter(ExternalTest.is_archived.is_(False))
        return q.order_by(ExternalTest.created_at.desc()).offset(offset).limit(limit).all()

    def question_counts(self, test_ids: List[int]) -> dict[int, int]:
        if not test_ids:
            return {}
        rows = (
            self.db.query(ExternalQuestion.test_id, func.count(ExternalQuestion.id))
            .filter(ExternalQuestion.test_id.in_(test_ids))
            .group_by(ExternalQuestion.test_id)
            .all()
        )
        return {tid: cnt for tid, cnt in rows}

    def get(self, test_id: int) -> Optional[ExternalTest]:
        return (
            self.db.query(ExternalTest)
            .options(joinedload(ExternalTest.questions))
            .filter(ExternalTest.id == test_id)
            .first()
        )

    class QuestionsLocked(Exception):
        """Raised when caller tries to replace questions on a test that has completed attempts."""
        pass

    def update(self, test_id: int, payload: ExternalTestUpdate) -> Optional[ExternalTest]:
        test = self.get(test_id)
        if not test:
            return None
        for field in (
            "title",
            "description",
            "default_attempt_limit",
            "default_deadline_at",
            "is_archived",
            "is_draft",
        ):
            value = getattr(payload, field)
            if value is not None:
                setattr(test, field, value)
        if payload.questions is not None:
            # Guard: refuse to replace questions if there are completed attempts —
            # that would create orphan answer rows referencing deleted question ids.
            completed_count = (
                self.db.query(ExternalAttempt)
                .filter(
                    ExternalAttempt.test_id == test.id,
                    ExternalAttempt.status == "completed",
                )
                .count()
            )
            if completed_count > 0:
                raise ExternalTestService.QuestionsLocked(
                    f"Нельзя менять вопросы — у теста {completed_count} завершённых попыток. Создайте новый тест."
                )
            self.db.query(ExternalQuestion).filter(ExternalQuestion.test_id == test.id).delete()
            for index, q in enumerate(payload.questions):
                self.db.add(self._build_question(test.id, q, fallback_order=index))
        self.db.commit()
        self.db.refresh(test)
        return test

    def archive(self, test_id: int) -> bool:
        test = self.get(test_id)
        if not test:
            return False
        test.is_archived = True
        self.db.commit()
        return True

    def delete(self, test_id: int) -> bool:
        """Hard-delete the test row. Questions and attempts cascade via FK ondelete='CASCADE'."""
        test = self.get(test_id)
        if not test:
            return False
        self.db.delete(test)
        self.db.commit()
        return True

    @staticmethod
    def _build_question(test_id: int, q: ExternalQuestionIn, fallback_order: int) -> ExternalQuestion:
        return ExternalQuestion(
            test_id=test_id,
            order_number=q.order_number if q.order_number is not None else fallback_order,
            question_type=q.question_type,
            content=q.content,
            options=q.options,
            correct_answer=q.correct_answer,
            points=q.points,
        )

    # Attempt-side helpers (used by issue-token / take flow)

    def attempts_used_for_user(self, test_id: int, external_user_id: str) -> int:
        return (
            self.db.query(func.count(ExternalAttempt.id))
            .filter(
                ExternalAttempt.test_id == test_id,
                ExternalAttempt.external_user_id == external_user_id,
                ExternalAttempt.status != "abandoned",
            )
            .scalar()
            or 0
        )
