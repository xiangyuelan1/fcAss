"""
FastAPI应用主入口
"""
from fastapi import FastAPI
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
from app.api import api_router
from app.auth import get_password_hash


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


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    setup_logging()
    print(f"[启动] {settings.APP_NAME} v{settings.APP_VERSION}")
    init_db()
    print("[OK] 数据库初始化完成")
    _migrate_db()
    _ensure_default_admin()
    _sync_stock_pool_on_startup()

    yield

    print("[关闭] 应用关闭")


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
