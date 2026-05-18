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
from datetime import datetime

from app.core.database import get_db
from app.services.data_service import DataService
from app.auth import get_current_active_user
from app.models.user import User as UserModel
from app.models.user_prefs import UserStockPrefs
from app.models.stock import Stock, StockPrice

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
    is_pinned: Optional[bool] = False

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


@router.post("/stocks/{code}/ensure")
async def ensure_stock_data(
    code: str,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """确保股票数据存在，不存在则自动从数据源获取

    用于训练/回测/预测等场景，当需要某只股票数据时自动获取，
    避免用户必须先手动到数据管理页面获取。
    """
    from sqlalchemy import func

    service = DataService(db)
    stock = service.get_stock_by_code(code)

    # 检查是否已有足够数据
    if stock:
        price_count = db.query(func.count(StockPrice.id)).filter(
            StockPrice.stock_code == code
        ).scalar()
        if price_count >= 50:
            return {
                "success": True,
                "message": f"股票 {stock.name}({code}) 已有 {price_count} 条数据",
                "stock": {"code": stock.code, "name": stock.name},
                "price_count": price_count,
                "fetched": False,
            }

    # 数据不足，自动获取
    try:
        result = service.fetch_stock_data(code)
        stock = result['stock']
        price_count = result['price_count']
        return {
            "success": True,
            "message": f"已自动获取 {stock.name}({code}) 的 {price_count} 条数据",
            "stock": {"code": stock.code, "name": stock.name},
            "price_count": price_count,
            "fetched": True,
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"自动获取股票 {code} 数据失败: {str(e)}",
            "stock": None,
            "price_count": 0,
            "fetched": True,
        }


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

    def progress_callback(stage: str, progress: int, message: str, **kwargs):
        payload = {
            'stage': stage,
            'progress': progress,
            'message': message,
            **kwargs,
        }
        q.put(json.dumps(payload, ensure_ascii=False))

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
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    from sqlalchemy import func

    service = DataService(db)
    stocks = service.get_stocks(search=search, industry=industry)

    pinned_map = {}
    prefs = db.query(UserStockPrefs).filter(
        UserStockPrefs.user_id == current_user.id,
        UserStockPrefs.is_pinned == True
    ).all()
    for p in prefs:
        pinned_map[p.stock_code] = p.pinned_at

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
        info['is_pinned'] = stock.code in pinned_map
        result.append(info)

    result.sort(key=lambda x: (0 if x.get('is_pinned') else 1, x.get('code', '')))

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


@router.post("/stocks/{code}/pin")
async def pin_stock(
    code: str,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    stock = db.query(Stock).filter(Stock.code == code).first()
    if not stock:
        raise HTTPException(status_code=404, detail=f"股票 {code} 不存在")
    pref = db.query(UserStockPrefs).filter(
        UserStockPrefs.user_id == current_user.id,
        UserStockPrefs.stock_code == code
    ).first()
    if pref:
        pref.is_pinned = True
        pref.pinned_at = datetime.now()
    else:
        pref = UserStockPrefs(
            user_id=current_user.id,
            stock_code=code,
            is_pinned=True,
            pinned_at=datetime.now()
        )
        db.add(pref)
    db.commit()
    return {"success": True, "message": f"股票 {code} 已置顶"}


@router.post("/stocks/{code}/unpin")
async def unpin_stock(
    code: str,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    pref = db.query(UserStockPrefs).filter(
        UserStockPrefs.user_id == current_user.id,
        UserStockPrefs.stock_code == code
    ).first()
    if pref:
        pref.is_pinned = False
        pref.pinned_at = None
        db.commit()
    return {"success": True, "message": f"股票 {code} 已取消置顶"}


@router.delete("/stocks/{code}")
async def delete_stock(
    code: str,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    stock = db.query(Stock).filter(Stock.code == code).first()
    if not stock:
        raise HTTPException(status_code=404, detail=f"股票 {code} 不存在")
    db.query(StockPrice).filter(StockPrice.stock_code == code).delete()
    db.query(UserStockPrefs).filter(UserStockPrefs.stock_code == code).delete()
    db.delete(stock)
    db.commit()
    return {"success": True, "message": f"股票 {code} 及其所有数据已删除"}


@router.get("/stale-check")
async def check_stale_data(db: Session = Depends(get_db)):
    """检查已训练模型的数据新鲜度，返回数据过期的模型列表

    对比每只训练股票的最新价格日期与对应训练任务的完成时间，
    若训练后有新数据产生，则标记该模型需要重新训练。
    """
    from sqlalchemy import func
    from app.models.training import TrainingTask
    from app.models.user_model import UserModel as UserModelORM

    trained_models = db.query(UserModelORM).filter(UserModelORM.status == 'trained').all()
    stale_models = []

    for model in trained_models:
        latest_task = (
            db.query(TrainingTask)
            .filter(TrainingTask.model_id == model.id, TrainingTask.status == 'completed')
            .order_by(TrainingTask.end_time.desc())
            .first()
        )
        if not latest_task or not latest_task.end_time:
            continue

        task_end = latest_task.end_time
        stale_stocks = []
        for code in (model.stock_codes or []):
            latest_price = (
                db.query(func.max(StockPrice.date))
                .filter(StockPrice.stock_code == code)
                .scalar()
            )
            if latest_price and latest_price > task_end.date():
                stale_stocks.append({
                    'code': code,
                    'latest_data_date': str(latest_price),
                    'trained_at': str(task_end),
                })

        if stale_stocks:
            stale_models.append({
                'model_id': model.id,
                'model_name': model.name,
                'model_type': model.model_type,
                'task_id': latest_task.id,
                'trained_at': str(task_end),
                'stale_stocks': stale_stocks,
                'new_data_count': len(stale_stocks),
            })

    return {
        'stale_models': stale_models,
        'total': len(stale_models),
    }


@router.get("/stocks/search")
async def search_stock_pool(
    q: str = Query(..., min_length=1, description="搜索关键词（代码或名称）"),
    limit: int = Query(20, ge=1, le=100, description="返回条数"),
    db: Session = Depends(get_db),
):
    """搜索A股股票池（按代码或名称模糊搜索，只查 stocks 表）"""
    pattern = f"%{q}%"
    stocks = (
        db.query(Stock)
        .filter((Stock.code.like(pattern)) | (Stock.name.like(pattern)))
        .limit(limit)
        .all()
    )
    return [s.to_dict() for s in stocks]


@router.post("/stocks/sync-pool")
async def sync_stock_pool(
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """同步A股股票名称列表（从 akshare 获取所有A股代码和名称，只更新 stocks 表）"""
    try:
        import akshare as ak
        import pandas as pd

        df_sh = ak.stock_info_sh_name_code(symbol="主板A股")
        df_sz = ak.stock_info_sz_name_code(indicator="A股列表")

        records = []
        for _, row in df_sh.iterrows():
            code = str(row.get("证券代码", "")).zfill(6)
            name = str(row.get("证券简称", ""))
            if code and name:
                records.append({"code": f"sh{code}", "name": name, "exchange": "SH"})

        for _, row in df_sz.iterrows():
            code = str(row.get("A股代码", "")).zfill(6)
            name = str(row.get("A股简称", ""))
            if code and name:
                records.append({"code": f"sz{code}", "name": name, "exchange": "SZ"})

        if not records:
            return {"success": False, "message": "未获取到股票数据，akshare可能暂不可用", "synced_count": 0}

        existing_map = {}
        for stock in db.query(Stock).all():
            existing_map[stock.code] = stock

        new_count = 0
        update_count = 0
        for rec in records:
            existing = existing_map.get(rec["code"])
            if existing:
                if existing.name != rec["name"]:
                    existing.name = rec["name"]
                    update_count += 1
            else:
                db.add(Stock(code=rec["code"], name=rec["name"], exchange=rec["exchange"]))
                new_count += 1

        db.commit()
        return {
            "success": True,
            "message": f"同步完成：新增 {new_count} 只，更新 {update_count} 只，总计 {len(records)} 只",
            "synced_count": len(records),
            "new_count": new_count,
            "update_count": update_count,
        }
    except ImportError:
        raise HTTPException(status_code=500, detail="akshare 库未安装，请执行 pip install akshare")
    except Exception as e:
        logger.exception("同步股票池失败")
        raise HTTPException(status_code=500, detail=f"同步股票池失败: {str(e)}")


@router.post("/batch-sync")
async def batch_sync_stocks(
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """批量同步所有已训练模型涉及的股票数据

    对每只股票调用增量同步（仅获取最新数据），返回同步结果。
    """
    from app.models.user_model import UserModel as UserModelORM

    trained_models = db.query(UserModelORM).filter(UserModelORM.status == 'trained').all()
    all_codes = set()
    for model in trained_models:
        for code in (model.stock_codes or []):
            all_codes.add(code)

    service = DataService(db)
    results = []
    for code in sorted(all_codes):
        try:
            count = service.sync_stock_prices(code)
            stock = service.get_stock_by_code(code)
            results.append({
                'code': code,
                'name': stock.name if stock else code,
                'synced_count': count,
                'success': True,
            })
        except Exception as e:
            results.append({
                'code': code,
                'success': False,
                'error': str(e),
            })

    return {
        'success': True,
        'synced_count': len([r for r in results if r.get('success')]),
        'failed_count': len([r for r in results if not r.get('success')]),
        'results': results,
    }


@router.post("/update-all")
async def update_all_stocks(
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """一键增量更新所有已有股票的数据

    对数据库中每只有数据的股票执行增量同步，仅获取最新缺失的数据。
    """
    from app.models.stock import Stock, StockPrice

    stocks_with_data = (
        db.query(Stock.code, Stock.name)
        .join(StockPrice, StockPrice.stock_code == Stock.code)
        .group_by(Stock.code, Stock.name)
        .all()
    )

    if not stocks_with_data:
        return {'success': True, 'synced_count': 0, 'failed_count': 0, 'message': '暂无需要更新的股票数据'}

    service = DataService(db)
    results = []
    for stock in stocks_with_data:
        try:
            count = service.sync_stock_prices(stock.code)
            results.append({
                'code': stock.code,
                'name': stock.name,
                'synced_count': count,
                'success': True,
            })
        except Exception as e:
            results.append({
                'code': stock.code,
                'name': stock.name,
                'success': False,
                'error': str(e),
            })

    return {
        'success': True,
        'synced_count': len([r for r in results if r.get('success')]),
        'failed_count': len([r for r in results if not r.get('success')]),
        'total': len(stocks_with_data),
        'results': results,
    }
