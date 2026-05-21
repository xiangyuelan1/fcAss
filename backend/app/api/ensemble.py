"""
模型组合策略 API - 将多个模型的预测结果加权组合

允许用户选择多个已完成的训练任务，对同一只股票进行预测，
然后按指定权重加权汇总各模型的预测值与置信度，
输出组合预测方向和综合置信度。
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.database import get_db
from app.auth import get_current_active_user
from app.models.user import User as AuthUser
from app.models.training import TrainingTask
from app.services.training_service import ModelCheckpoint, TORCH_AVAILABLE
from app.services.feature_service import FeatureService
from app.services.data_service import DataService

router = APIRouter()


class EnsemblePredictRequest(BaseModel):
    """组合预测请求：选择多个训练任务，指定权重和目标股票"""
    task_ids: List[int] = Field(..., description="已完成的训练任务ID列表（至少2个）")
    weights: Optional[List[float]] = Field(None, description="各任务权重，默认等权")
    stock_code: str = Field(..., description="预测股票代码")


def _verify_task_ownership(task: TrainingTask, current_user: AuthUser):
    """验证训练任务是否属于当前用户，管理员可访问所有任务"""
    if current_user.is_admin:
        return
    if task.user_model is None or task.user_model.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权访问该训练任务")


def _predict_single(model, model_type: str, model_config: dict,
                    df_features, input_size: int, feature_window: int = 1) -> float:
    """执行单模型预测，复用 prediction 模块的推理逻辑"""
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
            return model(tensor).item()
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
            return model(tensor).item()
    else:
        if feature_window > 1:
            if len(df_features) < feature_window:
                raise ValueError(f"数据量不足，需要至少{feature_window}条记录构建窗口特征")
            window_data = df_features.iloc[-feature_window:].values.flatten().reshape(1, -1)
            return model.predict(window_data)[0]
        else:
            features = df_features.iloc[-1].values.reshape(1, -1)
            return model.predict(features)[0]


def _compute_confidence(prediction: float, target: str) -> float:
    """根据预测值和目标类型计算置信度（与 prediction API 保持一致）"""
    if target == 'next_day_direction':
        return abs(prediction - 0.5) * 2
    elif target in ('trend_30d', 'trend_60d', 'trend_90d'):
        return min(abs(prediction) / 0.1, 1.0)
    else:
        return min(abs(prediction) / 0.05, 1.0)


@router.post("/predict")
async def ensemble_predict(
    request: EnsemblePredictRequest,
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """组合预测：对同一股票使用多个模型分别预测，加权汇总结果
    
    要求所有模型的预测目标（target）一致，否则组合无意义。
    权重自动归一化；未指定权重时默认等权。
    """
    if len(request.task_ids) < 2:
        raise HTTPException(status_code=400, detail="至少需要2个训练任务进行组合预测")
    if request.weights and len(request.weights) != len(request.task_ids):
        raise HTTPException(status_code=400, detail="权重数量必须与任务数量一致")

    # 归一化权重
    weights = request.weights or [1.0 / len(request.task_ids)] * len(request.task_ids)
    total_w = sum(weights)
    if total_w <= 0:
        raise HTTPException(status_code=400, detail="权重总和必须大于0")
    weights = [w / total_w for w in weights]

    feature_service = FeatureService(db)
    data_service = DataService(db)
    predictions = []
    first_target = None

    for i, task_id in enumerate(request.task_ids):
        # 验证任务
        task = db.query(TrainingTask).filter(TrainingTask.id == task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail=f"训练任务 {task_id} 不存在")
        _verify_task_ownership(task, current_user)
        if task.status != 'completed':
            raise HTTPException(status_code=400, detail=f"训练任务 {task_id} 状态为 {task.status}，仅已完成任务可预测")

        user_model = task.user_model
        target = user_model.target

        # 校验所有模型预测目标一致
        if first_target is None:
            first_target = target
        elif target != first_target:
            raise HTTPException(
                status_code=400,
                detail=f"模型目标不一致：任务{task_id}的目标为'{target}'，期望'{first_target}'"
            )

        # 加载模型检查点
        try:
            model, metrics, input_size, feature_window = ModelCheckpoint.load_checkpoint(task_id)
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail=f"任务 {task_id} 的模型检查点不存在")
        except ValueError as e:
            raise HTTPException(status_code=500, detail=str(e))

        # 确保股票有数据
        stock_info = data_service.get_stock_by_code(request.stock_code)
        if not stock_info:
            try:
                data_service.fetch_stock_data(request.stock_code)
            except Exception:
                raise HTTPException(status_code=400, detail=f"股票 {request.stock_code} 数据获取失败")

        # 计算特征
        df = feature_service.calculate_features(
            stock_code=request.stock_code,
            indicators=user_model.features,
            indicator_params=user_model.feature_config or {},
            limit=5000
        )
        if df is None or df.empty:
            raise HTTPException(status_code=400, detail=f"股票 {request.stock_code} 无可用数据")

        exclude_cols = {'id', 'stock_code', 'open', 'high', 'low', 'close', 'volume', 'amount',
                        'change_pct', 'change_amount', 'adj_close'}
        feature_cols = [col for col in df.columns if col not in exclude_cols]
        if not feature_cols:
            raise HTTPException(status_code=400, detail=f"任务 {task_id} 无可用特征列")

        # 标准化
        df_features = df[feature_cols].copy()
        df_features = (df_features - df_features.mean()) / df_features.std()

        # 维度校验
        model_type = user_model.model_type
        model_config = user_model.model_config or {}
        if feature_window <= 1 and model_type not in ['lstm', 'gru']:
            if len(feature_cols) != input_size:
                raise HTTPException(
                    status_code=400,
                    detail=f"任务 {task_id} 特征列数({len(feature_cols)})与模型期望({input_size})不匹配"
                )
        elif feature_window > 1:
            if len(feature_cols) * feature_window != input_size:
                raise HTTPException(
                    status_code=400,
                    detail=f"任务 {task_id} 特征列数×窗口与模型期望不匹配"
                )

        # 执行预测
        try:
            pred = _predict_single(model, model_type, model_config, df_features, input_size, feature_window)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"任务 {task_id} 预测执行失败: {str(e)}")

        confidence = _compute_confidence(pred, target)

        predictions.append({
            'task_id': task_id,
            'model_name': user_model.name,
            'model_type': model_type,
            'prediction': round(float(pred), 6),
            'confidence': round(float(confidence), 4),
            'weight': round(float(weights[i]), 4),
            'target': target,
        })

    # 加权汇总
    weighted_pred = sum(p['prediction'] * p['weight'] for p in predictions)
    weighted_conf = sum(p['confidence'] * p['weight'] for p in predictions)

    # 判定方向
    if first_target == 'next_day_direction':
        direction = 'up' if weighted_pred > 0.5 else 'down' if weighted_pred < 0.5 else 'flat'
    else:
        direction = 'up' if weighted_pred > 0.001 else 'down' if weighted_pred < -0.001 else 'flat'

    return {
        'ensemble_prediction': round(weighted_pred, 6),
        'ensemble_confidence': round(weighted_conf, 4),
        'ensemble_direction': direction,
        'target': first_target,
        'models': predictions,
        'weights': [round(w, 4) for w in weights],
    }
