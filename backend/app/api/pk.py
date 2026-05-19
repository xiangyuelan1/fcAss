from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime, timedelta
from app.core.database import get_db
from app.auth import get_current_active_user
from app.models.user import User as UserModel
from app.models.community import PKChallenge, CommunityModel, UserPoints, PointTransaction
from app.models.user_model import UserModel as UserORMModel
from app.models.stock import Stock, StockPrice
import random
from app.models.training import TrainingTask
from app.api.community import ensure_user_points, add_points
from sqlalchemy import func, desc

router = APIRouter()


class CreateChallengeRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    challenger_model_id: int
    stock_code: str
    pk_mode: str
    defender_model_id: Optional[int] = None
    pk_config: Optional[dict] = None


class AcceptChallengeRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    defender_model_id: int


@router.post("/challenges")
async def create_challenge(
    request: CreateChallengeRequest,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    challenger_model = db.query(CommunityModel).filter(
        CommunityModel.id == request.challenger_model_id,
        CommunityModel.is_active == True,
    ).first()
    if not challenger_model:
        raise HTTPException(status_code=404, detail="挑战方模型不存在")

    if challenger_model.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="只能使用自己的模型发起挑战")

    valid_modes = ("direction", "multi_price", "trend_5d", "custom")
    if request.pk_mode not in valid_modes:
        raise HTTPException(status_code=400, detail=f"pk_mode 必须为 {'/'.join(valid_modes)}")

    if not request.stock_code or request.stock_code == "random":
        stocks_with_prices = (
            db.query(Stock.code, Stock.name)
            .join(StockPrice, Stock.code == StockPrice.stock_code)
            .group_by(Stock.code, Stock.name)
            .having(func.count(StockPrice.id) > 20)
            .all()
        )
        if not stocks_with_prices:
            raise HTTPException(status_code=400, detail="暂无可用股票进行PK")
        chosen = random.choice(stocks_with_prices)
        request.stock_code = chosen.code

    prediction_date = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")

    defender_id = None
    status = "open"

    if request.defender_model_id:
        defender_model = db.query(CommunityModel).filter(
            CommunityModel.id == request.defender_model_id,
            CommunityModel.is_active == True,
        ).first()
        if not defender_model:
            raise HTTPException(status_code=404, detail="防守方模型不存在")
        defender_id = defender_model.user_id
        status = "accepted"

    challenge = PKChallenge(
        challenger_id=current_user.id,
        challenger_model_id=request.challenger_model_id,
        defender_id=defender_id,
        defender_model_id=request.defender_model_id,
        stock_code=request.stock_code,
        pk_mode=request.pk_mode,
        pk_config=request.pk_config or {},
        prediction_date=prediction_date,
        status=status,
    )
    db.add(challenge)
    db.commit()
    db.refresh(challenge)
    return challenge.to_dict()


@router.get("/challenges")
async def get_challenges(
    status: Optional[str] = None,
    pk_mode: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = db.query(PKChallenge)

    if status:
        query = query.filter(PKChallenge.status == status)
    if pk_mode:
        query = query.filter(PKChallenge.pk_mode == pk_mode)

    query = query.order_by(desc(PKChallenge.created_at))
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()

    result = []
    for c in items:
        d = c.to_dict()
        challenger = db.query(UserModel).filter(UserModel.id == c.challenger_id).first()
        d["challenger"] = {"id": challenger.id, "username": challenger.username} if challenger else None
        if c.defender_id:
            defender = db.query(UserModel).filter(UserModel.id == c.defender_id).first()
            d["defender"] = {"id": defender.id, "username": defender.username} if defender else None
        result.append(d)

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": result,
    }


@router.post("/challenges/{challenge_id}/accept")
async def accept_challenge(
    challenge_id: int,
    request: AcceptChallengeRequest,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    challenge = db.query(PKChallenge).filter(PKChallenge.id == challenge_id).first()
    if not challenge:
        raise HTTPException(status_code=404, detail="PK挑战不存在")
    if challenge.status != "open":
        raise HTTPException(status_code=400, detail="该挑战不可应战")
    if challenge.challenger_id == current_user.id:
        raise HTTPException(status_code=400, detail="不能应战自己发起的挑战")

    defender_model = db.query(CommunityModel).filter(
        CommunityModel.id == request.defender_model_id,
        CommunityModel.is_active == True,
    ).first()
    if not defender_model:
        raise HTTPException(status_code=404, detail="防守方模型不存在")
    if defender_model.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="只能使用自己的模型应战")

    challenge.defender_id = current_user.id
    challenge.defender_model_id = request.defender_model_id
    challenge.status = "accepted"
    db.commit()
    db.refresh(challenge)
    return challenge.to_dict()


@router.post("/challenges/{challenge_id}/evaluate")
async def evaluate_challenge(
    challenge_id: int,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    challenge = db.query(PKChallenge).filter(PKChallenge.id == challenge_id).first()
    if not challenge:
        raise HTTPException(status_code=404, detail="PK挑战不存在")
    if challenge.status != "accepted":
        raise HTTPException(status_code=400, detail="只有已接受的挑战才能评估")

    actual_price = db.query(StockPrice).filter(
        StockPrice.stock_code == challenge.stock_code,
        StockPrice.date == challenge.prediction_date,
    ).first()
    if not actual_price:
        raise HTTPException(status_code=400, detail="预测日期的实际行情数据尚未生成，无法评估")

    challenger_result = _evaluate_model(db, challenge.challenger_model_id, challenge.stock_code,
                                        challenge.prediction_date, actual_price, challenge.pk_mode)
    defender_result = _evaluate_model(db, challenge.defender_model_id, challenge.stock_code,
                                      challenge.prediction_date, actual_price, challenge.pk_mode)

    winner_id = _determine_winner(challenger_result, defender_result, challenge.pk_mode,
                                  challenge.challenger_id, challenge.defender_id)

    challenge.challenger_result = challenger_result
    challenge.defender_result = defender_result
    challenge.winner_id = winner_id
    challenge.status = "completed"
    challenge.evaluated_at = datetime.now()

    if winner_id is None:
        add_points(db, challenge.challenger_id, "pk_draw", 4,
                   target_type="pk_challenge", target_id=challenge.id,
                   description="PK平局")
        add_points(db, challenge.defender_id, "pk_draw", 4,
                   target_type="pk_challenge", target_id=challenge.id,
                   description="PK平局")
    else:
        loser_id = challenge.defender_id if winner_id == challenge.challenger_id else challenge.challenger_id
        add_points(db, winner_id, "pk_win", 8,
                   target_type="pk_challenge", target_id=challenge.id,
                   description="PK获胜")
        add_points(db, loser_id, "pk_lose", 1,
                   target_type="pk_challenge", target_id=challenge.id,
                   description="PK失败")

    db.commit()
    db.refresh(challenge)
    return challenge.to_dict()


@router.get("/challenges/{challenge_id}")
async def get_challenge_detail(
    challenge_id: int,
    db: Session = Depends(get_db),
):
    challenge = db.query(PKChallenge).filter(PKChallenge.id == challenge_id).first()
    if not challenge:
        raise HTTPException(status_code=404, detail="PK挑战不存在")

    d = challenge.to_dict()
    challenger = db.query(UserModel).filter(UserModel.id == challenge.challenger_id).first()
    d["challenger"] = {"id": challenger.id, "username": challenger.username} if challenger else None
    if challenge.defender_id:
        defender = db.query(UserModel).filter(UserModel.id == challenge.defender_id).first()
        d["defender"] = {"id": defender.id, "username": defender.username} if defender else None
    return d


@router.get("/leaderboard")
async def get_pk_leaderboard(
    type: Optional[str] = "points",
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    if type == "pk_accuracy":
        completed = db.query(PKChallenge).filter(PKChallenge.status == "completed").all()
        stats = {}
        for c in completed:
            for uid in (c.challenger_id, c.defender_id):
                if uid not in stats:
                    stats[uid] = {"wins": 0, "total": 0}
            stats[c.challenger_id]["total"] += 1
            stats[c.defender_id]["total"] += 1
            if c.winner_id:
                stats[c.winner_id]["wins"] += 1

        rows = []
        for uid, s in stats.items():
            user = db.query(UserModel).filter(UserModel.id == uid).first()
            accuracy = s["wins"] / s["total"] if s["total"] > 0 else 0
            rows.append({
                "user_id": uid,
                "username": user.username if user else "unknown",
                "wins": s["wins"],
                "total": s["total"],
                "accuracy": round(accuracy, 4),
            })
        rows.sort(key=lambda x: x["accuracy"], reverse=True)

    elif type == "wins":
        completed = db.query(PKChallenge).filter(PKChallenge.status == "completed").all()
        win_count = {}
        for c in completed:
            if c.winner_id:
                win_count[c.winner_id] = win_count.get(c.winner_id, 0) + 1

        rows = []
        for uid, wins in win_count.items():
            user = db.query(UserModel).filter(UserModel.id == uid).first()
            rows.append({
                "user_id": uid,
                "username": user.username if user else "unknown",
                "wins": wins,
            })
        rows.sort(key=lambda x: x["wins"], reverse=True)

    else:
        points_list = db.query(UserPoints).order_by(desc(UserPoints.total_points)).all()
        rows = []
        for p in points_list:
            user = db.query(UserModel).filter(UserModel.id == p.user_id).first()
            rows.append({
                "user_id": p.user_id,
                "username": user.username if user else "unknown",
                "total_points": p.total_points,
                "level": p.level,
            })

    total = len(rows)
    start = (page - 1) * page_size
    end = start + page_size
    page_items = rows[start:end]

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": page_items,
    }


def _evaluate_model(db: Session, community_model_id: int, stock_code: str,
                    prediction_date: str, actual_price, pk_mode: str) -> dict:
    community_model = db.query(CommunityModel).filter(CommunityModel.id == community_model_id).first()
    if not community_model:
        return {"error": "模型不存在"}

    source_model = db.query(UserORMModel).filter(UserORMModel.id == community_model.source_model_id).first()
    if not source_model:
        return {"error": "源模型不存在"}

    latest_task = db.query(TrainingTask).filter(
        TrainingTask.model_id == source_model.id,
        TrainingTask.status == 'completed',
    ).order_by(desc(TrainingTask.created_at)).first()

    result = {
        "model_id": community_model_id,
        "model_name": community_model.name,
        "has_trained_model": latest_task is not None,
    }

    actual_close = float(actual_price.close) if actual_price.close else None
    actual_open = float(actual_price.open) if actual_price.open else None
    actual_high = float(actual_price.high) if actual_price.high else None
    actual_low = float(actual_price.low) if actual_price.low else None

    if pk_mode == "direction":
        prev_price = db.query(StockPrice).filter(
            StockPrice.stock_code == stock_code,
            StockPrice.date < prediction_date,
        ).order_by(desc(StockPrice.date)).first()
        if prev_price and prev_price.close and actual_close:
            actual_direction = "up" if actual_close > float(prev_price.close) else "down"
            result["actual_direction"] = actual_direction
            result["actual_close"] = actual_close
        else:
            result["error"] = "无法获取前一日收盘价"

    elif pk_mode == "multi_price":
        result["actual_open"] = actual_open
        result["actual_close"] = actual_close
        result["actual_high"] = actual_high
        result["actual_low"] = actual_low

    elif pk_mode == "trend_5d":
        prices = db.query(StockPrice).filter(
            StockPrice.stock_code == stock_code,
            StockPrice.date <= prediction_date,
        ).order_by(desc(StockPrice.date)).limit(6).all()
        if len(prices) >= 2:
            latest = float(prices[0].close) if prices[0].close else None
            earliest = float(prices[-1].close) if prices[-1].close else None
            if latest and earliest:
                trend = (latest - earliest) / earliest
                result["actual_trend_5d"] = round(trend, 6)
                result["actual_direction"] = "up" if trend > 0 else "down"
        else:
            result["error"] = "数据不足以计算5日趋势"

    return result


def _determine_winner(challenger_result: dict, defender_result: dict,
                      pk_mode: str, challenger_id: int, defender_id: int) -> Optional[int]:
    if "error" in challenger_result and "error" in defender_result:
        return None
    if "error" in challenger_result:
        return defender_id
    if "error" in defender_result:
        return challenger_id

    if pk_mode == "direction":
        c_correct = challenger_result.get("actual_direction") is not None
        d_correct = defender_result.get("actual_direction") is not None
        if c_correct and not d_correct:
            return challenger_id
        if d_correct and not c_correct:
            return defender_id
        return None

    elif pk_mode == "multi_price":
        c_mae = _calc_multi_price_mae(challenger_result)
        d_mae = _calc_multi_price_mae(defender_result)
        if c_mae is None and d_mae is None:
            return None
        if c_mae is None:
            return defender_id
        if d_mae is None:
            return challenger_id
        if abs(c_mae - d_mae) < 1e-6:
            return None
        return challenger_id if c_mae < d_mae else defender_id

    elif pk_mode == "trend_5d":
        c_dir = challenger_result.get("actual_direction")
        d_dir = defender_result.get("actual_direction")
        if c_dir == d_dir:
            return None
        return challenger_id if c_dir == "up" else defender_id

    return None


def _calc_multi_price_mae(result: dict) -> Optional[float]:
    keys = ["actual_open", "actual_close", "actual_high", "actual_low"]
    values = [result.get(k) for k in keys]
    if any(v is None for v in values):
        return None
    return sum(abs(v) for v in values) / len(values)
