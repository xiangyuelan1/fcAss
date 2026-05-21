"""
模拟盘（Paper Trading）API

提供基于模型预测的虚拟交易环境，用户可启动模拟盘验证模型在"实盘"中的表现。
当前为第一阶段：启动模拟盘 + 查询状态框架，后续将接入每日自动交易逻辑。
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.auth import get_current_user
from app.models.user_model import UserModel
from datetime import datetime

router = APIRouter(prefix="/paper-trading", tags=["模拟盘"])


class PaperTradingStartRequest(BaseModel):
    """启动模拟盘请求体"""
    model_id: int
    initial_capital: float = 100000.0
    stock_codes: list[str] = []


@router.post("/start")
async def start_paper_trading(
    request: PaperTradingStartRequest,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """启动模拟盘：验证模型存在且已完成训练后，创建模拟盘会话"""
    model = db.query(UserModel).filter(
        UserModel.id == request.model_id,
        UserModel.user_id == current_user.id,
        UserModel.status == "completed",
    ).first()
    if not model:
        raise HTTPException(404, "模型不存在或未完成训练")

    return {
        "status": "running",
        "model_id": request.model_id,
        "initial_capital": request.initial_capital,
        "stock_codes": request.stock_codes,
        "started_at": datetime.now().isoformat(),
        "message": "模拟盘已启动，系统将每日自动执行预测和虚拟交易",
    }


@router.get("/status/{model_id}")
async def get_paper_trading_status(
    model_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取模拟盘状态"""
    return {
        "model_id": model_id,
        "status": "running",
        "current_capital": 100000.0,
        "total_return": 0.0,
        "positions": [],
        "trades": [],
        "message": "模拟盘功能开发中，敬请期待",
    }
