import base64
import os
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from sqlalchemy.orm import Session

from ..models.external_test import ExternalAttempt, ExternalProctoringEvent


PHOTO_ROOT = Path(os.getenv("EXTERNAL_PROCTORING_DIR", "/app/uploads/external-proctoring"))


class ExternalProctoringService:
    SEVERITY_WEIGHT = {"low": 1, "medium": 3, "high": 5}

    def __init__(self, db: Session):
        self.db = db
        PHOTO_ROOT.mkdir(parents=True, exist_ok=True)

    # ---------- initial photo ----------

    def save_initial_photo(self, attempt: ExternalAttempt, data_url: str) -> str:
        """Decodes a data: URL and persists the photo. Returns relative path."""
        match = re.match(r"data:image/(jpeg|jpg|png);base64,(.+)$", data_url, re.IGNORECASE)
        if not match:
            raise ValueError("Expected data:image/(jpeg|png);base64 payload")
        ext = match.group(1).lower()
        raw = base64.b64decode(match.group(2))
        if len(raw) > 5 * 1024 * 1024:
            raise ValueError("Photo too large (max 5 MB)")
        fname = f"{attempt.id}_{uuid.uuid4().hex}.{ext}"
        full = PHOTO_ROOT / fname
        full.write_bytes(raw)
        attempt.initial_photo_path = fname
        self.db.commit()
        return fname

    def get_photo_path(self, attempt: ExternalAttempt) -> Optional[Path]:
        if not attempt.initial_photo_path:
            return None
        p = PHOTO_ROOT / attempt.initial_photo_path
        return p if p.exists() else None

    # ---------- events ----------

    def log_event(
        self,
        attempt: ExternalAttempt,
        *,
        event_type: str,
        severity: str = "low",
        description: Optional[str] = None,
        metadata: Optional[dict] = None,
        recorded_at: Optional[datetime] = None,
    ) -> ExternalProctoringEvent:
        ev = ExternalProctoringEvent(
            attempt_id=attempt.id,
            event_type=event_type,
            severity=severity if severity in self.SEVERITY_WEIGHT else "low",
            description=description,
            event_metadata=metadata,
            recorded_at=recorded_at or datetime.utcnow(),
        )
        self.db.add(ev)
        attempt.violation_count = (attempt.violation_count or 0) + self.SEVERITY_WEIGHT.get(severity, 1)
        self.db.commit()
        self.db.refresh(ev)
        return ev

    def list_events(self, attempt_id: int) -> List[ExternalProctoringEvent]:
        return (
            self.db.query(ExternalProctoringEvent)
            .filter(ExternalProctoringEvent.attempt_id == attempt_id)
            .order_by(ExternalProctoringEvent.recorded_at)
            .all()
        )
