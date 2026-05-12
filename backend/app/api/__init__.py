"""
API路由模块
"""
from fastapi import APIRouter
from app.api import auth, data, features, models, training, backtest, payment, prediction

api_router = APIRouter(prefix="/api")

api_router.include_router(auth.router, prefix="/auth", tags=["认证"])
api_router.include_router(data.router, prefix="/data", tags=["数据管理"])
api_router.include_router(features.router, prefix="/features", tags=["特征工程"])
api_router.include_router(models.router, prefix="/models", tags=["模型管理"])
api_router.include_router(training.router, prefix="/training", tags=["训练任务"])
api_router.include_router(backtest.router, prefix="/backtest", tags=["回测分析"])
api_router.include_router(prediction.router, prefix="/prediction", tags=["智能预测"])
api_router.include_router(payment.router, prefix="/payment", tags=["支付管理"])
