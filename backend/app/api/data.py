"""
数据管理API

基于 baostock 数据源，核心流程：输入股票代码 -> 获取数据
无需同步全量股票列表
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, Field
from fastapi.responses import StreamingResponse
import json

from app.core.database import get_db
from app.services.data_service import DataService

logger = logging.getLogger(__name__)
router = APIRouter()


class StockInfo(BaseModel):
    code: str
    name: str
    exchange: Optional[str] = None
    industry: Optional[str] = None
    price_count: Optional[int] = None
    earliest_date: Optional[str] = None
    latest_date: Optional[str] = None

    class Config:
        from_attributes = True


class StockPriceData(BaseModel):
    date: str
    open: Optional[float] = None
    high: Optional[float] = None
    low: Optional[float] = None
    close: Optional[float] = None
    volume: Optional[int] = None
    amount: Optional[float] = None
    change_pct: Optional[float] = None


class FetchStockRequest(BaseModel):
    code: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class FetchStockResponse(BaseModel):
    success: bool
    message: str
    stock: Optional[StockInfo] = None
    price_count: int = 0


class SyncPriceResponse(BaseModel):
    success: bool
    message: str
    synced_count: int = 0


@router.post("/stocks/fetch", response_model=FetchStockResponse)
async def fetch_stock_by_code(
    request: FetchStockRequest,
    db: Session = Depends(get_db)
):
    """按股票代码获取数据：自动创建股票记录并同步历史价格"""
    service = DataService(db)
    code = request.code.strip()
    try:
        result = service.fetch_stock_data(
            code=code,
            start_date=request.start_date,
            end_date=request.end_date
        )
        stock = result['stock']
        price_count = result['price_count']

        if price_count == 0:
            return FetchStockResponse(
                success=False,
                message=f"股票 {stock.name}({code}) 信息已记录，但未获取到价格数据，可能是数据源暂不可用或代码无效",
                stock=StockInfo(
                    code=stock.code,
                    name=stock.name,
                    exchange=stock.exchange,
                    industry=stock.industry
                ),
                price_count=0
            )
        return FetchStockResponse(
            success=True,
            message=f"成功获取 {stock.name}({code}) 的 {price_count} 条价格数据",
            stock=StockInfo(
                code=stock.code,
                name=stock.name,
                exchange=stock.exchange,
                industry=stock.industry
            ),
            price_count=price_count
        )
    except Exception as e:
        return FetchStockResponse(
            success=False,
            message=f"获取失败: {str(e)}",
            stock=None,
            price_count=0
        )


@router.get("/stocks/fetch-stream")
async def fetch_stock_stream(
    code: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """SSE流式获取股票数据，实时推送进度
    
    使用Server-Sent Events推送进度，前端用EventSource接收
    注意：SQLAlchemy Session不是线程安全的，在子线程中创建新Session
    """
    import queue
    import threading
    from app.core.database import SessionLocal
    
    q: queue.Queue = queue.Queue()

    def progress_callback(stage: str, progress: int, message: str, data: dict = None):
        q.put(json.dumps({
            'stage': stage,
            'progress': progress,
            'message': message,
            **(data or {})
        }, ensure_ascii=False))

    def worker():
        db = None
        try:
            # 在子线程中创建新的数据库Session
            db = SessionLocal()
            logger.info(f"开始获取股票 {code} 数据，在子线程中创建新Session")
            service = DataService(db)
            result = service.fetch_stock_data_with_progress(
                code=code.strip(),
                start_date=start_date,
                end_date=end_date,
                progress_callback=progress_callback
            )
            stock = result['stock']
            price_count = result['price_count']
            q.put(json.dumps({
                'stage': 'completed',
                'progress': 100,
                'message': f"成功获取 {stock.name}({code}) 的 {price_count} 条数据",
                'success': True,
                'stock': {
                    'code': stock.code,
                    'name': stock.name,
                    'exchange': stock.exchange,
                    'industry': stock.industry,
                },
                'price_count': price_count,
            }, ensure_ascii=False))
        except Exception as e:
            logger.exception(f"获取股票 {code} 数据失败")
            q.put(json.dumps({
                'stage': 'error',
                'progress': 0,
                'message': f"获取失败: {str(e)}",
                'success': False,
            }, ensure_ascii=False))
        finally:
            if db:
                db.close()
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


@router.get("/stocks", response_model=List[StockInfo])
async def get_stocks(
    search: Optional[str] = Query(None, description="搜索关键词（代码或名称）"),
    industry: Optional[str] = Query(None, description="行业筛选"),
    db: Session = Depends(get_db)
):
    """获取数据库中已存的股票列表（含数据概要）"""
    from sqlalchemy import func
    from app.models.stock import StockPrice

    service = DataService(db)
    stocks = service.get_stocks(search=search, industry=industry)

    stock_codes = [s.code for s in stocks]
    summary_map = {}
    if stock_codes:
        rows = db.query(
            StockPrice.stock_code,
            func.count(StockPrice.id).label('cnt'),
            func.min(StockPrice.date).label('earliest'),
            func.max(StockPrice.date).label('latest'),
        ).filter(StockPrice.stock_code.in_(stock_codes)).group_by(StockPrice.stock_code).all()

        for row in rows:
            summary_map[row.stock_code] = {
                'price_count': row.cnt,
                'earliest_date': str(row.earliest) if row.earliest else None,
                'latest_date': str(row.latest) if row.latest else None,
            }

    result = []
    for stock in stocks:
        info = stock.to_dict()
        summary = summary_map.get(stock.code, {})
        info['price_count'] = summary.get('price_count', 0)
        info['earliest_date'] = summary.get('earliest_date')
        info['latest_date'] = summary.get('latest_date')
        result.append(info)
    return result


@router.get("/stocks/{code}/prices", response_model=List[StockPriceData])
async def get_stock_prices(
    code: str,
    start_date: Optional[str] = Query(None, description="开始日期 (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="结束日期 (YYYY-MM-DD)"),
    limit: int = Query(500, ge=1, le=5000, description="返回条数"),
    db: Session = Depends(get_db)
):
    """获取股票历史价格数据"""
    service = DataService(db)
    prices = service.get_stock_prices(
        code=code,
        start_date=start_date,
        end_date=end_date,
        limit=limit
    )
    return [price.to_dict() for price in prices]


@router.post("/stocks/{code}/sync", response_model=SyncPriceResponse)
async def sync_stock_prices(
    code: str,
    db: Session = Depends(get_db)
):
    """重新同步单只股票的历史价格数据"""
    service = DataService(db)
    try:
        count = service.sync_stock_prices(code=code)
        stock = service.get_stock_by_code(code)
        name = stock.name if stock else code
        return SyncPriceResponse(
            success=True,
            message=f"成功同步 {name}({code}) 的 {count} 条价格数据",
            synced_count=count
        )
    except Exception as e:
        return SyncPriceResponse(
            success=False,
            message=f"同步失败: {str(e)}",
            synced_count=0
        )


@router.get("/stocks/{code}/info", response_model=StockInfo)
async def get_stock_info(
    code: str,
    db: Session = Depends(get_db)
):
    """获取单只股票信息"""
    service = DataService(db)
    stock = service.get_stock_by_code(code)
    if not stock:
        raise HTTPException(status_code=404, detail=f"股票 {code} 不存在，请先通过获取数据接口添加")
    return stock.to_dict()


@router.get("/industries")
async def get_industries(db: Session = Depends(get_db)):
    """获取所有行业列表（从已存的股票记录中提取）"""
    service = DataService(db)
    industries = service.get_industries()
    return {"industries": industries}
