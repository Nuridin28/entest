from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ....core.database import get_db
from ....api.deps import get_current_active_user
from ....schemas.user import User

router = APIRouter()


@router.get("/me", response_model=User)
async def read_users_me(
    current_user: User = Depends(get_current_active_user)
):
    return current_user


@router.get("/profile", response_model=User)
async def get_user_profile(
    current_user: User = Depends(get_current_active_user)
):
    return current_user 