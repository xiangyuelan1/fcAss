from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, date, timedelta
from pydantic import BaseModel
from app.core.database import get_db
from app.auth import get_current_active_user
from app.models.user import User as UserModel
from app.models.community import UserPoints, PointTransaction, Achievement, DailyChallengeSubmission, CommunityModel, CommunitySignal, PKChallenge
from app.models.user_model import UserModel as UserORMModel
from app.models.training import TrainingTask
from app.models.stock import Stock
from app.api.community import ensure_user_points, add_points
from sqlalchemy import func, desc
import hashlib

router = APIRouter()


@router.get("/balance")
async def get_my_points(
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    user_points = ensure_user_points(db, current_user.id)
    db.flush()

    recent_transactions = db.query(PointTransaction).filter(
        PointTransaction.user_id == current_user.id,
    ).order_by(desc(PointTransaction.created_at)).limit(10).all()

    return {
        "total_points": user_points.total_points,
        "level": user_points.level,
        "recent_transactions": [t.to_dict() for t in recent_transactions],
    }


@router.get("/transactions")
async def get_transactions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    query = db.query(PointTransaction).filter(
        PointTransaction.user_id == current_user.id,
    ).order_by(desc(PointTransaction.created_at))

    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [t.to_dict() for t in items],
    }


@router.get("/leaderboard")
async def get_points_leaderboard(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = db.query(UserPoints).order_by(desc(UserPoints.total_points))
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()

    result = []
    for p in items:
        user = db.query(UserModel).filter(UserModel.id == p.user_id).first()
        result.append({
            "user_id": p.user_id,
            "username": user.username if user else "unknown",
            "total_points": p.total_points,
            "level": p.level,
        })

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": result,
    }


@router.post("/daily-checkin")
async def daily_checkin(
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    today = date.today()
    today_start = datetime.combine(today, datetime.min.time())
    today_end = datetime.combine(today, datetime.max.time())

    existing = db.query(PointTransaction).filter(
        PointTransaction.user_id == current_user.id,
        PointTransaction.action == "daily_login",
        PointTransaction.created_at >= today_start,
        PointTransaction.created_at <= today_end,
    ).first()

    if existing:
        return {"success": False, "message": "今日已签到", "points": 0}

    add_points(db, current_user.id, "daily_login", 1, description="每日签到")
    db.commit()

    user_points = db.query(UserPoints).filter(UserPoints.user_id == current_user.id).first()
    return {
        "success": True,
        "message": "签到成功",
        "points": 1,
        "total_points": user_points.total_points if user_points else 1,
    }


BADGE_DEFINITIONS = [
    {"badge_type": "first_model", "badge_name": "初出茅庐", "description": "创建第一个模型", "bonus": 5},
    {"badge_type": "first_training", "badge_name": "训练新手", "description": "完成第一次训练", "bonus": 5},
    {"badge_type": "first_publish", "badge_name": "社区新星", "description": "发布第一个社区模型", "bonus": 10},
    {"badge_type": "first_pk", "badge_name": "PK初体验", "description": "参加第一次PK", "bonus": 5},
    {"badge_type": "pk_winner_1", "badge_name": "首战告捷", "description": "PK胜利1次", "bonus": 10},
    {"badge_type": "pk_winner_10", "badge_name": "常胜将军", "description": "PK胜利10次", "bonus": 30},
    {"badge_type": "popular_10", "badge_name": "小有名气", "description": "获得10个点赞", "bonus": 10},
    {"badge_type": "popular_100", "badge_name": "人气之星", "description": "获得100个点赞", "bonus": 30},
    {"badge_type": "signal_master", "badge_name": "信号大师", "description": "发布50个预测信号", "bonus": 20},
    {"badge_type": "daily_7", "badge_name": "坚持一周", "description": "连续签到7天", "bonus": 10},
    {"badge_type": "daily_30", "badge_name": "月度达人", "description": "连续签到30天", "bonus": 30},
    {"badge_type": "points_100", "badge_name": "小有积蓄", "description": "积分达到100", "bonus": 10},
    {"badge_type": "points_1000", "badge_name": "财富自由", "description": "积分达到1000", "bonus": 50},
]


@router.get("/achievements")
async def get_my_achievements(
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    achievements = db.query(Achievement).filter(
        Achievement.user_id == current_user.id
    ).order_by(desc(Achievement.earned_at)).all()
    return [a.to_dict() for a in achievements]


@router.get("/achievements/all")
async def get_all_achievements(
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    earned = db.query(Achievement).filter(
        Achievement.user_id == current_user.id
    ).all()
    earned_map = {a.badge_type: a for a in earned}

    result = []
    for badge in BADGE_DEFINITIONS:
        entry = {
            "badge_type": badge["badge_type"],
            "badge_name": badge["badge_name"],
            "description": badge["description"],
            "bonus": badge["bonus"],
            "earned": badge["badge_type"] in earned_map,
        }
        if badge["badge_type"] in earned_map:
            entry["earned_at"] = earned_map[badge["badge_type"]].earned_at.strftime("%Y-%m-%d %H:%M:%S") if earned_map[badge["badge_type"]].earned_at else None
        result.append(entry)
    return result


@router.post("/check-achievements")
async def check_achievements(
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    earned = db.query(Achievement).filter(
        Achievement.user_id == current_user.id
    ).all()
    earned_types = {a.badge_type for a in earned}

    model_count = db.query(func.count(UserORMModel.id)).filter(UserORMModel.user_id == current_user.id).scalar()
    trained_count = db.query(func.count(TrainingTask.id)).join(
        UserORMModel, TrainingTask.model_id == UserORMModel.id
    ).filter(
        UserORMModel.user_id == current_user.id,
        TrainingTask.status == 'completed'
    ).scalar()
    publish_count = db.query(func.count(CommunityModel.id)).filter(
        CommunityModel.user_id == current_user.id
    ).scalar()
    pk_count = db.query(func.count(PKChallenge.id)).filter(
        (PKChallenge.challenger_id == current_user.id) | (PKChallenge.defender_id == current_user.id)
    ).scalar()
    pk_wins = db.query(func.count(PKChallenge.id)).filter(
        PKChallenge.winner_id == current_user.id
    ).scalar()
    total_likes = db.query(func.sum(CommunityModel.likes_count)).filter(
        CommunityModel.user_id == current_user.id
    ).scalar() or 0
    signal_count = db.query(func.count(CommunitySignal.id)).filter(
        CommunitySignal.user_id == current_user.id
    ).scalar()

    checkin_days = 0
    check_date = date.today()
    while True:
        check_start = datetime.combine(check_date, datetime.min.time())
        check_end = datetime.combine(check_date, datetime.max.time())
        exists = db.query(PointTransaction).filter(
            PointTransaction.user_id == current_user.id,
            PointTransaction.action == "daily_login",
            PointTransaction.created_at >= check_start,
            PointTransaction.created_at <= check_end,
        ).first()
        if exists:
            checkin_days += 1
            check_date -= timedelta(days=1)
        else:
            break

    user_points = db.query(UserPoints).filter(UserPoints.user_id == current_user.id).first()
    total_points = user_points.total_points if user_points else 0

    conditions = {
        "first_model": model_count >= 1,
        "first_training": trained_count >= 1,
        "first_publish": publish_count >= 1,
        "first_pk": pk_count >= 1,
        "pk_winner_1": pk_wins >= 1,
        "pk_winner_10": pk_wins >= 10,
        "popular_10": total_likes >= 10,
        "popular_100": total_likes >= 100,
        "signal_master": signal_count >= 50,
        "daily_7": checkin_days >= 7,
        "daily_30": checkin_days >= 30,
        "points_100": total_points >= 100,
        "points_1000": total_points >= 1000,
    }

    new_achievements = []
    for badge in BADGE_DEFINITIONS:
        badge_type = badge["badge_type"]
        if badge_type not in earned_types and conditions.get(badge_type, False):
            achievement = Achievement(
                user_id=current_user.id,
                badge_type=badge_type,
                badge_name=badge["badge_name"],
                description=badge["description"],
            )
            db.add(achievement)
            db.flush()
            add_points(db, current_user.id, "achievement_bonus", badge["bonus"],
                       target_type="achievement", target_id=achievement.id,
                       description=f"获得成就「{badge['badge_name']}」")
            new_achievements.append(achievement.to_dict())

    if new_achievements:
        db.commit()
    else:
        db.rollback()

    return {
        "success": True,
        "new_achievements": new_achievements,
        "total_earned": len(earned_types) + len(new_achievements),
    }


@router.get("/daily-challenge")
async def get_daily_challenge(
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    today_str = date.today().isoformat()
    seed = int(hashlib.md5(today_str.encode()).hexdigest()[:8], 16)
    stocks = db.query(Stock).all()
    if not stocks:
        return {"challenge_date": today_str, "stock_code": None, "stock_name": None, "completed": False}

    chosen = stocks[seed % len(stocks)]

    submission = db.query(DailyChallengeSubmission).filter(
        DailyChallengeSubmission.user_id == current_user.id,
        DailyChallengeSubmission.challenge_date == today_str,
    ).first()

    return {
        "challenge_date": today_str,
        "stock_code": chosen.code,
        "stock_name": chosen.name,
        "completed": submission is not None,
        "direction": submission.direction if submission else None,
        "confidence": float(submission.confidence) if submission and submission.confidence else None,
    }


class DailyChallengeSubmitRequest(BaseModel):
    direction: str
    confidence: float = 0.5


@router.post("/daily-challenge/submit")
async def submit_daily_challenge(
    request: DailyChallengeSubmitRequest,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    if request.direction not in ("up", "down", "flat"):
        raise HTTPException(status_code=400, detail="direction 必须为 up/down/flat")

    today_str = date.today().isoformat()

    existing = db.query(DailyChallengeSubmission).filter(
        DailyChallengeSubmission.user_id == current_user.id,
        DailyChallengeSubmission.challenge_date == today_str,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="今日挑战已提交")

    seed = int(hashlib.md5(today_str.encode()).hexdigest()[:8], 16)
    stocks = db.query(Stock).all()
    if not stocks:
        raise HTTPException(status_code=400, detail="暂无可用股票数据")
    chosen = stocks[seed % len(stocks)]

    submission = DailyChallengeSubmission(
        user_id=current_user.id,
        challenge_date=today_str,
        stock_code=chosen.code,
        direction=request.direction,
        confidence=request.confidence,
    )
    db.add(submission)
    add_points(db, current_user.id, "daily_challenge", 5,
               target_type="daily_challenge", description="完成每日挑战")
    db.commit()

    return {
        "success": True,
        "message": "挑战提交成功，次日自动评估",
        "points": 5,
    }
