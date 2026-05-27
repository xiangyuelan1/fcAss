"""
FastAPI应用主入口
"""
import asyncio
from datetime import datetime, timedelta
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import os

from app.core.config import settings
from app.core.database import init_db, _migrate_db, SessionLocal, Base
from app.core.logging import setup_logging
from app.models.stock import Stock, StockPrice
from app.models.user_model import UserModel
from app.models.user import User
from app.models.training import TrainingTask, BacktestResult
from app.models.payment import PaymentConfig, PaymentOrder
from app.models.user_prefs import UserStockPrefs, UserModelPrefs
from app.models.system_config import SystemConfig
from app.models.watchlist import Watchlist, WatchlistItem
from app.models.daily_guess import DailyGuessStock, DailyGuessVote
from app.models.community import CommunityModel, CommunitySignal
from app.api import api_router
from app.auth import get_password_hash
import logging


class ConnectionManager:
    """WebSocket连接管理器，维护活跃连接并负责广播消息"""

    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        if ws in self.active:
            self.active.remove(ws)

    async def broadcast(self, data: dict):
        disconnected = []
        for ws in self.active:
            try:
                await ws.send_json(data)
            except Exception:
                disconnected.append(ws)
        for ws in disconnected:
            self.disconnect(ws)


ws_manager = ConnectionManager()


async def market_data_pusher():
    """后台任务：每30秒推送热门股票+用户自选股最新行情到所有WebSocket客户端"""
    while True:
        try:
            db = SessionLocal()
            try:
                from app.services.data_service import DataService
                from app.models.watchlist import WatchlistItem
                ds = DataService(db)
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
                watchlist_codes = set()
                try:
                    items = db.query(WatchlistItem.stock_code).distinct().all()
                    watchlist_codes = {item[0] for item in items if item[0]}
                except Exception:
                    pass
                all_codes = list(dict.fromkeys(hot_stocks + list(watchlist_codes)))[:50]
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


def _ensure_default_admin():
    """确保默认管理员账号存在且拥有管理员权限（首次启动时自动创建）"""
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.username == "admin").first()
        if not existing:
            admin = User(
                username="admin",
                email="admin@astock.local",
                hashed_password=get_password_hash("admin123"),
                is_active=True,
                is_admin=True,
            )
            db.add(admin)
            db.commit()
            print("[OK] 默认管理员账号已创建: admin / admin123")
        elif not existing.is_admin:
            existing.is_admin = True
            existing.is_active = True
            db.commit()
            print("[OK] 管理员账号权限已修复: is_admin=True")
        else:
            print("[OK] 管理员账号已存在")
    except Exception as e:
        db.rollback()
        print(f"[WARN] 创建默认管理员失败: {e}")
    finally:
        db.close()


def _ensure_test_users():
    """确保内测用户存在（testuser1 ~ testuser20，密码均为 123456）"""
    db = SessionLocal()
    try:
        for i in range(1, 21):
            username = f"testuser{i}"
            existing = db.query(User).filter(User.username == username).first()
            if not existing:
                user = User(
                    username=username,
                    hashed_password=get_password_hash("123456"),
                    is_active=True,
                    is_admin=False,
                )
                db.add(user)
        db.commit()
        print("[OK] 内测用户检查完成")
    except Exception as e:
        print(f"[WARN] 内测用户创建失败: {e}")
        db.rollback()
    finally:
        db.close()


def _sync_stock_pool_on_startup():
    """启动时自动同步A股股票池（仅名称和代码，不获取价格）

    优先使用 akshare，若不可用则自动降级到 baostock，
    确保启动时同步不会因 akshare 缺失而失败。
    """
    db = SessionLocal()
    try:
        from app.services.data_service import DataService
        service = DataService(db)
        count = service.sync_stock_pool()
        print(f"[OK] 股票池同步完成: 新增 {count} 只股票")
    except ImportError as e:
        print(f"[WARN] 股票池同步跳过: 缺少依赖库({e})，请安装 akshare 或 baostock 后手动同步")
    except Exception as e:
        print(f"[WARN] 股票池同步失败: {e}，可手动同步")
    finally:
        db.close()


def _compute_badges(total: int, correct: int, current_streak: int, best_streak: int) -> list[str]:
    """根据预测战绩计算称号列表"""
    badges: list[str] = []
    accuracy = correct / total if total > 0 else 0.0

    if current_streak >= 7:
        badges.append("七日连胜 🏆")
    elif current_streak >= 5:
        badges.append("五连绝世 ⚡")
    elif current_streak >= 3:
        badges.append("连中三元 🔥")

    if total >= 10:
        if accuracy >= 0.8:
            badges.append("预言大师 👑")
        elif accuracy >= 0.7:
            badges.append("精准猎手 🎯")
        if accuracy < 0.3:
            badges.append("反向指标 🔄")

    if total >= 100:
        badges.append("百战老兵 💎")
    elif total >= 30:
        badges.append("资深预测 📊")

    return badges


async def auto_predict_community_models():
    """后台任务：每日自动为社区模型执行预测并更新战绩

    首次启动延迟5分钟执行，之后每24小时执行一次。
    对每个开启自动预测的活跃社区模型，取其关联股票的前3只进行预测，
    同时回溯前一天预测与实际涨跌对比，更新正确/错误统计和称号。
    """
    logger = logging.getLogger(__name__)
    await asyncio.sleep(300)

    while True:
        db = SessionLocal()
        try:
            models = db.query(CommunityModel).filter(
                CommunityModel.auto_predict == True,
                CommunityModel.is_active == True,
            ).all()

            today_str = datetime.now().strftime("%Y-%m-%d")

            for cm in models:
                try:
                    latest_task = db.query(TrainingTask).filter(
                        TrainingTask.model_id == cm.source_model_id,
                        TrainingTask.status == 'completed',
                    ).order_by(TrainingTask.created_at.desc()).first()

                    if not latest_task:
                        continue

                    from app.services.training_service import ModelCheckpoint, TORCH_AVAILABLE
                    try:
                        model, metrics, input_size, feature_window = ModelCheckpoint.load_checkpoint(latest_task.id)
                    except (FileNotFoundError, ValueError):
                        continue

                    from app.services.feature_service import FeatureService
                    from app.services.data_service import DataService
                    from app.api.prediction import _do_predict, _prediction_to_label

                    feature_service = FeatureService(db)
                    data_service = DataService(db)

                    stock_codes = cm.stock_codes or []
                    predict_codes = stock_codes[:3]

                    record = cm.prediction_record or {}
                    daily_records = record.get("daily_records", [])

                    # 回溯前一天预测，对比实际涨跌
                    yesterday_str = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
                    updated = False
                    for dr in daily_records:
                        if dr.get("date") == yesterday_str and dr.get("actual") is None:
                            try:
                                prices = data_service.get_stock_prices(dr["stock_code"], limit=2)
                                if prices and len(prices) >= 2:
                                    change_pct = float(prices[-1].change_pct) if prices[-1].change_pct else 0.0
                                    actual = "up" if change_pct > 0 else ("down" if change_pct < 0 else "flat")
                                    dr["actual"] = actual
                                    dr["correct"] = (dr["direction"] == actual)
                                    updated = True
                            except Exception:
                                pass

                    # 重新计算统计
                    if updated:
                        verified = [dr for dr in daily_records if dr.get("actual") is not None]
                        total_p = len(verified)
                        correct_p = sum(1 for dr in verified if dr.get("correct") is True)
                        accuracy = round(correct_p / total_p, 3) if total_p > 0 else 0.0

                        # 计算连胜
                        current_streak = 0
                        best_streak = 0
                        streak = 0
                        for dr in reversed(verified):
                            if dr.get("correct") is True:
                                streak += 1
                                best_streak = max(best_streak, streak)
                            else:
                                if current_streak == 0:
                                    current_streak = streak
                                streak = 0
                        if current_streak == 0 and streak > 0:
                            current_streak = streak

                        record["total_predictions"] = total_p
                        record["correct_predictions"] = correct_p
                        record["accuracy"] = accuracy
                        record["current_streak"] = current_streak
                        record["best_streak"] = best_streak
                        record["badges"] = _compute_badges(total_p, correct_p, current_streak, best_streak)

                    # 执行今日预测
                    for code in predict_codes:
                        existing_today = any(
                            dr.get("date") == today_str and dr.get("stock_code") == code
                            for dr in daily_records
                        )
                        if existing_today:
                            continue

                        try:
                            stock_info = data_service.get_stock_by_code(code)
                            if not stock_info:
                                data_service.fetch_stock_data(code)

                            df = feature_service.calculate_features(
                                stock_code=code,
                                indicators=cm.features,
                                indicator_params=cm.feature_config or {},
                                limit=5000,
                            )
                            if df is None or df.empty:
                                continue

                            exclude_cols = {'id', 'stock_code', 'open', 'high', 'low', 'close', 'volume', 'amount',
                                            'change_pct', 'change_amount', 'adj_close'}
                            feature_cols = [col for col in df.columns if col not in exclude_cols]
                            if not feature_cols:
                                continue

                            if feature_window > 1:
                                if len(feature_cols) * feature_window != input_size:
                                    continue
                            else:
                                if len(feature_cols) != input_size:
                                    continue

                            df_features = df[feature_cols].copy()
                            df_features = (df_features - df_features.mean()) / df_features.std()

                            prediction = _do_predict(model, cm.model_type, cm.model_config, df_features, input_size, feature_window)
                            direction = _prediction_to_label(prediction, cm.target)

                            # 写入 CommunitySignal
                            signal = CommunitySignal(
                                user_id=cm.user_id,
                                community_model_id=cm.id,
                                stock_code=code,
                                direction=direction,
                                prediction_value=round(float(prediction), 4),
                                prediction_date=today_str,
                            )
                            db.add(signal)

                            # 写入 daily_records
                            daily_records.insert(0, {
                                "date": today_str,
                                "stock_code": code,
                                "direction": direction,
                                "actual": None,
                                "correct": None,
                            })

                        except Exception as e:
                            logger.warning(f"[自动预测] 模型{cm.id} 股票{code} 预测失败: {e}")
                            continue

                    # 更新 total_predictions（包含未验证的）
                    record["daily_records"] = daily_records
                    record["total_predictions"] = len(daily_records)
                    cm.prediction_record = record

                except Exception as e:
                    logger.warning(f"[自动预测] 模型{cm.id} 处理失败: {e}")
                    continue

            db.commit()
            logger.info(f"[自动预测] 完成，处理了 {len(models)} 个社区模型")
        except Exception as e:
            logger.error(f"[自动预测] 执行异常: {e}")
            db.rollback()
        finally:
            db.close()

        await asyncio.sleep(86400)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    setup_logging()
    print(f"[启动] {settings.APP_NAME} v{settings.APP_VERSION}")
    init_db()
    print("[OK] 数据库初始化完成")
    _migrate_db()
    _ensure_default_admin()
    _ensure_test_users()

    asyncio.create_task(_background_startup_tasks())

    yield

    print("[关闭] 应用关闭")


async def _background_startup_tasks():
    """后台启动任务：不阻塞应用就绪，避免健康检查超时"""
    await asyncio.sleep(3)
    try:
        _sync_stock_pool_on_startup()
    except Exception as e:
        print(f"[WARN] 股票池同步失败: {e}")

    asyncio.create_task(market_data_pusher())
    asyncio.create_task(auto_predict_community_models())


def create_app() -> FastAPI:
    """创建FastAPI应用实例"""
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        description="A股预测训练平台 - 让每个用户都可以DIY自己的训练模型",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router)

    # 挂载APK下载目录为静态文件服务
    apk_dir = os.path.join("/app/downloads")
    os.makedirs(apk_dir, exist_ok=True)
    app.mount("/downloads", StaticFiles(directory=apk_dir), name="downloads")

    return app


app = create_app()


@app.websocket("/ws/market")
async def websocket_market(ws: WebSocket):
    """WebSocket端点：客户端连接后接收实时行情推送"""
    await ws_manager.connect(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(ws)


@app.get("/")
async def root():
    apk_path = os.path.join("/app/downloads", "app-debug.apk")
    apk_available = os.path.exists(apk_path)
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/docs",
        "api": "/api",
        "android_app": {
            "available": apk_available,
            "download_url": "/downloads/app-debug.apk" if apk_available else None,
        },
    }


@app.get("/api/app/download")
async def get_app_download():
    """查询安卓App下载信息"""
    apk_path = os.path.join("/app/downloads", "app-debug.apk")
    apk_available = os.path.exists(apk_path)
    apk_size = os.path.getsize(apk_path) if apk_available else 0
    return {
        "available": apk_available,
        "download_url": "/downloads/app-debug.apk" if apk_available else None,
        "file_size": apk_size,
        "file_size_mb": round(apk_size / 1024 / 1024, 1) if apk_available else 0,
        "version": settings.APP_VERSION,
        "platform": "android",
    }


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "version": settings.APP_VERSION
    }
