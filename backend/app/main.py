"""
FastAPI应用主入口
"""
import asyncio
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
from app.services.auto_predict_service import auto_predict_community_models
from app.services.market_pusher import market_data_pusher


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
    if not settings.DEBUG:
        return
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


def _ensure_seed_data():
    """确保种子数据存在，让新用户开箱即用

    首次启动时自动获取3只热门股票的历史数据，
    并为admin用户创建2个Demo模型，引导新用户快速体验。
    仅在数据库中无任何股票数据时执行，避免重复初始化。
    """
    db = SessionLocal()
    try:
        # 已有股票数据则跳过，说明非首次启动
        stock_count = db.query(Stock).count()
        if stock_count > 0:
            print("[OK] 种子数据已存在，跳过初始化")
            return

        print("[启动] 正在初始化种子数据...")
        from app.services.data_service import DataService
        service = DataService(db)

        # 获取3只热门股票数据（数据量大、知名度高，适合作为Demo）
        seed_stocks = [
            ('600519', '贵州茅台'),
            ('000001', '平安银行'),
            ('002594', '比亚迪'),
        ]
        for code, name in seed_stocks:
            try:
                result = service.fetch_stock_data(code)
                count = result.get('price_count', 0)
                print(f"  [种子] {name}({code}): 获取{count}条数据")
            except Exception as e:
                print(f"  [种子] {name}({code}): 获取失败({e})，跳过")

        # 为admin用户创建2个Demo模型（状态为draft，引导用户自己训练）
        admin = db.query(User).filter(User.username == 'admin').first()
        if admin:
            # 检查是否已有Demo模型，避免重复创建
            existing_demos = db.query(UserModel).filter(
                UserModel.name.like('[Demo]%')
            ).count()

            if existing_demos == 0:
                demo_models = [
                    UserModel(
                        user_id=admin.id,
                        name='[Demo] 茅台趋势预测(LSTM)',
                        model_type='lstm',
                        model_config={
                            'hidden_size': 64,
                            'num_layers': 2,
                            'dropout': 0.2,
                            'learning_rate': 0.001,
                            'epochs': 50,
                            'batch_size': 32,
                            'sequence_length': 20,
                        },
                        features=['ma', 'macd', 'rsi', 'boll'],
                        feature_config={},
                        target='next_day_return',
                        stock_codes=['600519'],
                        status='draft',
                    ),
                    UserModel(
                        user_id=admin.id,
                        name='[Demo] 银行股方向判断(XGBoost)',
                        model_type='xgboost',
                        model_config={
                            'n_estimators': 100,
                            'max_depth': 5,
                            'learning_rate': 0.1,
                        },
                        features=['ma', 'macd', 'rsi', 'boll', 'kdj'],
                        feature_config={},
                        target='next_day_direction',
                        stock_codes=['000001'],
                        status='draft',
                    ),
                ]
                for model in demo_models:
                    db.add(model)
                db.commit()
                print(f"  [种子] 已创建{len(demo_models)}个Demo模型")

        print("[OK] 种子数据初始化完成")
    except Exception as e:
        db.rollback()
        print(f"[WARN] 种子数据初始化失败: {e}")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    setup_logging()
    print(f"[启动] {settings.APP_NAME} v{settings.APP_VERSION}")

    # 创建必要目录
    os.makedirs(settings.DATA_DIR, exist_ok=True)
    os.makedirs(settings.MODEL_DIR, exist_ok=True)
    os.makedirs(settings.LOG_DIR, exist_ok=True)

    # 生产环境配置校验
    settings.validate_production()

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

    # 种子数据初始化（在股票池同步之后执行）
    try:
        _ensure_seed_data()
    except Exception as e:
        print(f"[WARN] 种子数据初始化失败: {e}")

    asyncio.create_task(market_data_pusher(ws_manager))
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

    cors_origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
    if settings.DEBUG:
        cors_origins.append("*")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
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
