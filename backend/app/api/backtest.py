"""
回测分析API
"""
import json
import queue
import threading
import logging
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict
from fastapi.responses import StreamingResponse

from app.core.database import get_db, SessionLocal
from app.services.backtest_service import BacktestService
from app.models.training import BacktestResult as BacktestORM
from app.models.training import TrainingTask
from app.models.user_model import UserModel as UserTableModel
from app.auth import get_current_active_user
from app.models.user import User as UserModel
from sqlalchemy import func

router = APIRouter()
logger = logging.getLogger(__name__)


def _verify_backtest_ownership(result: BacktestORM, current_user: UserModel):
    """验证回测结果是否属于当前用户，管理员可访问所有结果"""
    if current_user.is_admin:
        return
    task = result.training_task
    if task is None or task.user_model is None or task.user_model.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权访问该回测结果")


def _verify_task_ownership(task: TrainingTask, current_user: UserModel):
    """验证训练任务是否属于当前用户，管理员可访问所有任务"""
    if current_user.is_admin:
        return
    if task.user_model is None or task.user_model.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权访问该训练任务")


# ============ 请求/响应模型 ============

class RunBacktestRequest(BaseModel):
    task_id: int = Field(..., description="训练任务ID")
    start_date: str = Field(..., description="回测开始日期 (YYYY-MM-DD)")
    end_date: str = Field(..., description="回测结束日期 (YYYY-MM-DD)")
    initial_capital: float = Field(default=100000, description="初始资金")
    commission_rate: float = Field(default=0.0003, description="手续费率")
    slippage: float = Field(default=0.001, description="滑点")
    position_size: float = Field(default=1.0, description="仓位比例 (0-1)")
    stop_loss: Optional[float] = Field(None, description="止损比例")
    take_profit: Optional[float] = Field(None, description="止盈比例")
    stock_codes: Optional[List[str]] = Field(None, description="回测股票列表（不填则使用训练股票）")


class BacktestResponse(BaseModel):
    id: int
    task_id: int
    start_date: str
    end_date: str
    initial_capital: float
    final_capital: Optional[float]
    total_return: Optional[float]
    annual_return: Optional[float]
    max_drawdown: Optional[float]
    sharpe_ratio: Optional[float]
    trades_count: Optional[int]
    created_at: str


class BacktestDetailResponse(BacktestResponse):
    sortino_ratio: Optional[float]
    calmar_ratio: Optional[float]
    win_count: Optional[int]
    loss_count: Optional[int]
    win_rate: Optional[float]
    avg_profit: Optional[float]
    avg_loss: Optional[float]
    profit_factor: Optional[float]
    max_drawdown_duration: Optional[int]


class PaginatedBacktestResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    items: List[BacktestResponse]
    total: int
    page: int
    page_size: int


# ============ API端点 ============

@router.post("/run", response_model=BacktestResponse)
async def run_backtest(
    request: RunBacktestRequest,
    background_tasks: BackgroundTasks,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """执行回测，需验证训练任务属于当前用户"""
    # 验证训练任务属于当前用户
    task = db.query(TrainingTask).filter(TrainingTask.id == request.task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"训练任务 {request.task_id} 不存在")
    _verify_task_ownership(task, current_user)

    service = BacktestService(db)

    backtest = service.create_backtest(
        task_id=request.task_id,
        start_date=request.start_date,
        end_date=request.end_date,
        initial_capital=request.initial_capital,
        commission_rate=request.commission_rate,
        slippage=request.slippage,
        position_size=request.position_size,
        stop_loss=request.stop_loss,
        take_profit=request.take_profit
    )

    override_codes = request.stock_codes
    if override_codes:
        from app.services.data_service import DataService
        data_service = DataService(db)
        for code in override_codes:
            stock = data_service.get_stock_by_code(code)
            if not stock:
                try:
                    data_service.fetch_stock_data(code)
                except Exception:
                    pass

    background_tasks.add_task(service.run_backtest, backtest.id, override_codes)

    return backtest.to_dict()


@router.get("/results", response_model=PaginatedBacktestResponse)
async def get_backtest_results(
    task_id: Optional[int] = None,
    page: int = 1,
    page_size: int = 100,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """获取当前用户的回测结果列表"""
    skip = (page - 1) * page_size
    service = BacktestService(db)

    # 管理员可查看所有结果，普通用户仅查看自己的
    filter_user_id = None if current_user.is_admin else current_user.id
    results = service.get_results(task_id=task_id, skip=skip, limit=page_size, user_id=filter_user_id)

    query = db.query(BacktestORM)
    if filter_user_id is not None:
        query = query.join(TrainingTask, BacktestORM.task_id == TrainingTask.id).join(
            UserTableModel, TrainingTask.model_id == UserTableModel.id
        ).filter(UserTableModel.user_id == filter_user_id)
    if task_id:
        query = query.filter(BacktestORM.task_id == task_id)
    total = query.count()

    return {
        "items": [result.to_dict() for result in results],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/results/{backtest_id}", response_model=BacktestDetailResponse)
async def get_backtest_result(
    backtest_id: int,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """获取回测结果详情，需验证所有权"""
    service = BacktestService(db)
    result = service.get_result(backtest_id)

    if not result:
        raise HTTPException(status_code=404, detail=f"回测结果 {backtest_id} 不存在")

    _verify_backtest_ownership(result, current_user)

    return result.to_dict()


@router.get("/results/{backtest_id}/equity")
async def get_equity_curve(
    backtest_id: int,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """获取权益曲线数据，需验证所有权"""
    service = BacktestService(db)

    result = service.get_result(backtest_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"回测结果 {backtest_id} 不存在")

    _verify_backtest_ownership(result, current_user)

    if not result.equity_curve:
        return {"success": False, "message": "暂无权益曲线数据"}

    return {
        "success": True,
        "equity_curve": result.equity_curve
    }


@router.get("/results/{backtest_id}/trades")
async def get_trades(
    backtest_id: int,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """获取交易记录，需验证所有权"""
    service = BacktestService(db)

    result = service.get_result(backtest_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"回测结果 {backtest_id} 不存在")

    _verify_backtest_ownership(result, current_user)

    if not result.trades:
        return {"success": False, "message": "暂无交易记录", "trades": []}

    return {
        "success": True,
        "trades": result.trades,
        "total_count": len(result.trades)
    }


@router.get("/results/{backtest_id}/daily-returns")
async def get_daily_returns(
    backtest_id: int,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """获取每日收益数据，需验证所有权"""
    service = BacktestService(db)

    result = service.get_result(backtest_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"回测结果 {backtest_id} 不存在")

    _verify_backtest_ownership(result, current_user)

    if not result.daily_returns:
        return {"success": False, "message": "暂无每日收益数据"}

    return {
        "success": True,
        "daily_returns": result.daily_returns
    }


@router.delete("/results/{backtest_id}")
async def delete_backtest_result(
    backtest_id: int,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """删除回测结果，需验证所有权"""
    service = BacktestService(db)

    result = service.get_result(backtest_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"回测结果 {backtest_id} 不存在")

    _verify_backtest_ownership(result, current_user)

    success = service.delete_result(backtest_id)
    if success:
        return {"success": True, "message": f"回测结果 {backtest_id} 已删除"}
    else:
        raise HTTPException(status_code=500, detail="删除失败")


@router.post("/compare")
async def compare_backtests(
    backtest_ids: List[int],
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """对比多个回测结果，需验证所有结果属于当前用户"""
    service = BacktestService(db)

    # 验证所有回测结果属于当前用户
    for bid in backtest_ids:
        result = service.get_result(bid)
        if result:
            _verify_backtest_ownership(result, current_user)

    comparison = service.compare_backtests(backtest_ids)

    return {
        "success": True,
        "comparison": comparison
    }


@router.post("/run-stream")
async def run_backtest_stream(
    request: RunBacktestRequest,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """SSE 流式执行回测，需验证训练任务属于当前用户"""
    # 验证训练任务属于当前用户
    task = db.query(TrainingTask).filter(TrainingTask.id == request.task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"训练任务 {request.task_id} 不存在")
    _verify_task_ownership(task, current_user)

    q: queue.Queue = queue.Queue()

    def worker():
        db_worker = None
        try:
            db_worker = SessionLocal()
            service = BacktestService(db_worker)

            q.put(json.dumps({'stage': 'creating', 'progress': 5, 'message': '正在创建回测任务...'}, ensure_ascii=False))

            backtest = service.create_backtest(
                task_id=request.task_id,
                start_date=request.start_date,
                end_date=request.end_date,
                initial_capital=request.initial_capital,
                commission_rate=request.commission_rate,
                slippage=request.slippage,
                position_size=request.position_size,
                stop_loss=request.stop_loss,
                take_profit=request.take_profit
            )

            override_codes = request.stock_codes
            if override_codes:
                from app.services.data_service import DataService
                data_service = DataService(db_worker)
                for code in override_codes:
                    stock = data_service.get_stock_by_code(code)
                    if not stock:
                        try:
                            data_service.fetch_stock_data(code)
                        except Exception:
                            pass

            q.put(json.dumps({'stage': 'loading', 'progress': 15, 'message': '正在加载模型...', 'backtest_id': backtest.id}, ensure_ascii=False))

            backtest_obj = service.get_result(backtest.id)
            if not backtest_obj:
                q.put(json.dumps({'stage': 'error', 'progress': 0, 'message': '回测任务创建失败'}, ensure_ascii=False))
                return

            task_obj = backtest_obj.training_task
            user_model = task_obj.user_model
            stock_codes = override_codes or user_model.stock_codes
            total_stocks = len(stock_codes)

            q.put(json.dumps({'stage': 'backtesting', 'progress': 20, 'message': f'正在回测 {total_stocks} 只股票...'}, ensure_ascii=False))

            service.run_backtest(backtest.id, override_codes)

            backtest_obj = service.get_result(backtest.id)
            if backtest_obj and backtest_obj.final_capital:
                q.put(json.dumps({
                    'stage': 'completed',
                    'progress': 100,
                    'message': '回测完成',
                    'success': True,
                    'backtest_id': backtest.id,
                    'total_return': float(backtest_obj.total_return) if backtest_obj.total_return else 0,
                    'annual_return': float(backtest_obj.annual_return) if backtest_obj.annual_return else 0,
                    'max_drawdown': float(backtest_obj.max_drawdown) if backtest_obj.max_drawdown else 0,
                    'sharpe_ratio': float(backtest_obj.sharpe_ratio) if backtest_obj.sharpe_ratio else 0,
                    'trades_count': backtest_obj.trades_count or 0,
                    'win_rate': float(backtest_obj.win_rate) if backtest_obj.win_rate else 0,
                }, ensure_ascii=False))
            else:
                q.put(json.dumps({'stage': 'error', 'progress': 0, 'message': '回测执行失败'}, ensure_ascii=False))

        except Exception as e:
            logger.exception(f"SSE回测执行失败")
            q.put(json.dumps({'stage': 'error', 'progress': 0, 'message': f'回测失败: {str(e)}'}, ensure_ascii=False))
        finally:
            if db_worker:
                db_worker.close()
            q.put(None)

    t = threading.Thread(target=worker, daemon=True)
    t.start()

    def event_generator():
        while True:
            item = q.get()
            if item is None:
                break
            yield f"data: {item}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )
