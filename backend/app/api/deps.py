from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional

from ..core.config import settings
from ..core.database import get_db
from ..core.security import oauth2_scheme
from ..services.auth_service import AuthService
from ..models.user import User


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    auth_service = AuthService(db)
    user = auth_service.get_current_user(token)
    
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return user


def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    return current_user


def get_current_active_superuser(
    current_user: User = Depends(get_current_active_user),
) -> User:
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=403, detail="The user doesn't have enough privileges"
        )
    return current_user


def verify_pk_api_key(authorization: Optional[str] = Header(None)) -> bool:
    """Verifies the Bearer token in Authorization header matches PK_API_KEY.

    Used to gate service-to-service endpoints used by the pk (admissions) backend.
    """
    expected = settings.pk_api_key
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="Integration is not configured: PK_API_KEY is not set",
        )
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    provided = authorization.split(" ", 1)[1].strip()
    if provided != expected:
        raise HTTPException(status_code=401, detail="Invalid integration credentials")
    return True


def require_pk_api_key_or_admin(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> bool:
    """Accepts EITHER the S2S API key OR a logged-in entest superuser.

    Used for endpoints called both by pk-backend (S2S key) and by the entest admin
    frontend (the user's own access token from the SSO exchange).
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    provided = authorization.split(" ", 1)[1].strip()

    if settings.pk_api_key and provided == settings.pk_api_key:
        return True

    auth_service = AuthService(db)
    user = auth_service.get_current_user(provided)
    if user is None or not user.is_superuser:
        raise HTTPException(status_code=401, detail="Invalid integration credentials")
    return True

