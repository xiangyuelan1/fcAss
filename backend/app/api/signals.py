"""
交易信号API - 基于用户已训练模型自动生成买卖信号

遍历当前用户所有已完成训练的模型，对每只关联股票执行推理，
根据预测方向和置信度生成交易信号（强烈买入/买入/观望/卖出/强烈卖出）。
"""
import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
import numpy as np

from app.core.database import get_db
from app.auth import get_current_user
from app.models.user import User as UserModel
from app.models.user_model import UserModel as UserModelIndex
from app.models.training import TrainingTask
from app.services.training_service import ModelCheckpoint, TORCH_AVAILABLE
from app.services.feature_service import FeatureService
from app.services.data_service import DataService

logger = logging.getLogger(__name__)

router = APIRouter()


def _predict_with_model(model, model_type: str, model_config: dict,
                        df_features, input_size: int, feature_window: int) -> float:
    """使用模型执行推理，返回原始预测值（复用prediction模块的推理逻辑）"""
    if model_type in ['lstm', 'gru']:
        if not TORCH_AVAILABLE:
            raise RuntimeError("PyTorch未安装")
        import torch
        seq_len = model_config.get('sequence_length', 20)
        if len(df_features) < seq_len:
            raise ValueError("数据量不足")
        seq_data = df_features.iloc[-seq_len:].values.reshape(1, seq_len, -1)
        tensor = torch.FloatTensor(seq_data)
        with torch.no_grad():
            return model(tensor).item()
    elif model_type == 'mlp':
        if not TORCH_AVAILABLE:
            raise RuntimeError("PyTorch未安装")
        import torch
        if feature_window > 1:
            if len(df_features) < feature_window:
                raise ValueError("数据量不足")
            window_data = df_features.iloc[-feature_window:].values.flatten().reshape(1, -1)
            tensor = torch.FloatTensor(window_data)
        else:
            features = df_features.iloc[-1:].values.reshape(1, -1)
            tensor = torch.FloatTensor(features)
        with torch.no_grad():
            return model(tensor).item()
    else:
        # sklearn等传统ML模型
        if feature_window > 1:
            if len(df_features) < feature_window:
                raise ValueError("数据量不足")
            window_data = df_features.iloc[-feature_window:].values.flatten().reshape(1, -1)
            return float(model.predict(window_data)[0])
        else:
            features = df_features.iloc[-1:].values.reshape(1, -1)
            return float(model.predict(features)[0])


def _compute_confidence(prediction: float, target: str) -> float:
    """根据预测值和目标类型计算置信度"""
    if target == 'next_day_direction':
        return abs(prediction - 0.5) * 2
    elif target in ('trend_30d', 'trend_60d', 'trend_90d'):
        return min(abs(prediction) / 0.1, 1.0)
    elif target == 'time_to_gain_pct':
        if prediction <= 0:
            return 0.2
        return min(1.0 / max(prediction, 0.5), 1.0)
    else:
        return min(abs(prediction) * 10, 1.0)


def _direction_from_prediction(prediction: float, target: str) -> str:
    """根据预测值和目标类型判断方向"""
    if target == 'next_day_direction':
        if prediction > 0.5:
            return 'up'
        elif prediction < 0.5:
            return 'down'
        return 'flat'
    else:
        if prediction > 0.001:
            return 'up'
        elif prediction < -0.001:
            return 'down'
        return 'flat'


def _signal_type_from_direction(direction: str, confidence: float) -> str:
    """根据方向和置信度生成信号类型"""
    if direction == 'up' and confidence >= 0.75:
        return 'strong_buy'
    if direction == 'up':
        return 'buy'
    if direction == 'down' and confidence >= 0.75:
        return 'strong_sell'
    if direction == 'down':
        return 'sell'
    return 'hold'


@router.get("")
async def get_signals(
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取当前用户所有已完成模型的交易信号

    遍历用户已完成的训练任务，加载模型对关联股票执行推理，
    筛选置信度>=0.6的信号并按置信度降序排列。
    """
    signals = []

    # 查询用户所有已完成的训练任务
    completed_tasks = (
        db.query(TrainingTask)
        .join(UserModelIndex, TrainingTask.model_id == UserModel.id)
        .filter(
            UserModel.user_id == current_user.id,
            TrainingTask.status == 'completed',
        )
        .all()
    )

    feature_service = FeatureService(db)
    data_service = DataService(db)

    for task in completed_tasks:
        user_model = task.user_model
        if not user_model:
            continue

        # 加载模型检查点
        try:
            model, metrics, input_size, feature_window = ModelCheckpoint.load_checkpoint(task.id)
        except (FileNotFoundError, ValueError):
            continue

        stock_codes = user_model.stock_codes or []
        model_type = user_model.model_type
        model_config = user_model.model_config or {}
        target = user_model.target
        indicators = user_model.features or []
        indicator_params = user_model.feature_config or {}

        for code in stock_codes[:5]:
            try:
                # 计算特征
                df = feature_service.calculate_features(
                    stock_code=code,
                    indicators=indicators,
                    indicator_params=indicator_params,
                    limit=5000,
                )
                if df is None or df.empty:
                    continue

                # 提取特征列（排除基础价格列）
                base_cols = {'id', 'stock_code', 'open', 'high', 'low', 'close',
                             'volume', 'amount', 'change_pct', 'change_amount', 'adj_close'}
                feature_cols = [col for col in df.columns if col not in base_cols]
                if not feature_cols:
                    continue

                # 标准化特征
                df_features = df[feature_cols].copy()
                df_features = (df_features - df_features.mean()) / df_features.std()
                df_features = df_features.fillna(0)

                # 校验特征维度
                if model_type in ['lstm', 'gru']:
                    expected_dim = input_size
                elif feature_window > 1:
                    expected_dim = input_size // feature_window
                else:
                    expected_dim = input_size

                if len(feature_cols) != expected_dim:
                    continue

                # 执行推理
                prediction = _predict_with_model(
                    model, model_type, model_config, df_features, input_size, feature_window
                )

                # 计算置信度和方向
                confidence = _compute_confidence(prediction, target)
                direction = _direction_from_prediction(prediction, target)

                # 置信度低于阈值则跳过
                if confidence < 0.6:
                    continue

                # 获取最新收盘价
                latest_close = float(df['close'].iloc[-1]) if 'close' in df.columns else None

                signals.append({
                    'model_id': user_model.id,
                    'model_name': user_model.name,
                    'model_type': model_type,
                    'task_id': task.id,
                    'stock_code': code,
                    'direction': direction,
                    'confidence': round(confidence, 3),
                    'prediction': round(prediction, 4),
                    'latest_close': latest_close,
                    'target': target,
                    'signal_type': _signal_type_from_direction(direction, confidence),
                })
            except Exception:
                logger.debug("信号生成失败: model=%s code=%s", user_model.name, code, exc_info=True)
                continue

    signals.sort(key=lambda x: x['confidence'], reverse=True)
    return {"signals": signals, "total": len(signals)}
