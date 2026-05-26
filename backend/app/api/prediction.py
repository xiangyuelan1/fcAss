"""
预测API - 使用已训练模型进行股价预测
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime, timedelta
import time

from app.core.database import get_db
from app.services.training_service import ModelCheckpoint, TORCH_AVAILABLE
from app.services.feature_service import FeatureService
from app.services.data_service import DataService
from app.models.training import TrainingTask
from app.models.prediction_share import PredictionShare
from app.auth import get_current_active_user
from app.models.user import User as UserModel

router = APIRouter()


def _ensure_stock_data(
    data_service: DataService,
    feature_service: FeatureService,
    stock_code: str,
    indicators: list,
    indicator_params: dict,
    feature_limit: int = 5000,
) -> "pd.DataFrame":
    """确保股票有足够的数据用于预测，自动获取和补充数据

    策略：
    1. 股票记录不存在 → fetch_stock_data 获取基础信息和历史价格
    2. 计算特征，若结果为空 → sync_stock_prices 补充最新价格后重试
    3. 仍为空 → fetch_stock_data 全量重新获取后重试
    4. 所有尝试均失败则抛出 HTTPException

    Returns:
        计算特征后的 DataFrame（保证非空）
    """
    stock_info = data_service.get_stock_by_code(stock_code)

    # 阶段1：股票记录不存在，先获取基础数据
    if not stock_info:
        try:
            result = data_service.fetch_stock_data(stock_code)
            if result.get('price_count', 0) == 0:
                raise HTTPException(
                    status_code=400,
                    detail=f"股票 {stock_code} 数据获取失败，请检查代码是否正确",
                )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"股票 {stock_code} 数据获取失败: {str(e)}",
            )

    # 阶段2：尝试计算特征
    df = feature_service.calculate_features(
        stock_code=stock_code,
        indicators=indicators,
        indicator_params=indicator_params,
        limit=feature_limit,
    )
    if df is not None and not df.empty:
        return df

    # 阶段3：特征为空，说明价格数据不足以计算指标，尝试同步最新价格
    try:
        data_service.sync_stock_prices(stock_code)
        time.sleep(2)
    except Exception:
        pass

    df = feature_service.calculate_features(
        stock_code=stock_code,
        indicators=indicators,
        indicator_params=indicator_params,
        limit=feature_limit,
    )
    if df is not None and not df.empty:
        return df

    # 阶段4：仍为空，全量重新获取
    try:
        data_service.fetch_stock_data(stock_code)
    except Exception:
        pass

    df = feature_service.calculate_features(
        stock_code=stock_code,
        indicators=indicators,
        indicator_params=indicator_params,
        limit=feature_limit,
    )
    if df is not None and not df.empty:
        return df

    raise HTTPException(
        status_code=400,
        detail=f"股票 {stock_code} 数据不足，已尝试自动获取。该股票可能为新上市或数据源暂不可用，请稍后重试或换一只股票",
    )


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
    direction_label: Optional[str] = None
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
    predicted_trend_days: Optional[int] = None
    predicted_trend_pct: Optional[float] = None
    trend_direction: Optional[str] = None
    predicted_weeks: Optional[float] = None
    gain_target_pct: Optional[float] = None
    predicted_open: Optional[float] = None
    predicted_high: Optional[float] = None
    predicted_low: Optional[float] = None


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
        model, metrics, input_size, feature_window = ModelCheckpoint.load_checkpoint(task.id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="模型检查点不存在，请先完成模型训练")
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))

    # 确保股票有足够数据（自动获取和补充），并计算特征
    df = _ensure_stock_data(
        data_service, feature_service, request.stock_code,
        user_model.features, user_model.feature_config or {},
    )

    feature_cols = [col for col in df.columns if col not in {'id', 'stock_code', 'open', 'high', 'low', 'close', 'volume', 'amount',
                            'change_pct', 'change_amount', 'adj_close'}]
    if not feature_cols:
        raise HTTPException(status_code=400, detail="无可用特征列")

    df_features = df[feature_cols].copy()
    df_features = (df_features - df_features.mean()) / df_features.std()

    model_type = user_model.model_type
    model_config = user_model.model_config or {}
    target = user_model.target

    if model_type in ['lstm', 'gru']:
        expected_feat_dim = input_size
    elif feature_window > 1:
        expected_feat_dim = input_size // feature_window
    else:
        expected_feat_dim = input_size

    if feature_window <= 1 and model_type not in ['lstm', 'gru']:
        if len(feature_cols) != input_size:
            raise HTTPException(
                status_code=400,
                detail=f"特征列数({len(feature_cols)})与模型期望({input_size})不匹配，请确保使用相同配置"
            )
    elif feature_window > 1:
        if len(feature_cols) * feature_window != input_size:
            raise HTTPException(
                status_code=400,
                detail=f"特征列数({len(feature_cols)})×窗口({feature_window})={len(feature_cols)*feature_window}与模型期望({input_size})不匹配，请确保使用相同配置"
            )

    try:
        prediction = _do_predict(model, model_type, model_config, df_features, input_size, feature_window)
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

    # 自动保存预测结果到数据库（is_published=False，非主动发布）
    try:
        stock_info = data_service.get_stock_by_code(request.stock_code)
        stock_name = stock_info.name if stock_info else None
        share = PredictionShare(
            user_id=current_user.id,
            task_id=request.task_id,
            model_id=user_model.id if user_model else None,
            model_name=user_model.name if user_model else None,
            model_type=user_model.model_type if user_model else None,
            stock_code=request.stock_code,
            stock_name=stock_name,
            target_type=target,
            direction=prediction_label,
            prediction_value=prediction,
            confidence=confidence,
            predicted_change_pct=predicted_change_pct,
            predicted_price=predicted_price,
            prediction_data={
                'price_range_low': price_range_low,
                'price_range_high': price_range_high,
                'predicted_volatility': multi_features.get('predicted_volatility'),
                'predicted_volume_change': multi_features.get('predicted_volume_change'),
                'probability_up': multi_features.get('probability_up'),
                'probability_down': multi_features.get('probability_down'),
                'daily_avg_change_pct': multi_features.get('daily_avg_change_pct'),
                'predicted_trend_days': multi_features.get('predicted_trend_days'),
                'predicted_trend_pct': multi_features.get('predicted_trend_pct'),
                'trend_direction': multi_features.get('trend_direction'),
                'predicted_weeks': multi_features.get('predicted_weeks'),
                'gain_target_pct': multi_features.get('gain_target_pct'),
                'predicted_open': multi_features.get('predicted_open'),
                'predicted_high': multi_features.get('predicted_high'),
                'predicted_low': multi_features.get('predicted_low'),
                'latest_data': latest_data,
            },
            is_published=False,
        )
        db.add(share)
        db.commit()
    except Exception as e:
        db.rollback()

    direction_label = _direction_to_chinese(prediction_label)

    return PredictResponse(
        task_id=request.task_id,
        stock_code=request.stock_code,
        predict_date=predict_date,
        prediction=round(float(prediction), 6),
        prediction_label=prediction_label,
        direction_label=direction_label,
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
        predicted_trend_days=multi_features.get('predicted_trend_days'),
        predicted_trend_pct=multi_features.get('predicted_trend_pct'),
        trend_direction=multi_features.get('trend_direction'),
        predicted_weeks=multi_features.get('predicted_weeks'),
        gain_target_pct=multi_features.get('gain_target_pct'),
        predicted_open=multi_features.get('predicted_open'),
        predicted_high=multi_features.get('predicted_high'),
        predicted_low=multi_features.get('predicted_low'),
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
    data_service = DataService(db)

    try:
        model, metrics, input_size, feature_window = ModelCheckpoint.load_checkpoint(task.id)
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
            df = _ensure_stock_data(
                data_service, feature_service, code,
                user_model.features, user_model.feature_config or {},
            )

            feature_cols = [col for col in df.columns if col not in {'id', 'stock_code', 'open', 'high', 'low', 'close', 'volume', 'amount',
                            'change_pct', 'change_amount', 'adj_close'}]
            
            dim_ok = True
            if feature_window <= 1 and model_type not in ['lstm', 'gru']:
                dim_ok = len(feature_cols) == input_size
            elif feature_window > 1:
                dim_ok = len(feature_cols) * feature_window == input_size
            else:
                dim_ok = len(feature_cols) == input_size
            
            if not feature_cols or not dim_ok:
                results.append({'stock_code': code, 'error': f'特征列数不匹配({len(feature_cols)} vs {input_size}, window={feature_window})'})
                continue

            df_features = df[feature_cols].copy()
            df_features = (df_features - df_features.mean()) / df_features.std()

            prediction = _do_predict(model, model_type, model_config, df_features, input_size, feature_window)
            prediction_label = _prediction_to_label(prediction, target)

            latest_row = df.iloc[-1]
            latest_close = float(latest_row['close']) if latest_row['close'] is not None else None

            confidence = _compute_confidence(prediction, target)
            predicted_change_pct = _compute_predicted_change_pct(prediction, target)
            predicted_price = None
            if latest_close and predicted_change_pct is not None:
                predicted_price = round(latest_close * (1 + predicted_change_pct / 100), 2)

            try:
                stock_info = data_service.get_stock_by_code(code)
                stock_name = stock_info.name if stock_info else None
                share = PredictionShare(
                    user_id=current_user.id,
                    task_id=request.task_id,
                    model_id=user_model.id if user_model else None,
                    model_name=user_model.name if user_model else None,
                    model_type=user_model.model_type if user_model else None,
                    stock_code=code,
                    stock_name=stock_name,
                    target_type=target,
                    direction=prediction_label,
                    prediction_value=prediction,
                    confidence=confidence,
                    predicted_change_pct=predicted_change_pct,
                    predicted_price=predicted_price,
                    prediction_data={
                        'latest_close': latest_close,
                    },
                    is_published=False,
                )
                db.add(share)
                db.commit()
            except Exception as e:
                db.rollback()

            results.append({
                'stock_code': code,
                'prediction': round(float(prediction), 6),
                'prediction_label': prediction_label,
                'latest_close': latest_close,
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


def _do_predict(model, model_type: str, model_config: dict, df_features, input_size: int, feature_window: int = 1) -> float:
    """执行模型预测，返回原始预测值
    
    Args:
        feature_window: 特征窗口天数，>1时构建窗口展平特征
    """
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
        if feature_window > 1:
            if len(df_features) < feature_window:
                raise ValueError(f"数据量不足，需要至少{feature_window}条记录构建窗口特征")
            window_data = df_features.iloc[-feature_window:].values.flatten().reshape(1, -1)
            tensor = torch.FloatTensor(window_data)
        else:
            features = df_features.iloc[-1].values.reshape(1, -1)
            tensor = torch.FloatTensor(features)
        with torch.no_grad():
            prediction = model(tensor).item()
    else:
        if feature_window > 1:
            if len(df_features) < feature_window:
                raise ValueError(f"数据量不足，需要至少{feature_window}条记录构建窗口特征")
            window_data = df_features.iloc[-feature_window:].values.flatten().reshape(1, -1)
            prediction = model.predict(window_data)[0]
        else:
            features = df_features.iloc[-1].values.reshape(1, -1)
            prediction = model.predict(features)[0]

    return float(prediction)


def _prediction_to_label(prediction: float, target: str) -> str:
    """将原始预测值转换为英文方向标识（up/down/flat），供数据库存储和前端匹配"""
    if target in ('next_day_direction',):
        if prediction > 0.5:
            return 'up'
        elif prediction < 0.5:
            return 'down'
        else:
            return 'flat'
    else:
        if prediction > 0.001:
            return 'up'
        elif prediction < -0.001:
            return 'down'
        else:
            return 'flat'


_DIRECTION_LABEL_ZH = {'up': '看涨', 'down': '看跌', 'flat': '震荡'}


def _direction_to_chinese(direction: str) -> str:
    """将英文方向标识转换为中文标签，用于前端展示"""
    return _DIRECTION_LABEL_ZH.get(direction, direction)


def _compute_confidence(prediction: float, target: str) -> float:
    """根据预测值和目标类型计算置信度

    分类模型（next_day_direction）：prediction 本身是概率值，直接用距离 0.5 的程度
    回归模型（next_day_return/price_change_5d/trend_*/next_day_ohlc）：用 |prediction| 映射到 0-1
    时间预测模型（time_to_gain_pct）：基于预测值与合理范围的偏差
    """
    if target == 'next_day_direction':
        return abs(prediction - 0.5) * 2
    elif target in ('trend_30d', 'trend_60d', 'trend_90d'):
        abs_val = abs(prediction)
        return min(abs_val / 0.1, 1.0)
    elif target == 'time_to_gain_pct':
        if prediction <= 0:
            return 0.2
        return min(1.0 / max(prediction, 0.5), 1.0)
    else:
        abs_val = abs(prediction)
        return min(abs_val / 0.05, 1.0)


def _compute_predicted_change_pct(prediction: float, target: str) -> Optional[float]:
    """根据 target 类型将原始预测值转换为涨跌幅百分比

    next_day_direction: 概率值 → 涨跌幅（0.5=0%, 1.0=+5%, 0.0=-5%）
    next_day_return: 原始收益率 → 百分比
    price_change_5d: 5日变化率 → 百分比
    trend_30d/60d/90d: 趋势变化率 → 百分比
    next_day_ohlc: 收盘价变化率 → 百分比
    time_to_gain_pct: 不适用，返回 None
    """
    if target == 'next_day_direction':
        return (prediction - 0.5) * 10
    elif target == 'next_day_return':
        return prediction * 100
    elif target == 'price_change_5d':
        return prediction * 100
    elif target in ('trend_30d', 'trend_60d', 'trend_90d'):
        return prediction * 100
    elif target == 'next_day_ohlc':
        return prediction * 100
    elif target == 'time_to_gain_pct':
        return None
    else:
        return prediction * 100


def _compute_multi_features(prediction: float, target: str, df, latest_close: Optional[float]) -> Dict[str, Any]:
    """根据预测值和目标类型推导多维数据

    multi_feature_next_day: 基于近期波动率和成交量变化趋势推导
    next_day_direction: 拆分上涨/下跌概率
    price_change_5d: 计算日均变化率
    trend_30d/60d/90d: 趋势方向、幅度和周期
    time_to_gain_pct: 预计所需周数和目标涨幅
    next_day_ohlc: 基于预测值推导OHLC价格
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

    elif target in ('trend_30d', 'trend_60d', 'trend_90d'):
        days = int(target.split('_')[1].rstrip('d'))
        result['predicted_trend_days'] = days
        result['predicted_trend_pct'] = round(prediction * 100, 4)
        if prediction > 0.02:
            result['trend_direction'] = '上涨'
        elif prediction < -0.02:
            result['trend_direction'] = '下跌'
        else:
            result['trend_direction'] = '震荡'

    elif target == 'time_to_gain_pct':
        result['predicted_weeks'] = round(max(prediction, 0.1), 2)
        result['gain_target_pct'] = 10

    elif target == 'next_day_ohlc':
        if latest_close and latest_close > 0:
            result['predicted_open'] = round(latest_close * (1 + prediction * 0.3), 2)
            result['predicted_high'] = round(latest_close * (1 + abs(prediction) * 1.5), 2)
            result['predicted_low'] = round(latest_close * (1 - abs(prediction) * 1.2), 2)
            result['predicted_close'] = round(latest_close * (1 + prediction), 2)

    return result


# ============================================================
# 预测分享
# ============================================================

class SharePredictionRequest(BaseModel):
    """预测分享请求"""
    task_id: int = Field(..., description="训练任务ID")
    stock_code: str = Field(..., description="股票代码")
    stock_name: Optional[str] = Field(None, description="股票名称")
    prediction_data: Optional[Dict[str, Any]] = Field(None, description="预测结果数据")


@router.post("/predict/share")
async def share_prediction(
    data: SharePredictionRequest,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """将预测结果发布到社区"""
    task = db.query(TrainingTask).filter(TrainingTask.id == data.task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"训练任务 {data.task_id} 不存在")
    _verify_task_ownership(task, current_user)

    user_model = task.user_model
    prediction_data = data.prediction_data or {}

    direction = prediction_data.get("prediction_label")
    prediction_value = prediction_data.get("prediction")
    confidence = prediction_data.get("confidence")
    predicted_change_pct = prediction_data.get("predicted_change_pct")

    share = PredictionShare(
        user_id=current_user.id,
        task_id=data.task_id,
        model_id=user_model.id if user_model else None,
        model_name=user_model.name if user_model else None,
        model_type=user_model.model_type if user_model else None,
        stock_code=data.stock_code,
        stock_name=data.stock_name,
        target_type=user_model.target if user_model else None,
        direction=direction,
        prediction_value=prediction_value,
        confidence=confidence,
        predicted_change_pct=predicted_change_pct,
        prediction_data=prediction_data,
        is_published=True,
    )
    db.add(share)
    db.commit()
    db.refresh(share)
    return {"success": True, "message": "预测已发布到社区", "share": share.to_dict()}


@router.get("/predictions/my")
async def get_my_predictions(
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """获取我的预测结果"""
    shares = db.query(PredictionShare).filter(
        PredictionShare.user_id == current_user.id
    ).order_by(PredictionShare.created_at.desc()).all()

    items = [share.to_dict() for share in shares]
    return {"items": items, "total": len(items)}


@router.get("/predictions/community")
async def get_community_predictions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """获取社区预测分享列表"""
    query = db.query(PredictionShare).filter(
        PredictionShare.is_published == True
    )
    total = query.count()
    offset = (page - 1) * page_size
    items = query.order_by(PredictionShare.created_at.desc()).offset(offset).limit(page_size).all()

    return {
        "items": [item.to_dict() for item in items],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("/predictions/{share_id}/like")
async def like_prediction(
    share_id: int,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """点赞预测分享"""
    share = db.query(PredictionShare).filter(PredictionShare.id == share_id).first()
    if not share:
        raise HTTPException(status_code=404, detail="预测分享不存在")
    share.likes_count = (share.likes_count or 0) + 1
    db.commit()
    return {"success": True, "likes_count": share.likes_count}


@router.delete("/predictions/{share_id}")
async def delete_prediction(
    share_id: int,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """删除预测结果"""
    share = db.query(PredictionShare).filter(
        PredictionShare.id == share_id,
        PredictionShare.user_id == current_user.id,
    ).first()
    if not share:
        raise HTTPException(status_code=404, detail="预测分享不存在或无权删除")
    db.delete(share)
    db.commit()
    return {"success": True, "message": "预测已删除"}


# ============================================================
# 跟单预测（订阅通知）
# ============================================================

class SubscriptionRequest(BaseModel):
    """跟单订阅请求"""
    target_user_id: int


@router.post("/subscribe")
async def subscribe_user(
    request: SubscriptionRequest,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """订阅/取消订阅某用户的预测（toggle 模式）

    复用已有的 Follow 模型，避免数据冗余。
    已订阅则取消，未订阅则创建。
    """
    from app.models.follow import Follow

    if current_user.id == request.target_user_id:
        raise HTTPException(status_code=400, detail="不能订阅自己")

    target = db.query(UserModel).filter(UserModel.id == request.target_user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="目标用户不存在")

    existing = db.query(Follow).filter(
        Follow.follower_id == current_user.id,
        Follow.following_id == request.target_user_id,
    ).first()

    if existing:
        db.delete(existing)
        db.commit()
        return {"subscribed": False, "message": f"已取消订阅 {target.username}"}

    sub = Follow(follower_id=current_user.id, following_id=request.target_user_id)
    db.add(sub)
    db.commit()
    return {"subscribed": True, "message": f"已订阅 {target.username}"}


@router.get("/subscriptions")
async def get_subscriptions(
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """获取我订阅的用户及其最新预测"""
    from app.models.follow import Follow

    follows = db.query(Follow).filter(Follow.follower_id == current_user.id).all()
    if not follows:
        return {"subscriptions": []}

    # 批量查询被关注用户，避免 N+1
    following_ids = [f.following_id for f in follows]
    users = db.query(UserModel).filter(UserModel.id.in_(following_ids)).all()
    user_map = {u.id: u for u in users}

    # 批量查询每个被关注用户的最新一条预测
    results = []
    for uid in following_ids:
        user = user_map.get(uid)
        latest = db.query(PredictionShare).filter(
            PredictionShare.user_id == uid,
            PredictionShare.is_published == True,
        ).order_by(PredictionShare.created_at.desc()).first()

        results.append({
            'user_id': uid,
            'username': user.username if user else '未知',
            'nickname': getattr(user, 'nickname', None) or user.username if user else '未知',
            'latest_prediction': latest.to_dict() if latest else None,
        })

    return {"subscriptions": results}


# ============================================================
# 策略回放
# ============================================================

@router.get("/replay/{model_id}")
async def strategy_replay(
    model_id: int,
    days: int = Query(30, ge=7, le=90),
    db: Session = Depends(get_db),
):
    """策略回放 - 展示模型过去N天的预测记录与实际行情对比

    对每条已发布预测，获取对应股票在预测日之后的实际收盘价，
    计算实际涨跌方向并与预测方向对比，判断是否正确。
    """
    start = datetime.now() - timedelta(days=days)

    shares = db.query(PredictionShare).filter(
        PredictionShare.model_id == model_id,
        PredictionShare.is_published == True,
        PredictionShare.created_at >= start,
    ).order_by(PredictionShare.created_at.asc()).all()

    if not shares:
        return {
            'replay': [],
            'summary': {'total': 0, 'correct': 0, 'accuracy': 0, 'days': days},
        }

    data_service = DataService(db)
    replay = []

    for s in shares:
        actual_close = None
        actual_change = None
        actual_direction = None
        correct = None

        try:
            prices = data_service.get_stock_prices(s.stock_code, limit=2)
            if prices and len(prices) >= 2:
                # prices 按日期升序，取最后两条对比涨跌
                actual_close = float(prices[-1].close) if prices[-1].close is not None else None
                prev_close = float(prices[-2].close) if prices[-2].close is not None else None
                if actual_close is not None and prev_close is not None and prev_close > 0:
                    actual_change = (actual_close - prev_close) / prev_close
                    if actual_change > 0:
                        actual_direction = 'up'
                    elif actual_change < 0:
                        actual_direction = 'down'
                    else:
                        actual_direction = 'flat'
                    correct = (s.direction == actual_direction)
        except Exception:
            # 数据获取失败时不影响其他记录，但保留 None 标识
            pass

        replay.append({
            **s.to_dict(),
            'actual_close': actual_close,
            'actual_change': round(actual_change * 100, 2) if actual_change is not None else None,
            'actual_direction': actual_direction,
            'correct': correct,
        })

    total = len(replay)
    correct_count = sum(1 for r in replay if r['correct'] is True)
    accuracy = round(correct_count / total, 3) if total > 0 else 0

    return {
        'replay': replay,
        'summary': {
            'total': total,
            'correct': correct_count,
            'accuracy': accuracy,
            'days': days,
        },
    }
