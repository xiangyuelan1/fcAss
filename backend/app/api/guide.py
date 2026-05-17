"""
用户引导API
提供新手引导状态查询与完成标记接口
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.database import get_db
from app.auth import get_current_active_user
from app.models.user import User as UserModel
from app.models.user_model import UserModel as UserTableModel
from app.models.training import TrainingTask
from app.models.stock import Stock

router = APIRouter()


@router.get("/state")
async def get_guide_state(
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """获取用户引导状态，基于用户实际数据判断各步骤完成情况"""
    model_count = db.query(func.count(UserTableModel.id)).filter(
        UserTableModel.user_id == current_user.id
    ).scalar()
    stock_count = db.query(func.count(Stock.id)).scalar()
    trained_count = db.query(func.count(TrainingTask.id)).join(
        UserTableModel, TrainingTask.model_id == UserTableModel.id
    ).filter(
        UserTableModel.user_id == current_user.id,
        TrainingTask.status == 'completed',
    ).scalar()

    onboarding_completed = model_count > 0

    current_step = 0
    if stock_count > 0:
        current_step = 1
    if model_count > 0:
        current_step = 2
    if trained_count > 0:
        current_step = 3

    return {
        "onboarding_completed": onboarding_completed,
        "current_step": current_step,
        "has_data": stock_count > 0,
        "has_models": model_count > 0,
        "has_trained": trained_count > 0,
    }


@router.post("/complete")
async def complete_onboarding(
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """标记用户引导流程已完成（前端 localStorage 同步标记）"""
    return {"success": True, "message": "引导流程已完成"}
