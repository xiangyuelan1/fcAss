"""
认证API
"""
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
import random

from app.core.database import get_db
from app.core.config import settings
from app.auth import (
    Token, UserResponse, UserCreate,
    authenticate_user, create_access_token, get_password_hash,
    get_current_active_user, verify_password
)
from app.models.user import User as UserModel

router = APIRouter()

_NIUNIU_ADJECTIVES = [
    "稳健", "勇敢", "智慧", "灵动", "坚韧",
    "敏锐", "果敢", "沉着", "睿智", "豪迈",
    "从容", "精明", "淡定", "乐观", "坚定",
    "机敏", "豁达", "谦逊", "刚毅", "沉稳",
]

_NIUNIU_NOUNS = [
    "猎手", "先锋", "舵手", "骑手", "探路者",
    "守望者", "领航员", "分析师", "操盘手", "策略师",
    "投资者", "交易员", "研究员", "战略家", "指挥官",
    "护卫者", "开拓者", "远航者", "逐浪者", "攀登者",
]


def _generate_niuniu_nickname() -> str:
    adj = random.choice(_NIUNIU_ADJECTIVES)
    noun = random.choice(_NIUNIU_NOUNS)
    return f"牛牛{adj}{noun}"


class UpdateUserRequest(BaseModel):
    email: Optional[str] = None
    password: Optional[str] = None
    new_password: Optional[str] = None
    nickname: Optional[str] = None
    auto_clear_predictions_daily: Optional[bool] = None


class ChangePasswordRequest(BaseModel):
    """修改密码请求"""
    old_password: str = Field(..., description="旧密码")
    new_password: str = Field(..., min_length=6, description="新密码")


@router.post("/register", response_model=UserResponse)
async def register(user_data: UserCreate, db: Session = Depends(get_db)):
    """用户注册"""
    existing_user = db.query(UserModel).filter(
        (UserModel.username == user_data.username) | 
        (UserModel.email == user_data.email)
    ).first()
    
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名或邮箱已存在"
        )
    
    hashed_password = get_password_hash(user_data.password)
    nickname = user_data.nickname or _generate_niuniu_nickname()
    db_user = UserModel(
        username=user_data.username,
        email=user_data.email,
        hashed_password=hashed_password,
        nickname=nickname,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    return db_user


@router.post("/token", response_model=Token)
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """用户登录获取令牌"""
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user.last_login_at = datetime.now(timezone.utc)
    forwarded = request.headers.get("x-forwarded-for")
    user.last_login_ip = forwarded.split(",")[0].strip() if forwarded else request.client.host if request.client else None
    user.last_heartbeat = datetime.now(timezone.utc)
    db.commit()
    
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user: UserModel = Depends(get_current_active_user)):
    """获取当前用户信息"""
    return current_user


@router.put("/me", response_model=UserResponse)
async def update_user(
    update_data: UpdateUserRequest,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """更新用户信息"""
    if update_data.email:
        existing = db.query(UserModel).filter(
            UserModel.email == update_data.email,
            UserModel.id != current_user.id
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="邮箱已被使用"
            )
        current_user.email = update_data.email

    if update_data.nickname is not None:
        current_user.nickname = update_data.nickname

    if update_data.auto_clear_predictions_daily is not None:
        current_user.auto_clear_predictions_daily = update_data.auto_clear_predictions_daily

    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/change-password")
async def change_password(
    password_data: ChangePasswordRequest,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """修改密码"""
    if not verify_password(password_data.old_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="旧密码错误"
        )
    
    current_user.hashed_password = get_password_hash(password_data.new_password)
    db.commit()
    
    return {"success": True, "message": "密码修改成功"}


@router.post("/refresh", response_model=Token)
async def refresh_token(current_user: UserModel = Depends(get_current_active_user)):
    """刷新令牌"""
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": current_user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}


@router.delete("/me")
async def delete_account(
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """删除账户"""
    db.delete(current_user)
    db.commit()
    return {"success": True, "message": "账户已删除"}


@router.post("/heartbeat")
async def heartbeat(
    request: Request,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """用户心跳，用于在线状态追踪"""
    current_user.last_heartbeat = datetime.now(timezone.utc)
    db.commit()
    return {"success": True}


@router.get("/online-count")
async def get_online_count(db: Session = Depends(get_db)):
    """获取当前在线用户数（5分钟内有心跳的视为在线）"""
    threshold = datetime.now(timezone.utc) - timedelta(minutes=5)
    count = db.query(UserModel).filter(
        UserModel.last_heartbeat >= threshold,
        UserModel.is_active == True
    ).count()
    return {"online_count": count}
