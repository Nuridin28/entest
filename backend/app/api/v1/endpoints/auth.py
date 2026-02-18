from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from ....core.database import get_db
from ....services.auth_service import AuthService
from ....services.user_service import UserService
from ....schemas.auth import Token
from ....schemas.user import User, UserCreate
from ...deps import oauth2_scheme

router = APIRouter()


@router.post("/token", response_model=Token)
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    auth_service = AuthService(db)
    token = auth_service.authenticate_and_create_token(
        form_data.username, form_data.password
    )
    
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return token


@router.post("/refresh-token", response_model=Token)
async def refresh_access_token(
    refresh_token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    auth_service = AuthService(db)
    new_token_data = auth_service.refresh_token(refresh_token)
    
    if not new_token_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token or user not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return new_token_data


@router.post("/register", response_model=User)
async def register_user(
    user_data: UserCreate,
    db: Session = Depends(get_db)
):
    user_service = UserService(db)
    
                                   
    existing_user = user_service.get_user_by_email(user_data.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    try:
        user = user_service.create_user(user_data)
        return user
    except ValueError as e:
        if "Email already registered" in str(e):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        ) 