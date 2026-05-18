import json
import logging
import threading
import time
from collections import deque
from typing import Deque, Dict, List, Optional

from openai import OpenAI

from ..core.config import settings


logger = logging.getLogger(__name__)


VALID_TYPES = {"mcq", "multi", "text"}


class _RateLimiter:
    """Simple in-memory sliding-window per-caller rate limiter.

    Not durable across restarts and not shared across workers, but enough to keep
    a single admin from spamming the AI endpoint hundreds of times per minute."""

    def __init__(self, max_calls: int, window_seconds: int):
        self.max_calls = max_calls
        self.window = window_seconds
        self._buckets: Dict[str, Deque[float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str) -> tuple[bool, int]:
        now = time.time()
        with self._lock:
            bucket = self._buckets.setdefault(key, deque())
            while bucket and bucket[0] < now - self.window:
                bucket.popleft()
            if len(bucket) >= self.max_calls:
                retry_in = int(self.window - (now - bucket[0])) + 1
                return False, retry_in
            bucket.append(now)
            return True, 0


# 10 AI generations per 60 seconds per caller. Tweak if needed.
_ai_limiter = _RateLimiter(max_calls=10, window_seconds=60)


def check_rate_limit(key: str) -> tuple[bool, int]:
    return _ai_limiter.allow(key)


class AIQuestionGenerator:
    def __init__(self):
        self.client: Optional[OpenAI] = None
        if settings.openai_api_key:
            self.client = OpenAI(api_key=settings.openai_api_key)
        else:
            logger.warning("OPENAI_API_KEY is not set — AI generation will not work")

    def is_available(self) -> bool:
        return self.client is not None

    def generate(
        self,
        *,
        topic: str,
        count: int,
        difficulty: str,
        language: str,
        question_types: List[str],
        instructions: Optional[str] = None,
    ) -> List[dict]:
        if not self.client:
            raise RuntimeError("AI generation is not configured")

        count = max(1, min(count, 30))
        types = [t for t in (question_types or []) if t in VALID_TYPES] or ["mcq"]

        system_prompt = (
            "You generate quiz questions for an admissions testing platform. "
            "ALWAYS respond with valid JSON that matches the schema. "
            "Each question must be self-contained, factually correct, and unambiguous. "
            "For mcq: exactly one correct option among options. "
            "For multi: 2 or more correct options. "
            "For text: free-form answer with a canonical correct_answer string."
        )

        schema_hint = {
            "questions": [
                {
                    "question_type": "mcq | multi | text",
                    "content": "the question text",
                    "options": ["string", "..."],
                    "correct_answer": "for mcq: one of options; for multi: list of options; for text: string",
                    "points": 1.0,
                }
            ]
        }

        user_prompt = f"""
Generate exactly {count} quiz questions.

Topic: {topic}
Difficulty: {difficulty}
Answer/text language: {language}
Allowed question types: {', '.join(types)}

Rules:
- Each question MUST use one of the allowed types ({', '.join(types)}).
- mcq must have 3-5 distinct options.
- multi must have 4-6 options with 2+ correct.
- text must have a clear short canonical correct_answer.
- Do NOT include explanations.
- Write all content in {language}.

Return JSON exactly matching this schema (no other keys, no markdown):
{json.dumps(schema_hint, ensure_ascii=False)}
""".strip()

        if instructions:
            user_prompt += f"\n\nAdditional admin instructions:\n{instructions.strip()}"

        try:
            resp = self.client.chat.completions.create(
                model=settings.openai_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                response_format={"type": "json_object"},
                temperature=0.7,
            )
        except Exception as exc:
            logger.error("OpenAI request failed: %s", exc)
            raise RuntimeError(f"AI request failed: {exc}")

        raw = resp.choices[0].message.content or "{}"
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            logger.error("Invalid JSON from OpenAI: %s | raw=%s", exc, raw[:500])
            raise RuntimeError("AI returned invalid JSON")

        questions = data.get("questions") or []
        if not isinstance(questions, list):
            raise RuntimeError("AI returned questions in wrong format")

        # Normalize / validate each question.
        normalized: List[dict] = []
        for idx, q in enumerate(questions):
            if not isinstance(q, dict):
                continue
            qtype = q.get("question_type")
            content = (q.get("content") or "").strip()
            if qtype not in VALID_TYPES or not content:
                continue
            opts = q.get("options")
            if qtype in ("mcq", "multi"):
                if not isinstance(opts, list) or len(opts) < 2:
                    continue
                opts = [str(o) for o in opts]
            else:
                opts = None
            correct = q.get("correct_answer")
            if qtype == "mcq" and (not isinstance(correct, (str, int, float)) or str(correct) not in [str(o) for o in opts]):
                continue
            if qtype == "multi":
                if not isinstance(correct, list) or len(correct) < 1:
                    continue
                correct = [str(c) for c in correct if str(c) in [str(o) for o in opts]]
                if not correct:
                    continue
            try:
                points = float(q.get("points") or 1.0)
            except (TypeError, ValueError):
                points = 1.0
            normalized.append(
                {
                    "question_type": qtype,
                    "content": content,
                    "options": opts,
                    "correct_answer": correct,
                    "points": points,
                    "order_number": idx,
                }
            )

        return normalized
