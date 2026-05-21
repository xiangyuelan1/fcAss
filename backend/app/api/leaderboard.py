"""
模型排行榜 API

提供模型准确率排行和用户活跃度排行，
基于已发布的预测分享数据统计。
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Optional

from app.core.database import get_db
from app.models.prediction_share import PredictionShare
from app.models.user import User

router = APIRouter(prefix="/leaderboard", tags=["排行榜"])


def _period_start(period: str) -> datetime:
    """根据时间段标识计算起始时间"""
    now = datetime.now()
    if period == 'week':
        return now - timedelta(days=7)
    if period == 'month':
        return now - timedelta(days=30)
    return datetime(2020, 1, 1)


@router.get("/models")
async def model_leaderboard(
    period: str = Query('week', pattern='^(week|month|all)$'),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """模型排行榜 - 按预测准确率排序

    统计指定时间段内已发布预测的方向一致性，
    取多数方向占比作为准确率指标。
    """
    start = _period_start(period)

    shares = db.query(PredictionShare).filter(
        PredictionShare.is_published == True,
        PredictionShare.created_at >= start,
    ).all()

    model_stats: dict[int, dict] = {}
    for s in shares:
        mid = s.model_id
        if mid is None:
            continue
        if mid not in model_stats:
            model_stats[mid] = {
                'model_id': mid,
                'model_name': s.model_name,
                'model_type': s.model_type,
                'user_id': s.user_id,
                'total': 0,
                'up_count': 0,
                'down_count': 0,
            }
        model_stats[mid]['total'] += 1
        if s.direction == 'up':
            model_stats[mid]['up_count'] += 1
        elif s.direction == 'down':
            model_stats[mid]['down_count'] += 1

    # 批量查询关联用户，避免 N+1
    user_ids = {stats['user_id'] for stats in model_stats.values()}
    user_map: dict[int, User] = {}
    if user_ids:
        for u in db.query(User).filter(User.id.in_(user_ids)).all():
            user_map[u.id] = u

    results = []
    for mid, stats in model_stats.items():
        # 仅统计预测次数 >= 3 的模型，保证准确率有统计意义
        if stats['total'] < 3:
            continue
        user = user_map.get(stats['user_id'])
        stats['username'] = user.username if user else '未知'
        stats['nickname'] = getattr(user, 'nickname', None) or user.username if user else '未知'
        # 准确率 = 多数方向占比（方向一致性越高，说明模型判断越稳定）
        stats['accuracy'] = round(
            max(stats['up_count'], stats['down_count']) / stats['total'], 3
        ) if stats['total'] > 0 else 0
        results.append(stats)

    results.sort(key=lambda x: x['accuracy'], reverse=True)
    return {"leaderboard": results[:limit], "period": period}


@router.get("/users")
async def user_leaderboard(
    period: str = Query('week', pattern='^(week|month|all)$'),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """用户排行榜 - 按预测活跃度和模型多样性综合评分

    评分公式: 预测数 × 10 + 不同模型数 × 50
    """
    start = _period_start(period)

    shares = db.query(PredictionShare).filter(
        PredictionShare.is_published == True,
        PredictionShare.created_at >= start,
    ).all()

    user_stats: dict[int, dict] = {}
    for s in shares:
        uid = s.user_id
        if uid not in user_stats:
            user_stats[uid] = {
                'user_id': uid,
                'total_predictions': 0,
                'total_models': set(),
            }
        user_stats[uid]['total_predictions'] += 1
        if s.model_id:
            user_stats[uid]['total_models'].add(s.model_id)

    # 批量查询用户
    user_ids = set(user_stats.keys())
    user_map: dict[int, User] = {}
    if user_ids:
        for u in db.query(User).filter(User.id.in_(user_ids)).all():
            user_map[u.id] = u

    results = []
    for uid, stats in user_stats.items():
        user = user_map.get(uid)
        model_count = len(stats['total_models'])
        results.append({
            'user_id': uid,
            'username': user.username if user else '未知',
            'nickname': getattr(user, 'nickname', None) or user.username if user else '未知',
            'total_predictions': stats['total_predictions'],
            'total_models': model_count,
            'score': stats['total_predictions'] * 10 + model_count * 50,
        })

    results.sort(key=lambda x: x['score'], reverse=True)
    return {"leaderboard": results[:limit], "period": period}
