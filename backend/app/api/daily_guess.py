"""
每日一猜 API 路由

核心流程：
1. today 端点被调用时，自动为当天生成一只猜测股票（如尚未生成）
2. 同时尝试补全昨日记录的 actual_close（盘后自动更新）
3. 用户在 15:00 前可投票看涨/看跌，每人每天仅一次
4. history 端点返回最近 7 天记录，含投票统计与结果
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from pydantic import BaseModel
from datetime import date, datetime, timedelta
import random
import logging

from app.core.database import get_db
from app.auth import get_current_active_user
from app.models.user import User as UserModel
from app.models.stock import Stock, StockPrice
from app.models.daily_guess import DailyGuessStock, DailyGuessVote
from app.utils.data_fetcher import DataFetcher

logger = logging.getLogger(__name__)
router = APIRouter()


def _pick_stock_for_today(db: Session, today: date) -> DailyGuessStock:
    """为今天选取一只猜测股票：优先选有价格数据的股票，随机选取"""
    existing = db.query(DailyGuessStock).filter(DailyGuessStock.date == today).first()
    if existing:
        return existing

    # 优先从有价格数据的股票中选取
    stocks_with_prices = (
        db.query(Stock.code, Stock.name)
        .join(StockPrice, Stock.code == StockPrice.stock_code)
        .group_by(Stock.code, Stock.name)
        .having(func.count(StockPrice.id) > 0)
        .all()
    )

    if not stocks_with_prices:
        # 退而求其次，从 stocks 表中选
        all_stocks = db.query(Stock.code, Stock.name).all()
        if not all_stocks:
            raise HTTPException(status_code=400, detail="暂无可用股票，请先获取股票数据")
        stocks_with_prices = all_stocks

    # 使用日期作为种子保证同一天选同一只
    seed = today.toordinal()
    rng = random.Random(seed)
    chosen = rng.choice(stocks_with_prices)

    # 获取前一日收盘价作为参考价
    reference_close = _get_previous_close(db, chosen.code, today)

    guess_stock = DailyGuessStock(
        date=today,
        stock_code=chosen.code,
        stock_name=chosen.name,
        reference_close=reference_close,
    )
    db.add(guess_stock)
    db.commit()
    db.refresh(guess_stock)
    return guess_stock


def _get_previous_close(db: Session, stock_code: str, target_date: date) -> float | None:
    """从本地数据库获取 target_date 之前最近一个交易日的收盘价"""
    latest_price = (
        db.query(StockPrice)
        .filter(StockPrice.stock_code == stock_code, StockPrice.date < target_date)
        .order_by(desc(StockPrice.date))
        .first()
    )
    if latest_price and latest_price.close:
        return float(latest_price.close)
    return None


def _try_update_actual_close(db: Session, guess_stock: DailyGuessStock) -> None:
    """尝试从数据源获取并更新实际收盘价（盘后调用）"""
    if guess_stock.actual_close is not None:
        return

    target_date = guess_stock.date
    # 只在目标日期当天 15:00 之后或之后的日期才尝试更新
    now = datetime.now()
    target_datetime = datetime.combine(target_date, datetime.min.time())
    if now < target_datetime.replace(hour=15, minute=0):
        return

    # 先查本地数据库
    price = (
        db.query(StockPrice)
        .filter(StockPrice.stock_code == guess_stock.stock_code, StockPrice.date == target_date)
        .first()
    )

    if price and price.close:
        guess_stock.actual_close = price.close
        if price.change_pct is not None:
            guess_stock.actual_change_pct = price.change_pct
        elif guess_stock.reference_close and float(guess_stock.reference_close) > 0:
            guess_stock.actual_change_pct = round(
                (float(price.close) - float(guess_stock.reference_close))
                / float(guess_stock.reference_close) * 100, 4
            )
        db.commit()
        return

    # 本地没有则尝试从外部数据源获取
    try:
        date_str = target_date.strftime("%Y-%m-%d")
        df = DataFetcher.get_stock_hist(
            guess_stock.stock_code,
            start_date=date_str,
            end_date=date_str,
        )
        if df is not None and not df.empty:
            row = df.iloc[-1]
            close_val = float(row["close"]) if row.get("close") else None
            if close_val:
                guess_stock.actual_close = close_val
                if guess_stock.reference_close and float(guess_stock.reference_close) > 0:
                    guess_stock.actual_change_pct = round(
                        (close_val - float(guess_stock.reference_close))
                        / float(guess_stock.reference_close) * 100, 4
                    )
                db.commit()
                logger.info(f"每日一猜: 从数据源更新 {guess_stock.stock_code} {date_str} 收盘价={close_val}")
    except Exception as e:
        logger.warning(f"每日一猜: 获取 {guess_stock.stock_code} {target_date} 收盘价失败: {e}")


@router.get("/today")
async def get_today_guess(
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """获取今日一猜信息（股票、投票统计、用户是否已投票、昨日结果）"""
    today = date.today()

    # 尝试补全昨日的 actual_close
    yesterday = today - timedelta(days=1)
    yesterday_guess = db.query(DailyGuessStock).filter(DailyGuessStock.date == yesterday).first()
    if yesterday_guess:
        _try_update_actual_close(db, yesterday_guess)

    # 确保今天有猜测股票
    guess_stock = _pick_stock_for_today(db, today)

    # 投票统计
    up_count = db.query(func.count(DailyGuessVote.id)).filter(
        DailyGuessVote.guess_date == today,
        DailyGuessVote.direction == "up",
    ).scalar() or 0

    down_count = db.query(func.count(DailyGuessVote.id)).filter(
        DailyGuessVote.guess_date == today,
        DailyGuessVote.direction == "down",
    ).scalar() or 0

    total_votes = up_count + down_count

    # 当前用户是否已投票
    my_vote = db.query(DailyGuessVote).filter(
        DailyGuessVote.user_id == current_user.id,
        DailyGuessVote.guess_date == today,
    ).first()

    # 昨日结果
    yesterday_result = None
    if yesterday_guess:
        yesterday_up = db.query(func.count(DailyGuessVote.id)).filter(
            DailyGuessVote.guess_date == yesterday,
            DailyGuessVote.direction == "up",
        ).scalar() or 0
        yesterday_down = db.query(func.count(DailyGuessVote.id)).filter(
            DailyGuessVote.guess_date == yesterday,
            DailyGuessVote.direction == "down",
        ).scalar() or 0

        actual_direction = None
        if yesterday_guess.actual_change_pct is not None:
            actual_direction = "up" if float(yesterday_guess.actual_change_pct) >= 0 else "down"

        my_yesterday_vote = db.query(DailyGuessVote).filter(
            DailyGuessVote.user_id == current_user.id,
            DailyGuessVote.guess_date == yesterday,
        ).first()

        yesterday_result = {
            "stock_code": yesterday_guess.stock_code,
            "stock_name": yesterday_guess.stock_name,
            "reference_close": float(yesterday_guess.reference_close) if yesterday_guess.reference_close else None,
            "actual_close": float(yesterday_guess.actual_close) if yesterday_guess.actual_close else None,
            "actual_change_pct": float(yesterday_guess.actual_change_pct) if yesterday_guess.actual_change_pct else None,
            "actual_direction": actual_direction,
            "up_count": yesterday_up,
            "down_count": yesterday_down,
            "my_direction": my_yesterday_vote.direction if my_yesterday_vote else None,
            "my_correct": (
                my_yesterday_vote.direction == actual_direction
                if my_yesterday_vote and actual_direction
                else None
            ),
        }

    return {
        "date": today.isoformat(),
        "stock_code": guess_stock.stock_code,
        "stock_name": guess_stock.stock_name,
        "reference_close": float(guess_stock.reference_close) if guess_stock.reference_close else None,
        "actual_close": float(guess_stock.actual_close) if guess_stock.actual_close else None,
        "actual_change_pct": float(guess_stock.actual_change_pct) if guess_stock.actual_change_pct else None,
        "up_count": up_count,
        "down_count": down_count,
        "total_votes": total_votes,
        "my_vote": my_vote.direction if my_vote else None,
        "yesterday_result": yesterday_result,
    }


class VoteRequest(BaseModel):
    direction: str


@router.post("/vote")
async def vote_daily_guess(
    request: VoteRequest,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """投票：direction 为 'up' 或 'down'，每人每天只能投一次，15:00 前可投票"""
    if request.direction not in ("up", "down"):
        raise HTTPException(status_code=400, detail="direction 必须为 up 或 down")

    today = date.today()

    # 检查是否在交易时间内（15:00 前可投票）
    now = datetime.now()
    if now.date() > today:
        raise HTTPException(status_code=400, detail="今日投票已截止")
    if now.date() == today and now.hour >= 15:
        raise HTTPException(status_code=400, detail="今日投票已截止（15:00 后不可投票）")

    # 检查是否已投过票
    existing = db.query(DailyGuessVote).filter(
        DailyGuessVote.user_id == current_user.id,
        DailyGuessVote.guess_date == today,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="今日已投票，每人每天只能投一次")

    # 确保今天有猜测股票
    guess_stock = _pick_stock_for_today(db, today)

    vote = DailyGuessVote(
        user_id=current_user.id,
        guess_date=today,
        direction=request.direction,
    )
    db.add(vote)
    db.commit()

    # 返回更新后的投票统计
    up_count = db.query(func.count(DailyGuessVote.id)).filter(
        DailyGuessVote.guess_date == today,
        DailyGuessVote.direction == "up",
    ).scalar() or 0

    down_count = db.query(func.count(DailyGuessVote.id)).filter(
        DailyGuessVote.guess_date == today,
        DailyGuessVote.direction == "down",
    ).scalar() or 0

    return {
        "success": True,
        "direction": request.direction,
        "up_count": up_count,
        "down_count": down_count,
        "total_votes": up_count + down_count,
    }


@router.get("/history")
async def get_guess_history(
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """获取最近 7 天的历史记录（含结果和用户是否猜对）"""
    today = date.today()
    seven_days_ago = today - timedelta(days=7)

    guess_stocks = (
        db.query(DailyGuessStock)
        .filter(DailyGuessStock.date >= seven_days_ago, DailyGuessStock.date < today)
        .order_by(desc(DailyGuessStock.date))
        .all()
    )

    result = []
    for gs in guess_stocks:
        # 尝试更新 actual_close
        _try_update_actual_close(db, gs)

        up_count = db.query(func.count(DailyGuessVote.id)).filter(
            DailyGuessVote.guess_date == gs.date,
            DailyGuessVote.direction == "up",
        ).scalar() or 0

        down_count = db.query(func.count(DailyGuessVote.id)).filter(
            DailyGuessVote.guess_date == gs.date,
            DailyGuessVote.direction == "down",
        ).scalar() or 0

        actual_direction = None
        if gs.actual_change_pct is not None:
            actual_direction = "up" if float(gs.actual_change_pct) >= 0 else "down"

        my_vote = db.query(DailyGuessVote).filter(
            DailyGuessVote.user_id == current_user.id,
            DailyGuessVote.guess_date == gs.date,
        ).first()

        result.append({
            "date": gs.date.isoformat(),
            "stock_code": gs.stock_code,
            "stock_name": gs.stock_name,
            "reference_close": float(gs.reference_close) if gs.reference_close else None,
            "actual_close": float(gs.actual_close) if gs.actual_close else None,
            "actual_change_pct": float(gs.actual_change_pct) if gs.actual_change_pct else None,
            "actual_direction": actual_direction,
            "up_count": up_count,
            "down_count": down_count,
            "total_votes": up_count + down_count,
            "my_direction": my_vote.direction if my_vote else None,
            "my_correct": (
                my_vote.direction == actual_direction
                if my_vote and actual_direction
                else None
            ),
        })

    return {"items": result}
