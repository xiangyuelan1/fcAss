"""
预测API - 使用已训练模型进行股价预测
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime, timedelta

from app.core.database import get_db
from app.services.training_service import ModelCheckpoint, TORCH_AVAILABLE
from app.services.feature_service import FeatureService
from app.services.data_service import DataService
from app.models.training import TrainingTask
from app.auth import get_current_active_user
from app.models.user import User as UserModel

router = APIRouter()


def _verify_task_ownership(task: TrainingTask, current_user: UserModel):
    """验证训练任务是否属于当前用户，管理员可访问所有任务"""
    if current_user.is_admin:
        return
    if task.user_model is None or task.user_model.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权访问该训练任务")


class PredictRequest(BaseModel):
    """预测请求"""
    task_id: int = Field(..., description="已完成的训练任务ID")
    stock_code: str = Field(..., description="预测股票代码")
    days: int = Field(default=1, description="预测天数（1=次日，5=5日）")


class PredictResponse(BaseModel):
    """预测响应"""
    task_id: int
    stock_code: str
    predict_date: str
    prediction: float
    prediction_label: str
    confidence: Optional[float] = None
    predicted_price: Optional[float] = None
    predicted_change_pct: Optional[float] = None
    price_range_low: Optional[float] = None
    price_range_high: Optional[float] = None
    latest_data: Optional[Dict[str, Any]] = None
    predicted_volatility: Optional[float] = None
    predicted_volume_change: Optional[float] = None
    target_type: Optional[str] = None
    probability_up: Optional[float] = None
    probability_down: Optional[float] = None
    daily_avg_change_pct: Optional[float] = None


class BatchPredictRequest(BaseModel):
    """批量预测请求 - 对多只股票同时预测"""
    task_id: int = Field(..., description="已完成的训练任务ID")
    stock_codes: List[str] = Field(..., description="预测股票代码列表")


@router.post("/predict", response_model=PredictResponse)
async def predict(
    request: PredictRequest,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """使用已训练模型进行单只股票预测，需验证任务所有权
    
    流程：验证权限 → 加载模型 → 获取最新数据 → 计算特征 → 模型推理 → 返回预测结果
    """
    task = db.query(TrainingTask).filter(TrainingTask.id == request.task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"训练任务 {request.task_id} 不存在")
    _verify_task_ownership(task, current_user)

    if task.status != 'completed':
        raise HTTPException(status_code=400, detail=f"训练任务状态为 {task.status}，仅已完成任务可预测")

    user_model = task.user_model
    feature_service = FeatureService(db)
    data_service = DataService(db)

    # 加载模型
    try:
        model, metrics, input_size = ModelCheckpoint.load_checkpoint(task.id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="模型检查点不存在，请先完成模型训练")
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))

    # 检查该股票是否有数据，没有则自动获取
    stock_info = data_service.get_stock_by_code(request.stock_code)
    if not stock_info:
        try:
            result = data_service.fetch_stock_data(request.stock_code)
            if result['price_count'] == 0:
                raise HTTPException(status_code=400, detail=f"股票 {request.stock_code} 数据获取失败，请检查代码是否正确")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"股票 {request.stock_code} 数据获取失败: {str(e)}")

    # 获取最新数据并计算特征
    df = feature_service.calculate_features(
        stock_code=request.stock_code,
        indicators=user_model.features,
        indicator_params=user_model.feature_config or {},
        limit=5000
    )

    if df is None or df.empty:
        raise HTTPException(status_code=400, detail=f"股票 {request.stock_code} 无可用数据，请先在数据管理中获取")

    feature_cols = [col for col in df.columns if col not in {'id', 'stock_code', 'open', 'high', 'low', 'close', 'volume', 'amount',
                            'change_pct', 'change_amount', 'adj_close'}]
    if not feature_cols:
        raise HTTPException(status_code=400, detail="无可用特征列")

    if len(feature_cols) != input_size:
        raise HTTPException(
            status_code=400,
            detail=f"特征列数({len(feature_cols)})与模型期望({input_size})不匹配，请确保使用相同配置"
        )

    # 标准化（使用全量数据的统计量）
    df_features = df[feature_cols].copy()
    df_features = (df_features - df_features.mean()) / df_features.std()

    model_type = user_model.model_type
    model_config = user_model.model_config or {}
    target = user_model.target

    try:
        prediction = _do_predict(model, model_type, model_config, df_features, input_size)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"预测执行失败: {str(e)}")

    # 生成预测标签
    prediction_label = _prediction_to_label(prediction, target)

    # 获取最新行情数据
    latest_row = df.iloc[-1]
    latest_close = float(latest_row['close']) if latest_row['close'] is not None else None
    latest_data = {
        'date': latest_row.name.strftime('%Y-%m-%d') if hasattr(latest_row.name, 'strftime') else str(latest_row.name),
        'close': latest_close,
        'volume': int(latest_row['volume']) if latest_row['volume'] is not None else None,
    }

    # 计算置信度：分类模型用预测概率，回归模型用 |prediction| 映射
    confidence = _compute_confidence(prediction, target)

    # 根据 target 类型推导预测涨跌幅
    predicted_change_pct = _compute_predicted_change_pct(prediction, target)

    # 计算预测目标价格
    predicted_price = None
    if latest_close and predicted_change_pct is not None:
        predicted_price = round(latest_close * (1 + predicted_change_pct / 100), 2)

    # 基于置信度生成价格区间（置信度越高区间越窄）
    price_range_low = None
    price_range_high = None
    if latest_close and predicted_change_pct is not None:
        # 置信度 1.0 → 波动 ±0.5%，置信度 0.5 → 波动 ±3%，置信度 0 → 波动 ±5%
        spread_pct = 5.0 * (1 - confidence) if confidence is not None else 5.0
        price_range_low = round(latest_close * (1 + predicted_change_pct / 100 - spread_pct / 100), 2)
        price_range_high = round(latest_close * (1 + predicted_change_pct / 100 + spread_pct / 100), 2)

    predict_date = (datetime.now() + timedelta(days=request.days)).strftime('%Y-%m-%d')

    multi_features = _compute_multi_features(prediction, target, df, latest_close)

    return PredictResponse(
        task_id=request.task_id,
        stock_code=request.stock_code,
        predict_date=predict_date,
        prediction=round(float(prediction), 6),
        prediction_label=prediction_label,
        confidence=round(confidence, 4) if confidence is not None else None,
        predicted_price=predicted_price,
        predicted_change_pct=round(predicted_change_pct, 4) if predicted_change_pct is not None else None,
        price_range_low=price_range_low,
        price_range_high=price_range_high,
        latest_data=latest_data,
        predicted_volatility=multi_features.get('predicted_volatility'),
        predicted_volume_change=multi_features.get('predicted_volume_change'),
        target_type=multi_features.get('target_type'),
        probability_up=multi_features.get('probability_up'),
        probability_down=multi_features.get('probability_down'),
        daily_avg_change_pct=multi_features.get('daily_avg_change_pct'),
    )


@router.post("/batch-predict")
async def batch_predict(
    request: BatchPredictRequest,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """批量预测多只股票，需验证任务所有权"""
    task = db.query(TrainingTask).filter(TrainingTask.id == request.task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"训练任务 {request.task_id} 不存在")
    _verify_task_ownership(task, current_user)

    if task.status != 'completed':
        raise HTTPException(status_code=400, detail=f"训练任务状态为 {task.status}，仅已完成任务可预测")

    user_model = task.user_model
    feature_service = FeatureService(db)

    try:
        model, metrics, input_size = ModelCheckpoint.load_checkpoint(task.id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="模型检查点不存在，请先完成模型训练")
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))

    model_type = user_model.model_type
    model_config = user_model.model_config or {}
    target = user_model.target

    results = []
    for code in request.stock_codes:
        try:
            df = feature_service.calculate_features(
                stock_code=code,
                indicators=user_model.features,
                indicator_params=user_model.feature_config or {},
                limit=5000
            )
            if df is None or df.empty:
                results.append({'stock_code': code, 'error': '无可用数据'})
                continue

            feature_cols = [col for col in df.columns if col not in {'id', 'stock_code', 'open', 'high', 'low', 'close', 'volume', 'amount',
                            'change_pct', 'change_amount', 'adj_close'}]
            if not feature_cols or len(feature_cols) != input_size:
                results.append({'stock_code': code, 'error': f'特征列数不匹配({len(feature_cols)} vs {input_size})'})
                continue

            df_features = df[feature_cols].copy()
            df_features = (df_features - df_features.mean()) / df_features.std()

            prediction = _do_predict(model, model_type, model_config, df_features, input_size)
            prediction_label = _prediction_to_label(prediction, target)

            latest_row = df.iloc[-1]
            results.append({
                'stock_code': code,
                'prediction': round(float(prediction), 6),
                'prediction_label': prediction_label,
                'latest_close': float(latest_row['close']) if latest_row['close'] is not None else None,
            })
        except Exception as e:
            results.append({'stock_code': code, 'error': str(e)})

    return {'task_id': request.task_id, 'predictions': results}


@router.get("/tasks/{task_id}/predictable-stocks")
async def get_predictable_stocks(
    task_id: int,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """获取指定训练任务可预测的股票列表，需验证任务所有权"""
    task = db.query(TrainingTask).filter(TrainingTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"训练任务 {task_id} 不存在")
    _verify_task_ownership(task, current_user)

    user_model = task.user_model
    data_service = DataService(db)

    stocks_info = []
    for code in user_model.stock_codes:
        stock = data_service.get_stock_by_code(code)
        stocks_info.append({
            'code': code,
            'name': stock.name if stock else code,
        })

    return {'stocks': stocks_info}


def _do_predict(model, model_type: str, model_config: dict, df_features, input_size: int) -> float:
    """执行模型预测，返回原始预测值"""
    import numpy as np

    if model_type in ['lstm', 'gru']:
        if not TORCH_AVAILABLE:
            raise RuntimeError("PyTorch未安装，无法使用LSTM/GRU模型预测")
        import torch
        seq_len = model_config.get('sequence_length', 20)
        if len(df_features) < seq_len:
            raise ValueError(f"数据量不足，需要至少{seq_len}条记录构建序列")
        seq_data = df_features.iloc[-seq_len:].values.reshape(1, seq_len, -1)
        tensor = torch.FloatTensor(seq_data)
        with torch.no_grad():
            prediction = model(tensor).item()
    elif model_type == 'mlp':
        if not TORCH_AVAILABLE:
            raise RuntimeError("PyTorch未安装，无法使用MLP模型预测")
        import torch
        features = df_features.iloc[-1].values.reshape(1, -1)
        tensor = torch.FloatTensor(features)
        with torch.no_grad():
            prediction = model(tensor).item()
    else:
        # sklearn模型
        features = df_features.iloc[-1].values.reshape(1, -1)
        prediction = model.predict(features)[0]

    return float(prediction)


def _prediction_to_label(prediction: float, target: str) -> str:
    """将原始预测值转换为可读标签"""
    if target == 'next_day_direction':
        return '看涨' if prediction > 0.5 else '看跌'
    elif target == 'next_day_return' or target == 'price_change_5d':
        if prediction > 0.005:
            return '看涨'
        elif prediction < -0.005:
            return '看跌'
        else:
            return '震荡'
    else:
        return '看涨' if prediction > 0 else '看跌'


def _compute_confidence(prediction: float, target: str) -> float:
    """根据预测值和目标类型计算置信度

    分类模型（next_day_direction）：prediction 本身是概率值，直接用距离 0.5 的程度
    回归模型（next_day_return/price_change_5d）：用 |prediction| 映射到 0-1
    """
    if target == 'next_day_direction':
        # 分类模型：prediction 是概率，距 0.5 越远置信度越高
        return abs(prediction - 0.5) * 2
    else:
        # 回归模型：|prediction| 越大置信度越高，典型收益率 ±0.05
        abs_val = abs(prediction)
        return min(abs_val / 0.05, 1.0)


def _compute_predicted_change_pct(prediction: float, target: str) -> Optional[float]:
    """根据 target 类型将原始预测值转换为涨跌幅百分比

    next_day_direction: 概率值 → 涨跌幅（0.5=0%, 1.0=+5%, 0.0=-5%）
    next_day_return: 原始收益率 → 百分比
    price_change_5d: 5日变化率 → 百分比
    """
    if target == 'next_day_direction':
        return (prediction - 0.5) * 10
    elif target == 'next_day_return':
        return prediction * 100
    elif target == 'price_change_5d':
        return prediction * 100
    else:
        return prediction * 100


def _compute_multi_features(prediction: float, target: str, df, latest_close: Optional[float]) -> Dict[str, Any]:
    """根据预测值和目标类型推导多维数据

    multi_feature_next_day: 基于近期波动率和成交量变化趋势推导
    next_day_direction: 拆分上涨/下跌概率
    price_change_5d: 计算日均变化率
    """
    result: Dict[str, Any] = {'target_type': target}

    if target == 'multi_feature_next_day':
        recent_returns = df['close'].pct_change().tail(20).dropna()
        if len(recent_returns) > 0:
            base_volatility = float(recent_returns.std())
            result['predicted_volatility'] = round(base_volatility * (1 + abs(prediction) * 5), 6)
        if 'volume' in df.columns:
            recent_vol_change = df['volume'].pct_change().tail(20).dropna()
            if len(recent_vol_change) > 0:
                result['predicted_volume_change'] = round(float(recent_vol_change.mean() + prediction * 2), 6)

    elif target == 'next_day_direction':
        result['probability_up'] = round(float(prediction), 4)
        result['probability_down'] = round(float(1 - prediction), 4)

    elif target == 'price_change_5d':
        if prediction is not None:
            result['daily_avg_change_pct'] = round(float(prediction * 100 / 5), 4)

    return result
