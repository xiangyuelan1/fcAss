"""
API路由模块
"""
from fastapi import APIRouter
from app.api import auth, data, features, models, training, backtest, payment, prediction, admin, community, pk, points, messages, guide, watchlist, daily_guess, social, ensemble, signals, leaderboard, recommendations, paper_trading

api_router = APIRouter(prefix="/api")

api_router.include_router(auth.router, prefix="/auth", tags=["认证"])
api_router.include_router(data.router, prefix="/data", tags=["数据管理"])
api_router.include_router(features.router, prefix="/features", tags=["特征工程"])
api_router.include_router(models.router, prefix="/models", tags=["模型管理"])
api_router.include_router(training.router, prefix="/training", tags=["训练任务"])
api_router.include_router(backtest.router, prefix="/backtest", tags=["回测分析"])
api_router.include_router(prediction.router, prefix="/prediction", tags=["智能预测"])
api_router.include_router(payment.router, prefix="/payment", tags=["支付管理"])
api_router.include_router(admin.router, prefix="/admin", tags=["管理员"])
api_router.include_router(community.router, prefix="/community", tags=["社区"])
api_router.include_router(pk.router, prefix="/pk", tags=["PK竞技"])
api_router.include_router(points.router, prefix="/points", tags=["积分系统"])
api_router.include_router(messages.router, prefix="/messages", tags=["站内信"])
api_router.include_router(guide.router, prefix="/guide", tags=["用户引导"])
api_router.include_router(watchlist.router, prefix="/watchlists", tags=["自选股"])
api_router.include_router(daily_guess.router, prefix="/daily-guess", tags=["每日一猜"])
api_router.include_router(social.router, prefix="/social", tags=["社交"])
api_router.include_router(ensemble.router, prefix="/ensemble", tags=["模型组合"])
api_router.include_router(signals.router, prefix="/signals", tags=["交易信号"])
api_router.include_router(leaderboard.router, tags=["排行榜"])
api_router.include_router(recommendations.router, tags=["智能推荐"])
api_router.include_router(paper_trading.router, tags=["模拟盘"])
