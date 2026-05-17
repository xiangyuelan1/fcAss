"""
FastAPI应用主入口
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.core.config import settings
from app.core.database import init_db, Base
from app.core.logging import setup_logging
from app.models.stock import Stock, StockPrice
from app.models.user_model import UserModel
from app.models.user import User
from app.models.training import TrainingTask, BacktestResult
from app.models.payment import PaymentConfig, PaymentOrder
from app.models.user_prefs import UserStockPrefs, UserModelPrefs
from app.models.system_config import SystemConfig
from app.api import api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    setup_logging()
    print(f"[启动] {settings.APP_NAME} v{settings.APP_VERSION}")
    init_db()
    print("[OK] 数据库初始化完成")

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

    return app


app = create_app()


@app.get("/")
async def root():
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/docs",
        "api": "/api"
    }


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "version": settings.APP_VERSION
    }
