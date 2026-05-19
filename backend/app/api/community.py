from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from app.core.database import get_db
from app.auth import get_current_active_user, require_admin, optional_get_current_active_user
from app.models.user import User as UserModel
from app.models.community import CommunityModel, CommunitySignal, CommunityLike, UserPoints, PointTransaction
from app.models.user_model import UserModel as UserORMModel
from app.models.training import TrainingTask
from app.services.training_service import ModelCheckpoint, TORCH_AVAILABLE
from app.services.feature_service import FeatureService
from app.services.data_service import DataService
from app.services.backtest_service import BacktestService
from app.api.prediction import _do_predict, _prediction_to_label
from sqlalchemy import func, desc

router = APIRouter()


class PublishModelRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    model_id: int
    description: Optional[str] = None
    visibility: str = "public"


class CommunityPredictRequest(BaseModel):
    stock_code: str
    days: int = 1


class CommunityBacktestRequest(BaseModel):
    stock_code: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    initial_capital: float = 100000


class PublishSignalRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    community_model_id: int
    stock_code: str
    direction: str
    prediction_value: Optional[float] = None
    confidence: Optional[float] = None
    prediction_date: str


def ensure_user_points(db: Session, user_id: int) -> UserPoints:
    points = db.query(UserPoints).filter(UserPoints.user_id == user_id).first()
    if not points:
        points = UserPoints(user_id=user_id, total_points=0, level=1)
        db.add(points)
        db.flush()
    return points


def add_points(db: Session, user_id: int, action: str, points: int,
               target_type: Optional[str] = None, target_id: Optional[int] = None,
               description: str = "") -> PointTransaction:
    user_points = ensure_user_points(db, user_id)
    user_points.total_points += points
    user_points.level = max(1, user_points.total_points // 100 + 1)
    transaction = PointTransaction(
        user_id=user_id,
        action=action,
        points=points,
        target_type=target_type,
        target_id=target_id,
        description=description,
    )
    db.add(transaction)
    db.flush()
    return transaction


@router.post("/models/publish")
async def publish_model(
    request: PublishModelRequest,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    user_model = db.query(UserORMModel).filter(
        UserORMModel.id == request.model_id,
        UserORMModel.user_id == current_user.id,
    ).first()
    if not user_model:
        raise HTTPException(status_code=404, detail="模型不存在或不属于当前用户")

    existing = db.query(CommunityModel).filter(
        CommunityModel.source_model_id == request.model_id,
        CommunityModel.is_active == True,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="该模型已发布到社区")

    latest_task = db.query(TrainingTask).filter(
        TrainingTask.model_id == request.model_id,
        TrainingTask.status == 'completed',
    ).order_by(desc(TrainingTask.created_at)).first()

    community_model = CommunityModel(
        user_id=current_user.id,
        source_model_id=user_model.id,
        name=user_model.name,
        description=request.description or user_model.description,
        model_type=user_model.model_type,
        model_config=user_model.model_config,
        features=user_model.features,
        feature_config=user_model.feature_config or {},
        target=user_model.target,
        target_config=user_model.target_config or {},
        stock_codes=user_model.stock_codes or [],
        train_date_range=user_model.train_date_range,
        metrics=latest_task.metrics if latest_task else None,
        visibility=request.visibility,
    )
    db.add(community_model)
    db.flush()

    add_points(db, current_user.id, "publish_model", 10,
               target_type="community_model", target_id=community_model.id,
               description="发布模型到社区")
    db.commit()
    db.refresh(community_model)
    return community_model.to_dict()


@router.post("/models/{model_id}/unpublish")
async def unpublish_model(
    model_id: int,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    community_model = db.query(CommunityModel).filter(CommunityModel.id == model_id).first()
    if not community_model:
        raise HTTPException(status_code=404, detail="社区模型不存在")
    if community_model.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="仅作者可下架模型")
    community_model.is_active = False
    db.commit()
    return {"success": True, "message": "模型已下架"}


@router.get("/models")
async def get_community_models(
    search: Optional[str] = None,
    model_type: Optional[str] = None,
    sort_by: Optional[str] = "newest",
    user_id: Optional[int] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: Optional[UserModel] = Depends(optional_get_current_active_user),
    db: Session = Depends(get_db),
):
    query = db.query(CommunityModel).filter(CommunityModel.is_active == True)

    if search:
        query = query.filter(CommunityModel.name.ilike(f"%{search}%"))
    if model_type:
        query = query.filter(CommunityModel.model_type == model_type)
    if user_id:
        query = query.filter(CommunityModel.user_id == user_id)

    # visibility 过滤：public 所有人可见，private 仅作者可见，link 不在列表中显示
    if current_user:
        query = query.filter(
            (CommunityModel.visibility == "public") |
            ((CommunityModel.visibility == "private") & (CommunityModel.user_id == current_user.id))
        )
    else:
        query = query.filter(CommunityModel.visibility == "public")

    if sort_by == "likes":
        query = query.order_by(desc(CommunityModel.likes_count))
    elif sort_by == "clones":
        query = query.order_by(desc(CommunityModel.clones_count))
    else:
        query = query.order_by(desc(CommunityModel.created_at))

    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()

    result = []
    for m in items:
        d = m.to_dict()
        author = db.query(UserModel).filter(UserModel.id == m.user_id).first()
        d["author"] = {
            "id": author.id,
            "username": author.username,
        } if author else None
        result.append(d)

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": result,
    }


@router.get("/models/{model_id}")
async def get_community_model_detail(
    model_id: int,
    current_user: Optional[UserModel] = Depends(optional_get_current_active_user),
    db: Session = Depends(get_db),
):
    community_model = db.query(CommunityModel).filter(CommunityModel.id == model_id).first()
    if not community_model:
        raise HTTPException(status_code=404, detail="社区模型不存在")

    # visibility 访问控制
    vis = community_model.visibility or "public"
    if vis == "private":
        if not current_user or community_model.user_id != current_user.id:
            raise HTTPException(status_code=404, detail="社区模型不存在")
    # link: 通过 ID 直接访问时可见（无需额外限制）
    # public: 所有人可见

    d = community_model.to_dict()
    author = db.query(UserModel).filter(UserModel.id == community_model.user_id).first()
    d["author"] = {
        "id": author.id,
        "username": author.username,
    } if author else None
    return d


@router.post("/models/{model_id}/like")
async def toggle_like_model(
    model_id: int,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    community_model = db.query(CommunityModel).filter(
        CommunityModel.id == model_id,
        CommunityModel.is_active == True,
    ).first()
    if not community_model:
        raise HTTPException(status_code=404, detail="社区模型不存在")

    existing = db.query(CommunityLike).filter(
        CommunityLike.user_id == current_user.id,
        CommunityLike.community_model_id == model_id,
    ).first()

    if existing:
        db.delete(existing)
        community_model.likes_count = max(0, community_model.likes_count - 1)
        add_points(db, community_model.user_id, "unlike_model", -2,
                   target_type="community_model", target_id=model_id,
                   description="模型被取消点赞")
        db.commit()
        return {"success": True, "liked": False, "likes_count": community_model.likes_count}
    else:
        like = CommunityLike(
            user_id=current_user.id,
            community_model_id=model_id,
        )
        db.add(like)
        community_model.likes_count += 1
        add_points(db, community_model.user_id, "like_model", 2,
                   target_type="community_model", target_id=model_id,
                   description="模型被点赞")
        db.commit()
        return {"success": True, "liked": True, "likes_count": community_model.likes_count}


@router.post("/models/{model_id}/clone")
async def clone_community_model(
    model_id: int,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    community_model = db.query(CommunityModel).filter(
        CommunityModel.id == model_id,
        CommunityModel.is_active == True,
    ).first()
    if not community_model:
        raise HTTPException(status_code=404, detail="社区模型不存在")

    if community_model.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="不能克隆自己的模型")

    new_model = UserORMModel(
        user_id=current_user.id,
        name=f"{community_model.name} (克隆)",
        description=community_model.description,
        model_type=community_model.model_type,
        model_config=community_model.model_config,
        features=community_model.features,
        feature_config=community_model.feature_config or {},
        target=community_model.target,
        target_config=community_model.target_config or {},
        stock_codes=community_model.stock_codes or [],
        train_date_range=community_model.train_date_range,
        status="draft",
    )
    db.add(new_model)

    community_model.clones_count += 1
    add_points(db, community_model.user_id, "clone_model", 5,
               target_type="community_model", target_id=model_id,
               description="模型被克隆")
    db.commit()
    db.refresh(new_model)
    return {
        "success": True,
        "message": "模型已克隆到您的模型列表",
        "model": new_model.to_dict(),
    }


@router.post("/signals/publish")
async def publish_signal(
    request: PublishSignalRequest,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    community_model = db.query(CommunityModel).filter(
        CommunityModel.id == request.community_model_id,
        CommunityModel.is_active == True,
    ).first()
    if not community_model:
        raise HTTPException(status_code=404, detail="社区模型不存在")

    if request.direction not in ("up", "down", "flat"):
        raise HTTPException(status_code=400, detail="direction 必须为 up/down/flat")

    signal = CommunitySignal(
        user_id=current_user.id,
        community_model_id=request.community_model_id,
        stock_code=request.stock_code,
        direction=request.direction,
        prediction_value=request.prediction_value,
        confidence=request.confidence,
        prediction_date=request.prediction_date,
    )
    db.add(signal)
    add_points(db, current_user.id, "publish_signal", 3,
               target_type="community_signal", target_id=signal.id,
               description="发布预测信号")
    db.commit()
    db.refresh(signal)
    return signal.to_dict()


@router.get("/signals")
async def get_signals(
    stock_code: Optional[str] = None,
    direction: Optional[str] = None,
    user_id: Optional[int] = None,
    community_model_id: Optional[int] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = db.query(CommunitySignal)

    if stock_code:
        query = query.filter(CommunitySignal.stock_code == stock_code)
    if direction:
        query = query.filter(CommunitySignal.direction == direction)
    if user_id:
        query = query.filter(CommunitySignal.user_id == user_id)
    if community_model_id:
        query = query.filter(CommunitySignal.community_model_id == community_model_id)

    query = query.order_by(desc(CommunitySignal.created_at))
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()

    result = []
    for s in items:
        d = s.to_dict()
        author = db.query(UserModel).filter(UserModel.id == s.user_id).first()
        d["author"] = {
            "id": author.id,
            "username": author.username,
        } if author else None
        result.append(d)

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": result,
    }


@router.post("/signals/{signal_id}/like")
async def toggle_like_signal(
    signal_id: int,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    signal = db.query(CommunitySignal).filter(CommunitySignal.id == signal_id).first()
    if not signal:
        raise HTTPException(status_code=404, detail="信号不存在")

    existing = db.query(CommunityLike).filter(
        CommunityLike.user_id == current_user.id,
        CommunityLike.community_signal_id == signal_id,
    ).first()

    if existing:
        db.delete(existing)
        signal.likes_count = max(0, signal.likes_count - 1)
        db.commit()
        return {"success": True, "liked": False, "likes_count": signal.likes_count}
    else:
        like = CommunityLike(
            user_id=current_user.id,
            community_signal_id=signal_id,
        )
        db.add(like)
        signal.likes_count += 1
        db.commit()
        return {"success": True, "liked": True, "likes_count": signal.likes_count}


@router.get("/signals/my")
async def get_my_signals(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    query = db.query(CommunitySignal).filter(
        CommunitySignal.user_id == current_user.id
    ).order_by(desc(CommunitySignal.created_at))

    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [s.to_dict() for s in items],
    }


def _resolve_community_model_task(
    model_id: int, current_user: UserModel, db: Session
):
    """查找社区模型及其最新已完成训练任务，供预测/回测共用"""
    community_model = db.query(CommunityModel).filter(
        CommunityModel.id == model_id,
        CommunityModel.is_active == True,
    ).first()
    if not community_model:
        raise HTTPException(status_code=404, detail="社区模型不存在或已下架")

    # visibility 访问控制
    vis = community_model.visibility or "public"
    if vis == "private" and community_model.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="社区模型不存在")

    # 通过 source_model_id 找到原始 UserModel 的最新已完成训练任务
    latest_task = db.query(TrainingTask).filter(
        TrainingTask.model_id == community_model.source_model_id,
        TrainingTask.status == 'completed',
    ).order_by(desc(TrainingTask.created_at)).first()

    if not latest_task:
        raise HTTPException(status_code=400, detail="该社区模型尚无已完成的训练任务，无法执行操作")

    return community_model, latest_task


@router.post("/models/{model_id}/predict")
async def predict_with_community_model(
    model_id: int,
    request: CommunityPredictRequest,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """使用社区模型进行预测（不需要克隆，直接使用训练好的权重）"""
    community_model, latest_task = _resolve_community_model_task(model_id, current_user, db)

    # 加载模型检查点（同时获取feature_window）
    try:
        model, metrics, input_size, feature_window = ModelCheckpoint.load_checkpoint(latest_task.id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="模型检查点不存在，原作者可能已删除训练文件")
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))

    user_model = latest_task.user_model
    feature_service = FeatureService(db)
    data_service = DataService(db)

    # 确保股票数据存在
    stock_info = data_service.get_stock_by_code(request.stock_code)
    if not stock_info:
        try:
            result = data_service.fetch_stock_data(request.stock_code)
            if result['price_count'] == 0:
                raise HTTPException(status_code=400, detail=f"股票 {request.stock_code} 数据获取失败")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"股票 {request.stock_code} 数据获取失败: {str(e)}")

    # 计算特征
    df = feature_service.calculate_features(
        stock_code=request.stock_code,
        indicators=community_model.features,
        indicator_params=community_model.feature_config or {},
        limit=5000,
    )
    if df is None or df.empty:
        raise HTTPException(status_code=400, detail=f"股票 {request.stock_code} 无可用数据")

    exclude_cols = {'id', 'stock_code', 'open', 'high', 'low', 'close', 'volume', 'amount',
                    'change_pct', 'change_amount', 'adj_close'}
    feature_cols = [col for col in df.columns if col not in exclude_cols]
    if not feature_cols:
        raise HTTPException(status_code=400, detail="无可用特征列")
    # 维度校验：feature_window > 1 时，实际输入维度 = 特征列数 × 窗口天数
    if feature_window > 1:
        if len(feature_cols) * feature_window != input_size:
            raise HTTPException(
                status_code=400,
                detail=f"特征列数({len(feature_cols)})×窗口({feature_window})={len(feature_cols)*feature_window}与模型期望({input_size})不匹配",
            )
    else:
        if len(feature_cols) != input_size:
            raise HTTPException(
                status_code=400,
                detail=f"特征列数({len(feature_cols)})与模型期望({input_size})不匹配",
            )

    # 标准化
    df_features = df[feature_cols].copy()
    df_features = (df_features - df_features.mean()) / df_features.std()

    # 执行预测
    try:
        prediction = _do_predict(model, community_model.model_type, community_model.model_config, df_features, input_size, feature_window)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"预测执行失败: {str(e)}")

    prediction_label = _prediction_to_label(prediction, community_model.target)

    # 获取最新行情
    latest_row = df.iloc[-1]
    latest_data = {
        'date': latest_row.name.strftime('%Y-%m-%d') if hasattr(latest_row.name, 'strftime') else str(latest_row.name),
        'close': float(latest_row['close']) if latest_row['close'] is not None else None,
        'volume': int(latest_row['volume']) if latest_row['volume'] is not None else None,
    }

    predict_date = (datetime.now() + timedelta(days=request.days)).strftime('%Y-%m-%d')

    return {
        "task_id": latest_task.id,
        "community_model_id": model_id,
        "stock_code": request.stock_code,
        "predict_date": predict_date,
        "prediction": round(float(prediction), 6),
        "prediction_label": prediction_label,
        "latest_data": latest_data,
    }


@router.post("/models/{model_id}/backtest")
async def backtest_community_model(
    model_id: int,
    request: CommunityBacktestRequest,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """使用社区模型进行回测"""
    community_model, latest_task = _resolve_community_model_task(model_id, current_user, db)

    # 默认回测区间：训练结束日期至今
    start_date = request.start_date
    end_date = request.end_date
    if not start_date:
        train_range = community_model.train_date_range or {}
        start_date = train_range.get("end", "2024-01-01")
    if not end_date:
        end_date = datetime.now().strftime("%Y-%m-%d")

    # 创建回测任务（关联到原始训练任务）
    service = BacktestService(db)
    backtest = service.create_backtest(
        task_id=latest_task.id,
        start_date=start_date,
        end_date=end_date,
        initial_capital=request.initial_capital,
    )

    # 使用社区模型的配置和指定股票执行回测
    override_codes = [request.stock_code]
    try:
        service.run_backtest(backtest.id, override_codes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"回测执行失败: {str(e)}")

    # 重新获取结果
    backtest = service.get_result(backtest.id)
    result = backtest.to_dict() if backtest else {}
    result["community_model_id"] = model_id
    return result
