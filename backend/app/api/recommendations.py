"""
智能推荐 API

基于用户历史行为和社区热度，推荐可能感兴趣的股票和模型配置。
推荐策略：
- 股票推荐：排除用户已关注的股票，按社区预测热度排序
- 模型推荐：找到预测方向相似的用户，统计其常用模型配置
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.user_model import UserModel
from app.models.prediction_share import PredictionShare

router = APIRouter(prefix="/recommendations", tags=["智能推荐"])


@router.get("/stocks")
async def recommend_stocks(
    limit: int = Query(10, ge=1, le=30),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """基于用户历史预测和模型，推荐可能感兴趣的股票"""
    # 收集用户已使用的股票代码，避免重复推荐
    user_models = db.query(UserModel).filter(UserModel.user_id == current_user.id).all()
    user_predictions = db.query(PredictionShare).filter(PredictionShare.user_id == current_user.id).all()

    used_codes = set()
    for m in user_models:
        if m.stock_codes:
            codes = m.stock_codes.split(",") if isinstance(m.stock_codes, str) else m.stock_codes
            used_codes.update(codes)
    for p in user_predictions:
        if p.stock_code:
            used_codes.add(p.stock_code)

    # 按社区预测热度排序，排除用户已关注的股票
    popular = (
        db.query(
            PredictionShare.stock_code,
            func.count(PredictionShare.id).label("cnt"),
        )
        .filter(
            PredictionShare.is_published == True,
            ~PredictionShare.stock_code.in_(used_codes) if used_codes else True,
        )
        .group_by(PredictionShare.stock_code)
        .order_by(func.count(PredictionShare.id).desc())
        .limit(limit)
        .all()
    )

    from app.services.data_service import DataService

    ds = DataService(db)
    results = []
    for code, cnt in popular:
        try:
            info = ds.get_stock_by_code(code)
            results.append(
                {
                    "stock_code": code,
                    "stock_name": info.name if info else code,
                    "prediction_count": cnt,
                    "reason": f"社区热门 · {cnt}次预测",
                }
            )
        except Exception:
            results.append(
                {
                    "stock_code": code,
                    "stock_name": code,
                    "prediction_count": cnt,
                    "reason": f"社区热门 · {cnt}次预测",
                }
            )

    return {"recommendations": results}


@router.get("/models")
async def recommend_models(
    limit: int = Query(5, ge=1, le=20),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """推荐相似用户使用的模型配置"""
    # 分析当前用户的预测方向偏好
    user_predictions = db.query(PredictionShare).filter(
        PredictionShare.user_id == current_user.id,
        PredictionShare.is_published == True,
    ).all()

    from collections import Counter

    user_directions = Counter(p.direction for p in user_predictions if p.direction)

    # 找到预测方向相似的活跃用户
    similar_users = (
        db.query(PredictionShare.user_id)
        .filter(
            PredictionShare.is_published == True,
            PredictionShare.user_id != current_user.id,
            PredictionShare.direction.in_([d for d, _ in user_directions.most_common(3)]),
        )
        .distinct()
        .limit(20)
        .all()
    )

    similar_user_ids = [u[0] for u in similar_users]

    # 统计相似用户常用的模型类型+目标组合
    popular_models = (
        db.query(
            UserModel.model_type,
            UserModel.target,
            func.count(UserModel.id).label("cnt"),
        )
        .filter(
            UserModel.user_id.in_(similar_user_ids),
            UserModel.status == "completed",
        )
        .group_by(UserModel.model_type, UserModel.target)
        .order_by(func.count(UserModel.id).desc())
        .limit(limit)
        .all()
    )

    results = []
    for mtype, target, cnt in popular_models:
        results.append(
            {
                "model_type": mtype,
                "target": target,
                "count": cnt,
                "reason": f"相似用户偏好 · {mtype} + {target}",
            }
        )

    return {"recommendations": results}
