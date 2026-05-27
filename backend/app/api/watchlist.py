"""
自选股表API

提供自选表的增删改查和股票项管理接口。
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Optional, List

from app.core.database import get_db
from app.auth import get_current_active_user
from app.models.user import User as UserModel
from app.models.watchlist import Watchlist, WatchlistItem

logger = logging.getLogger(__name__)
router = APIRouter()


class CreateWatchlistRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)


class UpdateWatchlistRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)


class AddStockRequest(BaseModel):
    stock_code: str = Field(..., min_length=1, max_length=20)
    stock_name: str = Field(..., min_length=1, max_length=100)


@router.get("")
async def get_watchlists(
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """获取当前用户的所有自选表（含股票列表和数量）

    返回每个自选表对象中嵌入 items 字段（股票列表），
    前端可直接从 list.items 获取股票，无需额外请求。
    """
    from sqlalchemy import func

    watchlists = (
        db.query(Watchlist)
        .filter(Watchlist.user_id == current_user.id)
        .order_by(Watchlist.updated_at.desc())
        .all()
    )

    count_rows = (
        db.query(WatchlistItem.watchlist_id, func.count(WatchlistItem.id).label("cnt"))
        .filter(WatchlistItem.watchlist_id.in_([w.id for w in watchlists]))
        .group_by(WatchlistItem.watchlist_id)
        .all()
    )
    count_map = {row.watchlist_id: row.cnt for row in count_rows}

    item_rows = (
        db.query(WatchlistItem)
        .filter(WatchlistItem.watchlist_id.in_([w.id for w in watchlists]))
        .order_by(WatchlistItem.added_at.desc())
        .all()
    )
    items_map: dict[int, list[dict]] = {}
    for item in item_rows:
        items_map.setdefault(item.watchlist_id, []).append(item.to_dict())

    return [w.to_dict(stock_count=count_map.get(w.id, 0), stocks=items_map.get(w.id, [])) for w in watchlists]


@router.post("")
async def create_watchlist(
    req: CreateWatchlistRequest,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """创建自选表"""
    watchlist = Watchlist(
        user_id=current_user.id,
        name=req.name,
        description=req.description,
    )
    db.add(watchlist)
    db.commit()
    db.refresh(watchlist)
    return watchlist.to_dict(stock_count=0)


@router.put("/{watchlist_id}")
async def update_watchlist(
    watchlist_id: int,
    req: UpdateWatchlistRequest,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """更新自选表名称/描述"""
    watchlist = (
        db.query(Watchlist)
        .filter(Watchlist.id == watchlist_id, Watchlist.user_id == current_user.id)
        .first()
    )
    if not watchlist:
        raise HTTPException(status_code=404, detail="自选表不存在")

    if req.name is not None:
        watchlist.name = req.name
    if req.description is not None:
        watchlist.description = req.description
    db.commit()
    db.refresh(watchlist)

    from sqlalchemy import func
    stock_count = db.query(func.count(WatchlistItem.id)).filter(
        WatchlistItem.watchlist_id == watchlist_id
    ).scalar()
    return watchlist.to_dict(stock_count=stock_count)


@router.delete("/{watchlist_id}")
async def delete_watchlist(
    watchlist_id: int,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """删除自选表（级联删除items）"""
    watchlist = (
        db.query(Watchlist)
        .filter(Watchlist.id == watchlist_id, Watchlist.user_id == current_user.id)
        .first()
    )
    if not watchlist:
        raise HTTPException(status_code=404, detail="自选表不存在")

    db.delete(watchlist)
    db.commit()
    return {"success": True, "message": "自选表已删除"}


@router.post("/{watchlist_id}/stocks")
async def add_stock_to_watchlist(
    watchlist_id: int,
    req: AddStockRequest,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """添加股票到自选表"""
    watchlist = (
        db.query(Watchlist)
        .filter(Watchlist.id == watchlist_id, Watchlist.user_id == current_user.id)
        .first()
    )
    if not watchlist:
        raise HTTPException(status_code=404, detail="自选表不存在")

    existing = (
        db.query(WatchlistItem)
        .filter(
            WatchlistItem.watchlist_id == watchlist_id,
            WatchlistItem.stock_code == req.stock_code,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="该股票已在自选表中")

    item = WatchlistItem(
        watchlist_id=watchlist_id,
        stock_code=req.stock_code,
        stock_name=req.stock_name,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item.to_dict()


@router.delete("/{watchlist_id}/stocks/{stock_code}")
async def remove_stock_from_watchlist(
    watchlist_id: int,
    stock_code: str,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """从自选表移除股票"""
    watchlist = (
        db.query(Watchlist)
        .filter(Watchlist.id == watchlist_id, Watchlist.user_id == current_user.id)
        .first()
    )
    if not watchlist:
        raise HTTPException(status_code=404, detail="自选表不存在")

    item = (
        db.query(WatchlistItem)
        .filter(
            WatchlistItem.watchlist_id == watchlist_id,
            WatchlistItem.stock_code == stock_code,
        )
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="该股票不在自选表中")

    db.delete(item)
    db.commit()
    return {"success": True, "message": "股票已从自选表移除"}


@router.get("/{watchlist_id}/stocks")
async def get_watchlist_stocks(
    watchlist_id: int,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """获取自选表中的所有股票"""
    watchlist = (
        db.query(Watchlist)
        .filter(Watchlist.id == watchlist_id, Watchlist.user_id == current_user.id)
        .first()
    )
    if not watchlist:
        raise HTTPException(status_code=404, detail="自选表不存在")

    items = (
        db.query(WatchlistItem)
        .filter(WatchlistItem.watchlist_id == watchlist_id)
        .order_by(WatchlistItem.added_at.desc())
        .all()
    )
    return [item.to_dict() for item in items]
