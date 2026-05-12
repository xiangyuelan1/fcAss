"""
回测分析API
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

from app.core.database import get_db
from app.services.backtest_service import BacktestService

router = APIRouter()


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


# ============ API端点 ============

@router.post("/run", response_model=BacktestResponse)
async def run_backtest(
    request: RunBacktestRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """执行回测"""
    service = BacktestService(db)
    
    # 创建回测任务
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
    
    # 在后台执行回测
    # 如果指定了stock_codes，确保这些股票有数据
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
                    pass  # 如果获取失败，回测时跳过该股票

    background_tasks.add_task(service.run_backtest, backtest.id, override_codes)
    
    return backtest.to_dict()


@router.get("/results", response_model=List[BacktestResponse])
async def get_backtest_results(
    task_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """获取回测结果列表"""
    service = BacktestService(db)
    results = service.get_results(task_id=task_id, skip=skip, limit=limit)
    return [result.to_dict() for result in results]


@router.get("/results/{backtest_id}", response_model=BacktestDetailResponse)
async def get_backtest_result(
    backtest_id: int,
    db: Session = Depends(get_db)
):
    """获取回测结果详情"""
    service = BacktestService(db)
    result = service.get_result(backtest_id)
    
    if not result:
        raise HTTPException(status_code=404, detail=f"回测结果 {backtest_id} 不存在")
    
    return result.to_dict()


@router.get("/results/{backtest_id}/equity")
async def get_equity_curve(
    backtest_id: int,
    db: Session = Depends(get_db)
):
    """获取权益曲线数据"""
    service = BacktestService(db)
    
    result = service.get_result(backtest_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"回测结果 {backtest_id} 不存在")
    
    if not result.equity_curve:
        return {"success": False, "message": "暂无权益曲线数据"}
    
    return {
        "success": True,
        "equity_curve": result.equity_curve
    }


@router.get("/results/{backtest_id}/trades")
async def get_trades(
    backtest_id: int,
    db: Session = Depends(get_db)
):
    """获取交易记录"""
    service = BacktestService(db)
    
    result = service.get_result(backtest_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"回测结果 {backtest_id} 不存在")
    
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
    db: Session = Depends(get_db)
):
    """获取每日收益数据"""
    service = BacktestService(db)
    
    result = service.get_result(backtest_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"回测结果 {backtest_id} 不存在")
    
    if not result.daily_returns:
        return {"success": False, "message": "暂无每日收益数据"}
    
    return {
        "success": True,
        "daily_returns": result.daily_returns
    }


@router.delete("/results/{backtest_id}")
async def delete_backtest_result(
    backtest_id: int,
    db: Session = Depends(get_db)
):
    """删除回测结果"""
    service = BacktestService(db)
    
    result = service.get_result(backtest_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"回测结果 {backtest_id} 不存在")
    
    success = service.delete_result(backtest_id)
    if success:
        return {"success": True, "message": f"回测结果 {backtest_id} 已删除"}
    else:
        raise HTTPException(status_code=500, detail="删除失败")


@router.post("/compare")
async def compare_backtests(
    backtest_ids: List[int],
    db: Session = Depends(get_db)
):
    """对比多个回测结果"""
    service = BacktestService(db)
    
    comparison = service.compare_backtests(backtest_ids)
    
    return {
        "success": True,
        "comparison": comparison
    }
