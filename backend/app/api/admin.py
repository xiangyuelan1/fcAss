import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime, date, timedelta, timezone

from app.core.database import get_db
from app.auth import require_admin, get_password_hash
from app.models.user import User as UserModel
from app.models.system_config import SystemConfig
from app.models.community import CommunityModel, CommunitySignal, CommunityLike, UserPoints, PointTransaction, PKChallenge
from app.models.user_model import UserModel as UserORMModel
from app.models.training import TrainingTask
from app.models.stock import Stock, StockPrice
from sqlalchemy import func, desc

logger = logging.getLogger(__name__)
router = APIRouter()


class UserDetailResponse(BaseModel):
    id: int
    username: str
    nickname: Optional[str] = None
    email: Optional[str] = None
    is_active: bool
    is_admin: bool
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    last_login_at: Optional[str] = None
    last_login_ip: Optional[str] = None
    last_heartbeat: Optional[str] = None
    is_online: bool = False

    model_config = {"from_attributes": True}


class ResetPasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=6, description="新密码")


class SystemConfigCreate(BaseModel):
    category: str = Field(..., description="分类: model_type/algorithm/param_template")
    name: str = Field(..., description="配置名称")
    key: str = Field(..., description="配置键(唯一)")
    description: Optional[str] = None
    value: dict = Field(..., description="配置内容(JSON)")
    is_active: bool = True
    sort_order: int = 0


class SystemConfigUpdate(BaseModel):
    category: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    value: Optional[dict] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


def _is_online(last_heartbeat, threshold: datetime) -> bool:
    """判断用户是否在线，兼容 naive/aware 两种 datetime"""
    if last_heartbeat is None:
        return False
    hb = last_heartbeat.replace(tzinfo=timezone.utc) if last_heartbeat.tzinfo is None else last_heartbeat
    th = threshold.replace(tzinfo=timezone.utc) if threshold.tzinfo is None else threshold
    return hb >= th


@router.get("/users", response_model=List[UserDetailResponse])
async def list_users(
    skip: int = 0,
    limit: int = 100,
    admin: UserModel = Depends(require_admin),
    db: Session = Depends(get_db)
):
    users = db.query(UserModel).offset(skip).limit(limit).all()
    threshold = datetime.now(timezone.utc) - timedelta(minutes=5)
    result = []
    for u in users:
        result.append({
            'id': u.id,
            'username': u.username,
            'nickname': u.nickname,
            'email': u.email,
            'is_active': u.is_active,
            'is_admin': u.is_admin,
            'created_at': u.created_at.isoformat() if u.created_at else None,
            'updated_at': u.updated_at.isoformat() if u.updated_at else None,
            'last_login_at': u.last_login_at.isoformat() if u.last_login_at else None,
            'last_login_ip': u.last_login_ip,
            'last_heartbeat': u.last_heartbeat.isoformat() if u.last_heartbeat else None,
            'is_online': _is_online(u.last_heartbeat, threshold),
        })
    return result


@router.get("/users/{user_id}", response_model=UserDetailResponse)
async def get_user(
    user_id: int,
    admin: UserModel = Depends(require_admin),
    db: Session = Depends(get_db)
):
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    threshold = datetime.now(timezone.utc) - timedelta(minutes=5)
    return {
        'id': user.id,
        'username': user.username,
        'nickname': user.nickname,
        'email': user.email,
        'is_active': user.is_active,
        'is_admin': user.is_admin,
        'created_at': user.created_at.isoformat() if user.created_at else None,
        'updated_at': user.updated_at.isoformat() if user.updated_at else None,
        'last_login_at': user.last_login_at.isoformat() if user.last_login_at else None,
        'last_login_ip': user.last_login_ip,
        'last_heartbeat': user.last_heartbeat.isoformat() if user.last_heartbeat else None,
        'is_online': _is_online(user.last_heartbeat, threshold),
    }


@router.post("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: int,
    request: ResetPasswordRequest,
    admin: UserModel = Depends(require_admin),
    db: Session = Depends(get_db)
):
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    user.hashed_password = get_password_hash(request.new_password)
    db.commit()
    return {"success": True, "message": f"用户 {user.username} 密码已重置"}


@router.post("/users/{user_id}/toggle-active")
async def toggle_user_active(
    user_id: int,
    admin: UserModel = Depends(require_admin),
    db: Session = Depends(get_db)
):
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="不能禁用自己")
    user.is_active = not user.is_active
    db.commit()
    return {"success": True, "message": f"用户 {user.username} 已{'启用' if user.is_active else '禁用'}"}


@router.get("/users/{user_id}/detail")
async def get_user_full_detail(
    user_id: int,
    admin: UserModel = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """获取用户完整详情（含模型、训练记录、发言记录等统计信息）"""
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    threshold = datetime.now(timezone.utc) - timedelta(minutes=5)
    is_online = _is_online(user.last_heartbeat, threshold)

    user_models = db.query(UserORMModel).filter(UserORMModel.user_id == user_id).all()
    model_count = len(user_models)
    trained_count = len([m for m in user_models if m.status == 'trained'])

    training_tasks = db.query(TrainingTask).join(
        UserORMModel, TrainingTask.model_id == UserORMModel.id
    ).filter(UserORMModel.user_id == user_id).all()
    training_count = len(training_tasks)
    training_completed = len([t for t in training_tasks if t.status == 'completed'])

    community_models = db.query(CommunityModel).filter(CommunityModel.user_id == user_id).all()
    community_signals = db.query(CommunitySignal).filter(CommunitySignal.user_id == user_id).all()

    points = db.query(UserPoints).filter(UserPoints.user_id == user_id).first()

    from app.models.message import Message
    messages_sent = db.query(Message).filter(Message.sender_id == user_id).count()

    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "is_active": user.is_active,
        "is_admin": user.is_admin,
        "is_online": is_online,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "updated_at": user.updated_at.isoformat() if user.updated_at else None,
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
        "last_login_ip": user.last_login_ip,
        "last_heartbeat": user.last_heartbeat.isoformat() if user.last_heartbeat else None,
        "stats": {
            "model_count": model_count,
            "trained_count": trained_count,
            "training_count": training_count,
            "training_completed": training_completed,
            "community_models": len(community_models),
            "community_signals": len(community_signals),
            "total_points": points.total_points if points else 0,
            "level": points.level if points else 0,
            "messages_sent": messages_sent,
        },
        "models": [{
            "id": m.id,
            "name": m.name,
            "model_type": m.model_type,
            "status": m.status,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        } for m in user_models],
        "recent_trainings": [{
            "id": t.id,
            "status": t.status,
            "start_time": t.start_time.isoformat() if t.start_time else None,
            "end_time": t.end_time.isoformat() if t.end_time else None,
        } for t in training_tasks[:10]],
    }


@router.get("/config", response_model=List[dict])
async def list_configs(
    category: Optional[str] = None,
    admin: UserModel = Depends(require_admin),
    db: Session = Depends(get_db)
):
    query = db.query(SystemConfig)
    if category:
        query = query.filter(SystemConfig.category == category)
    configs = query.order_by(SystemConfig.sort_order, SystemConfig.id).all()
    return [{
        'id': c.id,
        'category': c.category,
        'name': c.name,
        'key': c.key,
        'description': c.description,
        'value': c.value,
        'is_active': c.is_active,
        'sort_order': c.sort_order,
        'created_at': c.created_at.isoformat() if c.created_at else None,
        'updated_at': c.updated_at.isoformat() if c.updated_at else None,
    } for c in configs]


@router.post("/config")
async def create_config(
    data: SystemConfigCreate,
    admin: UserModel = Depends(require_admin),
    db: Session = Depends(get_db)
):
    existing = db.query(SystemConfig).filter(SystemConfig.key == data.key).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"配置键 {data.key} 已存在")
    config = SystemConfig(
        category=data.category,
        name=data.name,
        key=data.key,
        description=data.description,
        value=data.value,
        is_active=data.is_active,
        sort_order=data.sort_order,
    )
    db.add(config)
    db.commit()
    db.refresh(config)
    return {"success": True, "message": "配置创建成功", "id": config.id}


@router.put("/config/{config_id}")
async def update_config(
    config_id: int,
    data: SystemConfigUpdate,
    admin: UserModel = Depends(require_admin),
    db: Session = Depends(get_db)
):
    config = db.query(SystemConfig).filter(SystemConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(config, key, value)
    db.commit()
    return {"success": True, "message": "配置更新成功"}


@router.delete("/config/{config_id}")
async def delete_config(
    config_id: int,
    admin: UserModel = Depends(require_admin),
    db: Session = Depends(get_db)
):
    config = db.query(SystemConfig).filter(SystemConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")
    db.delete(config)
    db.commit()
    return {"success": True, "message": "配置删除成功"}


@router.get("/config/active/{category}")
async def get_active_configs(
    category: str,
    db: Session = Depends(get_db)
):
    configs = db.query(SystemConfig).filter(
        SystemConfig.category == category,
        SystemConfig.is_active == True
    ).order_by(SystemConfig.sort_order, SystemConfig.id).all()
    return [{
        'key': c.key,
        'name': c.name,
        'description': c.description,
        'value': c.value,
    } for c in configs]


@router.get("/stats")
async def get_admin_stats(
    admin: UserModel = Depends(require_admin),
    db: Session = Depends(get_db)
):
    today = date.today()
    today_start = datetime.combine(today, datetime.min.time())

    total_users = db.query(func.count(UserModel.id)).scalar()
    active_users = db.query(func.count(UserModel.id)).filter(UserModel.is_active == True).scalar()
    admin_users = db.query(func.count(UserModel.id)).filter(UserModel.is_admin == True).scalar()
    new_today = db.query(func.count(UserModel.id)).filter(UserModel.created_at >= today_start).scalar()

    total_models = db.query(func.count(UserORMModel.id)).scalar()
    trained_models = db.query(func.count(UserORMModel.id)).filter(UserORMModel.status == 'trained').scalar()
    community_published = db.query(func.count(CommunityModel.id)).filter(CommunityModel.is_active == True).scalar()

    total_tasks = db.query(func.count(TrainingTask.id)).scalar()
    completed_tasks = db.query(func.count(TrainingTask.id)).filter(TrainingTask.status == 'completed').scalar()
    failed_tasks = db.query(func.count(TrainingTask.id)).filter(TrainingTask.status == 'failed').scalar()
    running_tasks = db.query(func.count(TrainingTask.id)).filter(TrainingTask.status == 'running').scalar()

    community_models = community_published
    community_signals = db.query(func.count(CommunitySignal.id)).scalar()
    community_likes = db.query(func.count(CommunityLike.id)).scalar()
    community_clones = db.query(func.sum(CommunityModel.clones_count)).scalar() or 0
    pk_challenges = db.query(func.count(PKChallenge.id)).scalar()

    total_stocks = db.query(func.count(Stock.id)).scalar()
    price_records = db.query(func.count(StockPrice.id)).scalar()

    total_distributed = db.query(func.sum(UserPoints.total_points)).scalar() or 0
    top_users_rows = db.query(UserPoints).order_by(desc(UserPoints.total_points)).limit(5).all()
    top_users = []
    for p in top_users_rows:
        user = db.query(UserModel).filter(UserModel.id == p.user_id).first()
        top_users.append({
            "user_id": p.user_id,
            "username": user.username if user else "unknown",
            "total_points": p.total_points,
            "level": p.level,
        })

    return {
        "users": {
            "total": total_users,
            "active": active_users,
            "admins": admin_users,
            "new_today": new_today,
        },
        "models": {
            "total": total_models,
            "trained": trained_models,
            "community_published": community_published,
        },
        "training": {
            "total_tasks": total_tasks,
            "completed": completed_tasks,
            "failed": failed_tasks,
            "running": running_tasks,
        },
        "community": {
            "models": community_models,
            "signals": community_signals,
            "likes": community_likes,
            "clones": community_clones,
            "pk_challenges": pk_challenges,
        },
        "data": {
            "stocks": total_stocks,
            "price_records": price_records,
        },
        "points": {
            "total_distributed": total_distributed,
            "top_users": top_users,
        },
        "online": {
            "count": db.query(UserModel).filter(
                UserModel.last_heartbeat >= datetime.now(timezone.utc) - timedelta(minutes=5),
                UserModel.is_active == True
            ).count(),
        },
    }


@router.get("/activity")
async def get_admin_activity(
    limit: int = Query(50, ge=1, le=200),
    admin: UserModel = Depends(require_admin),
    db: Session = Depends(get_db)
):
    activities = []

    recent_users = db.query(UserModel).order_by(desc(UserModel.created_at)).limit(limit).all()
    for u in recent_users:
        activities.append({
            "type": "user_register",
            "description": f"新用户 {u.username} 注册",
            "user_id": u.id,
            "username": u.username,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        })

    recent_models = db.query(CommunityModel).order_by(desc(CommunityModel.created_at)).limit(limit).all()
    for m in recent_models:
        author = db.query(UserModel).filter(UserModel.id == m.user_id).first()
        activities.append({
            "type": "model_publish",
            "description": f"{author.username if author else 'unknown'} 发布了模型「{m.name}」",
            "user_id": m.user_id,
            "username": author.username if author else "unknown",
            "created_at": m.created_at.isoformat() if m.created_at else None,
        })

    recent_pks = db.query(PKChallenge).filter(
        PKChallenge.status == 'completed'
    ).order_by(desc(PKChallenge.evaluated_at)).limit(limit).all()
    for pk in recent_pks:
        winner = db.query(UserModel).filter(UserModel.id == pk.winner_id).first() if pk.winner_id else None
        activities.append({
            "type": "pk_result",
            "description": f"PK挑战 #{pk.id} 完成，胜者: {winner.username if winner else '平局'}",
            "user_id": pk.winner_id,
            "username": winner.username if winner else "unknown",
            "created_at": pk.evaluated_at.isoformat() if pk.evaluated_at else None,
        })

    recent_transactions = db.query(PointTransaction).order_by(desc(PointTransaction.created_at)).limit(limit).all()
    for t in recent_transactions:
        user = db.query(UserModel).filter(UserModel.id == t.user_id).first()
        activities.append({
            "type": "points_change",
            "description": f"{user.username if user else 'unknown'} {'获得' if t.points > 0 else '扣除'} {abs(t.points)} 积分 ({t.description or t.action})",
            "user_id": t.user_id,
            "username": user.username if user else "unknown",
            "created_at": t.created_at.isoformat() if t.created_at else None,
        })

    activities.sort(key=lambda x: x["created_at"] or "", reverse=True)
    return activities[:limit]


@router.get("/user-stats")
async def get_user_statistics(
    admin: UserModel = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """获取用户统计数据（用于图表展示）"""
    daily_registrations = []
    for i in range(6, -1, -1):
        day = date.today() - timedelta(days=i)
        day_start = datetime.combine(day, datetime.min.time())
        day_end = datetime.combine(day + timedelta(days=1), datetime.min.time())
        count = db.query(func.count(UserModel.id)).filter(
            UserModel.created_at >= day_start,
            UserModel.created_at < day_end
        ).scalar()
        daily_registrations.append({
            "date": day.isoformat(),
            "count": count
        })

    daily_active = []
    for i in range(6, -1, -1):
        day = date.today() - timedelta(days=i)
        day_start = datetime.combine(day, datetime.min.time())
        day_end = datetime.combine(day + timedelta(days=1), datetime.min.time())
        count = db.query(func.count(UserModel.id)).filter(
            UserModel.last_login_at >= day_start,
            UserModel.last_login_at < day_end
        ).scalar()
        daily_active.append({
            "date": day.isoformat(),
            "count": count
        })

    online_count = db.query(UserModel).filter(
        UserModel.last_heartbeat >= datetime.now(timezone.utc) - timedelta(minutes=5),
        UserModel.is_active == True
    ).count()

    model_type_dist = db.query(
        UserORMModel.model_type, func.count(UserORMModel.id)
    ).group_by(UserORMModel.model_type).all()

    return {
        "daily_registrations": daily_registrations,
        "daily_active": daily_active,
        "online_count": online_count,
        "model_type_distribution": [{"type": t, "count": c} for t, c in model_type_dist],
    }
