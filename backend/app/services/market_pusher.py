"""
实时行情WebSocket推送服务

每30秒推送热门股票+用户自选股最新行情到所有WebSocket客户端。
"""
import asyncio

from app.core.database import SessionLocal


async def market_data_pusher(ws_manager):
    """后台任务：每30秒推送热门股票+用户自选股最新行情到所有WebSocket客户端

    Args:
        ws_manager: WebSocket连接管理器实例，提供 broadcast 方法
    """
    while True:
        try:
            db = SessionLocal()
            try:
                from app.services.data_service import DataService
                from app.models.watchlist import WatchlistItem
                ds = DataService(db)

                # 获取系统配置的热门股票
                hot_stocks = []
                try:
                    from app.models.system_config import SystemConfig
                    cfg = db.query(SystemConfig).filter(
                        SystemConfig.key == 'hot_stocks',
                        SystemConfig.is_active == True,
                    ).first()
                    if cfg and cfg.value:
                        hot_stocks = [c.strip() for c in cfg.value.split(',') if c.strip()]
                except Exception:
                    pass

                # 获取所有用户自选股代码
                watchlist_codes = set()
                try:
                    items = db.query(WatchlistItem.stock_code).distinct().all()
                    watchlist_codes = {item[0] for item in items if item[0]}
                except Exception:
                    pass

                # 合并去重，限制最多50只
                all_codes = list(dict.fromkeys(hot_stocks + list(watchlist_codes)))[:50]

                # 获取实时行情
                quotes = []
                try:
                    from app.services.data_fetcher import DataFetcher
                    rt_quotes = DataFetcher.get_realtime_quote(all_codes)
                    for code, q in rt_quotes.items():
                        quotes.append({
                            'code': code,
                            'close': q.get('close', 0),
                            'price': q.get('price', q.get('close', 0)),
                            'change_pct': q.get('change_pct', q.get('change_percent', 0)),
                            'volume': q.get('volume', 0),
                            'open': q.get('open', 0),
                            'high': q.get('high', 0),
                            'low': q.get('low', 0),
                        })
                except Exception:
                    # 实时接口不可用时回退到数据库最新价格
                    for code in all_codes:
                        try:
                            prices = ds.get_stock_prices(code, limit=1)
                            if prices:
                                p = prices[-1]
                                quotes.append({
                                    'code': code,
                                    'close': float(p.close) if p.close else 0,
                                    'change_pct': float(p.change_pct) if p.change_pct else 0,
                                    'volume': int(p.volume) if p.volume else 0,
                                })
                        except Exception:
                            continue

                if quotes:
                    await ws_manager.broadcast({'type': 'market', 'data': quotes})
            finally:
                db.close()
        except Exception:
            pass

        await asyncio.sleep(30)
