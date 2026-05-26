"""
训练服务 - 负责模型训练和评估
"""
import os
import json
import time
import pickle
import numpy as np
import pandas as pd
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from datetime import datetime
import threading

try:
    import torch
    import torch.nn as nn
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    torch = None
    nn = None

from app.models.training import TrainingTask
from app.models.user_model import UserModel
from app.services.feature_service import FeatureService
from app.services.data_service import DataService
from app.core.config import settings


training_progress = {}

STAGE_LABELS = {
    'data_preparation': '数据准备',
    'training': '模型训练',
    'validating': '验证中',
    'completed': '完成',
    'failed': '失败',
    'cancelled': '已取消',
}


def estimate_remaining_seconds(elapsed_seconds: float, progress: float):
    """根据已用时间和当前进度百分比估算剩余时间

    算法: remaining = elapsed * (1 - p) / p，当 progress > 5 时才计算，
    否则返回 None（进度太低时估算无意义）。
    """
    if progress > 5 and elapsed_seconds > 0:
        return elapsed_seconds * (1 - progress / 100) / (progress / 100)
    return None


def create_pytorch_model(model_type: str, input_size: int, config: Dict[str, Any]):
    """根据模型类型和配置创建PyTorch模型"""
    if model_type == 'lstm':
        return LSTMModel(
            input_size,
            config.get('hidden_size', 64),
            config.get('num_layers', 2),
            output_size=1,
            dropout=config.get('dropout', 0.2)
        )
    elif model_type == 'gru':
        return GRUModel(
            input_size,
            config.get('hidden_size', 64),
            config.get('num_layers', 2),
            output_size=1,
            dropout=config.get('dropout', 0.2)
        )
    elif model_type == 'mlp':
        return MLPModel(
            input_size,
            config.get('hidden_layers', [128, 64]),
            output_size=1,
            dropout=config.get('dropout', 0.2),
            activation=config.get('activation', 'relu')
        )
    else:
        raise ValueError(f"不支持的PyTorch模型类型: {model_type}")


def load_pytorch_model(model_type: str, model_path: str, input_size: int, config: Dict[str, Any]):
    """加载PyTorch模型，包含完整的模型结构"""
    model = create_pytorch_model(model_type, input_size, config)
    model.load_state_dict(torch.load(model_path, map_location='cpu'))
    model.eval()
    return model


class ModelCheckpoint:
    """模型检查点管理"""
    
    @staticmethod
    def update_checkpoint_metadata(task_id: int, feature_cols: list = None, feature_importance: dict = None):
        """向已有检查点文件追加元数据（feature_cols / feature_importance），不触碰模型权重
        
        训练完成后调用，将特征列名和特征重要性写入检查点，
        以便预测和解释性 API 读取，无需重新保存模型对象。
        """
        checkpoint_path = os.path.join(settings.MODEL_DIR, f'task_{task_id}_checkpoint.pt')
        if not os.path.exists(checkpoint_path):
            return
        
        with open(checkpoint_path, 'rb') as f:
            magic = f.read(4)
        is_pytorch = magic[:2] == b'PK'
        
        if is_pytorch:
            checkpoint = torch.load(checkpoint_path, map_location='cpu', weights_only=False)
            if feature_cols is not None:
                checkpoint['feature_cols'] = feature_cols
            if feature_importance is not None:
                checkpoint['feature_importance'] = feature_importance
            torch.save(checkpoint, checkpoint_path)
        else:
            with open(checkpoint_path, 'rb') as f:
                checkpoint = pickle.load(f)
            if feature_cols is not None:
                checkpoint['feature_cols'] = feature_cols
            if feature_importance is not None:
                checkpoint['feature_importance'] = feature_importance
            with open(checkpoint_path, 'wb') as f:
                pickle.dump(checkpoint, f)
    
    @staticmethod
    def load_checkpoint_metadata(task_id: int) -> Dict[str, Any]:
        """仅加载检查点元数据（不加载模型对象），用于特征重要性查询等轻量场景
        
        Returns:
            包含 feature_cols, feature_importance, model_type, metrics 等字段的字典
        """
        checkpoint_path = os.path.join(settings.MODEL_DIR, f'task_{task_id}_checkpoint.pt')
        if not os.path.exists(checkpoint_path):
            raise FileNotFoundError(f"模型检查点不存在: {checkpoint_path}")
        
        with open(checkpoint_path, 'rb') as f:
            magic = f.read(4)
        is_pytorch = magic[:2] == b'PK'
        
        if is_pytorch:
            checkpoint = torch.load(checkpoint_path, map_location='cpu', weights_only=False)
        else:
            with open(checkpoint_path, 'rb') as f:
                checkpoint = pickle.load(f)
        
        return {
            'feature_cols': checkpoint.get('feature_cols', []),
            'feature_importance': checkpoint.get('feature_importance', {}),
            'model_type': checkpoint.get('model_type', ''),
            'feature_window': checkpoint.get('feature_window', 1),
            'input_size': checkpoint.get('input_size', 0),
            'metrics': checkpoint.get('metrics', {}),
        }
    
    @staticmethod
    def save_checkpoint(model, task_id: int, metrics: Dict[str, Any], model_config: Dict[str, Any], model_type: str, input_size: int = 0, feature_window: int = 1):
        """保存模型检查点，包含完整的模型结构和配置
        
        Args:
            input_size: 模型输入特征维度，回测和预测时需要此信息重建模型
            feature_window: 特征窗口天数，预测时需要此信息构建窗口特征
        """
        os.makedirs(settings.MODEL_DIR, exist_ok=True)
        
        checkpoint_path = os.path.join(settings.MODEL_DIR, f'task_{task_id}_checkpoint.pt')
        
        if model_type in ['lstm', 'gru', 'mlp']:
            checkpoint = {
                'model_type': model_type,
                'model_state_dict': model.state_dict(),
                'model_config': model_config,
                'metrics': metrics,
                'input_size': input_size,
                'feature_window': feature_window,
            }
            torch.save(checkpoint, checkpoint_path)
        else:
            checkpoint = {
                'model_type': model_type,
                'model': model,
                'model_config': model_config,
                'metrics': metrics,
                'input_size': input_size,
                'feature_window': feature_window,
            }
            with open(checkpoint_path, 'wb') as f:
                pickle.dump(checkpoint, f)
        
        return checkpoint_path
    
    @staticmethod
    def load_checkpoint(task_id: int, model_type: str = None, model_config: Dict[str, Any] = None, input_size: int = 0):
        """加载模型检查点
        
        自动检测文件格式（PyTorch或pickle），优先从checkpoint中读取input_size和feature_window
        """
        checkpoint_path = os.path.join(settings.MODEL_DIR, f'task_{task_id}_checkpoint.pt')
        
        if not os.path.exists(checkpoint_path):
            raise FileNotFoundError(f"模型检查点不存在: {checkpoint_path}")
        
        with open(checkpoint_path, 'rb') as f:
            magic = f.read(4)
        
        is_pytorch = magic[:2] == b'PK'
        
        if is_pytorch:
            checkpoint = torch.load(checkpoint_path, map_location='cpu', weights_only=False)
            actual_type = checkpoint.get('model_type', model_type)
            actual_config = checkpoint.get('model_config', model_config or {})
            actual_input_size = checkpoint.get('input_size', input_size)
            feature_window = checkpoint.get('feature_window', 1)
            
            if actual_input_size <= 0:
                raise ValueError(f"模型检查点中input_size无效: {actual_input_size}，请重新训练模型")
            
            model = create_pytorch_model(actual_type, actual_input_size, actual_config)
            model.load_state_dict(checkpoint['model_state_dict'])
            model.eval()
            return model, checkpoint.get('metrics', {}), actual_input_size, feature_window
        else:
            with open(checkpoint_path, 'rb') as f:
                checkpoint = pickle.load(f)
            actual_input_size = checkpoint.get('input_size', input_size)
            feature_window = checkpoint.get('feature_window', 1)
            return checkpoint['model'], checkpoint.get('metrics', {}), actual_input_size, feature_window


if TORCH_AVAILABLE:
    class LSTMModel(nn.Module):
        """LSTM模型"""
        def __init__(self, input_size, hidden_size, num_layers, output_size, dropout=0.2):
            super(LSTMModel, self).__init__()
            self.hidden_size = hidden_size
            self.num_layers = num_layers
            self.lstm = nn.LSTM(input_size, hidden_size, num_layers, 
                               batch_first=True, dropout=dropout)
            self.fc = nn.Linear(hidden_size, output_size)
            self.dropout = nn.Dropout(dropout)
        
        def forward(self, x):
            h0 = torch.zeros(self.num_layers, x.size(0), self.hidden_size).to(x.device)
            c0 = torch.zeros(self.num_layers, x.size(0), self.hidden_size).to(x.device)
            out, _ = self.lstm(x, (h0, c0))
            out = self.dropout(out[:, -1, :])
            out = self.fc(out)
            return out


if TORCH_AVAILABLE:
    class GRUModel(nn.Module):
        """GRU模型"""
        def __init__(self, input_size, hidden_size, num_layers, output_size, dropout=0.2):
            super(GRUModel, self).__init__()
            self.hidden_size = hidden_size
            self.num_layers = num_layers
            self.gru = nn.GRU(input_size, hidden_size, num_layers,
                             batch_first=True, dropout=dropout)
            self.fc = nn.Linear(hidden_size, output_size)
            self.dropout = nn.Dropout(dropout)
        
        def forward(self, x):
            h0 = torch.zeros(self.num_layers, x.size(0), self.hidden_size).to(x.device)
            out, _ = self.gru(x, h0)
            out = self.dropout(out[:, -1, :])
            out = self.fc(out)
            return out


if TORCH_AVAILABLE:
    class MLPModel(nn.Module):
        """MLP模型"""
        def __init__(self, input_size, hidden_layers, output_size, dropout=0.2, activation='relu'):
            super(MLPModel, self).__init__()
            
            layers = []
            prev_size = input_size
            
            act_fn = nn.ReLU() if activation == 'relu' else nn.Tanh() if activation == 'tanh' else nn.Sigmoid()
            
            for hidden_size in hidden_layers:
                layers.append(nn.Linear(prev_size, hidden_size))
                layers.append(act_fn)
                layers.append(nn.Dropout(dropout))
                prev_size = hidden_size
            
            layers.append(nn.Linear(prev_size, output_size))
            self.network = nn.Sequential(*layers)
        
        def forward(self, x):
            return self.network(x)


class TrainingService:
    """训练服务类"""
    
    def __init__(self, db: Session):
        self.db = db
        self.feature_service = FeatureService(db)
        self.data_service = DataService(db)
    
    def get_tasks(
        self,
        model_id: Optional[int] = None,
        status: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
        user_id: Optional[int] = None
    ) -> List[TrainingTask]:
        """获取训练任务列表，按 user_id 过滤时通过 join UserModel 实现"""
        query = self.db.query(TrainingTask)
        
        if user_id is not None:
            query = query.join(UserModel, TrainingTask.model_id == UserModel.id).filter(
                UserModel.user_id == user_id
            )
        if model_id:
            query = query.filter(TrainingTask.model_id == model_id)
        if status:
            query = query.filter(TrainingTask.status == status)
        
        return query.order_by(TrainingTask.created_at.desc()).offset(skip).limit(limit).all()
    
    def get_task(self, task_id: int) -> Optional[TrainingTask]:
        """获取训练任务"""
        return self.db.query(TrainingTask).filter(TrainingTask.id == task_id).first()
    
    def create_task(self, model_id: int, config: Dict[str, Any]) -> TrainingTask:
        """创建训练任务"""
        task = TrainingTask(
            model_id=model_id,
            status='pending',
            config=config
        )
        self.db.add(task)
        self.db.commit()
        self.db.refresh(task)
        return task
    
    def cancel_task(self, task_id: int) -> bool:
        """取消训练任务"""
        task = self.get_task(task_id)
        if not task or task.status not in ['pending', 'running']:
            return False
        
        task.status = 'cancelled'
        task.end_time = datetime.now()
        self.db.commit()
        return True
    
    def delete_task(self, task_id: int) -> bool:
        """删除训练任务"""
        task = self.get_task(task_id)
        if not task:
            return False
        
        self.db.delete(task)
        self.db.commit()
        return True
    
    def get_training_logs(self, task_id: int) -> List[str]:
        """获取训练日志"""
        log_path = os.path.join(settings.MODEL_DIR, f'task_{task_id}_log.txt')
        if os.path.exists(log_path):
            with open(log_path, 'r', encoding='utf-8') as f:
                return f.readlines()
        return []
    
    def get_training_progress(self, task_id: int) -> Dict[str, Any]:
        """获取训练进度"""
        global training_progress
        return training_progress.get(task_id, {})
    
    def _log(self, task_id: int, message: str):
        """写入训练日志"""
        log_path = os.path.join(settings.MODEL_DIR, f'task_{task_id}_log.txt')
        os.makedirs(settings.MODEL_DIR, exist_ok=True)
        timestamp = datetime.now().strftime('%H:%M:%S')
        with open(log_path, 'a', encoding='utf-8') as f:
            f.write(f"[{timestamp}] {message}\n")

    def run_training(self, task_id: int):
        """执行训练"""
        global training_progress
        
        task = self.get_task(task_id)
        if not task:
            return
        
        log_path = os.path.join(settings.MODEL_DIR, f'task_{task_id}_log.txt')
        if os.path.exists(log_path):
            os.remove(log_path)
        
        task.status = 'running'
        task.start_time = datetime.now()
        self.db.commit()

        training_start_time = time.time()

        try:
            user_model = task.user_model
            model_type = user_model.model_type
            model_config = user_model.model_config
            feature_window = getattr(user_model, 'feature_window', None) or 1
            
            self._log(task_id, f"开始训练 | 模型类型: {model_type}")
            self._log(task_id, f"特征指标: {', '.join(user_model.features or [])}")
            self._log(task_id, f"训练股票: {', '.join(user_model.stock_codes or [])}")
            self._log(task_id, f"预测目标: {user_model.target}")
            if model_type in ['lstm', 'gru']:
                seq_len = model_config.get('sequence_length', 20)
                self._log(task_id, f"序列窗口: {seq_len}日（LSTM/GRU自动使用序列模式）")
            elif feature_window > 1:
                self._log(task_id, f"特征窗口: {feature_window}日（近{feature_window}日特征展平输入）")
            else:
                self._log(task_id, "特征窗口: 1日（单日截面模式）")
            if user_model.target == 'multi_feature_next_day':
                self._log(task_id, "多维预测模式：训练主目标为收益率，波动率与量变率在预测阶段基于特征推导")
            
            training_progress[task_id] = {
                'stage': 'data_preparation',
                'progress': 0,
                'start_time': training_start_time,
                'data_preparation_progress': 0,
                'elapsed_seconds': 0,
                'estimated_remaining_seconds': None,
            }
            self._log(task_id, "阶段1: 数据准备中...")
            
            X_train, X_val, y_train, y_val = self._prepare_data(user_model, task_id)
            
            if len(X_train.shape) == 3:
                self._log(task_id, f"数据准备完成 | 训练集: {X_train.shape[0]}条, 验证集: {X_val.shape[0]}条, 序列长度: {X_train.shape[1]}, 特征维度: {X_train.shape[2]}")
            else:
                self._log(task_id, f"数据准备完成 | 训练集: {X_train.shape[0]}条, 验证集: {X_val.shape[0]}条, 特征维度: {X_train.shape[1]}")
            
            training_progress[task_id] = {
                'stage': 'training',
                'progress': 0,
                'start_time': training_start_time,
                'elapsed_seconds': time.time() - training_start_time,
                'estimated_remaining_seconds': None,
            }
            self._log(task_id, "阶段2: 模型训练中...")
            
            if model_type in ['lstm', 'gru', 'mlp']:
                if not TORCH_AVAILABLE:
                    raise ValueError("PyTorch未安装，无法训练深度学习模型。请安装torch或选择其他模型类型。")
                metrics = self._train_pytorch_model(
                    task_id, model_type, model_config,
                    X_train, X_val, y_train, y_val,
                    feature_window=feature_window
                )
            else:
                metrics = self._train_sklearn_model(
                    task_id, model_type, model_config,
                    X_train, X_val, y_train, y_val,
                    feature_window=feature_window
                )
            
            # 更新任务状态
            task.status = 'completed'
            task.end_time = datetime.now()
            task.metrics = metrics
            self.db.commit()
            
            # 更新模型状态
            user_model.status = 'trained'
            self.db.commit()
            
            # 训练完成后计算特征重要性并写入检查点
            try:
                trained_model, _, _, _ = ModelCheckpoint.load_checkpoint(task_id)
                feature_importance = self._compute_feature_importance(
                    trained_model, model_type, self._feature_cols,
                    X_train, y_train
                )
                if feature_importance:
                    ModelCheckpoint.update_checkpoint_metadata(
                        task_id,
                        feature_cols=self._feature_cols,
                        feature_importance=feature_importance,
                    )
                    self._log(task_id, f"特征重要性已计算，共 {len(feature_importance)} 个特征")
            except Exception as e:
                self._log(task_id, f"特征重要性计算跳过: {str(e)}")
            
            training_progress[task_id] = {
                'stage': 'completed',
                'progress': 100,
                'start_time': training_start_time,
                'elapsed_seconds': time.time() - training_start_time,
                'estimated_remaining_seconds': 0,
            }
            self._log(task_id, f"训练完成! 指标: {', '.join(f'{k}={v:.6f}' for k, v in metrics.items() if isinstance(v, (int, float)))}")
            
        except Exception as e:
            task.status = 'failed'
            task.end_time = datetime.now()
            task.error_message = str(e)
            self.db.commit()
            training_progress[task_id] = {'stage': 'failed', 'error': str(e)}
            self._log(task_id, f"训练失败: {str(e)}")
    
    def _prepare_data(self, user_model: UserModel, task_id: int):
        """准备训练数据
        
        对每只股票：获取价格 → 计算特征 → 生成标签 → 标准化 → 构建窗口特征
        合并所有股票数据后按时间序列 80/20 划分训练集和验证集
        
        特征窗口机制：
        - LSTM/GRU: 在每只股票内独立构建序列（修复跨股票序列bug）
        - sklearn/MLP + feature_window>1: 将近N日特征展平为单一向量
        - sklearn/MLP + feature_window=1: 单日截面模式（向后兼容）
        """
        self._feature_cols = []
        
        model_type = user_model.model_type
        feature_window = getattr(user_model, 'feature_window', None) or 1
        
        if model_type in ['lstm', 'gru']:
            seq_len = user_model.model_config.get('sequence_length', 20)
        
        all_features = []
        all_labels = []
        skip_reasons = []
        
        total_stocks = len(user_model.stock_codes)
        processed_stocks = 0
        
        for code in user_model.stock_codes:
            try:
                existing_prices = self.data_service.get_stock_prices(code=code, limit=1)
                if len(existing_prices) == 0:
                    self._log(task_id, f"股票 {code} 本地无数据，正在自动获取...")
                    try:
                        result = self.data_service.fetch_stock_data(code)
                        fetched_count = result.get('price_count', 0)
                        self._log(task_id, f"已自动获取 {code} 的 {fetched_count} 条数据")
                    except Exception as e:
                        self._log(task_id, f"自动获取 {code} 数据失败: {str(e)}")

                prices = self.data_service.get_stock_prices(
                    code=code,
                    start_date=user_model.train_date_range.get('start') if user_model.train_date_range else None,
                    end_date=user_model.train_date_range.get('end') if user_model.train_date_range else None,
                    limit=5000
                )
                
                min_data = 30
                if model_type in ['lstm', 'gru']:
                    min_data = max(30, seq_len + 10)
                elif feature_window > 1:
                    min_data = max(30, feature_window + 10)
                
                if len(prices) < min_data:
                    skip_reasons.append(f"{code}: 价格数据不足{len(prices)}条（需≥{min_data}）")
                    continue
                
                df = self.feature_service.calculate_features(
                    stock_code=code,
                    indicators=user_model.features,
                    indicator_params=user_model.feature_config or {},
                    start_date=user_model.train_date_range.get('start') if user_model.train_date_range else None,
                    end_date=user_model.train_date_range.get('end') if user_model.train_date_range else None,
                    limit=5000
                )
                
                if df is None or df.empty:
                    skip_reasons.append(f"{code}: 特征计算结果为空")
                    continue
                
                exclude_cols = {'id', 'stock_code', 'open', 'high', 'low', 'close', 'volume', 'amount',
                                'change_pct', 'change_amount', 'adj_close'}
                feature_cols = [col for col in df.columns if col not in exclude_cols]
                
                if not self._feature_cols and feature_cols:
                    self._feature_cols = feature_cols
                
                if not feature_cols:
                    skip_reasons.append(f"{code}: 无可用特征列")
                    continue
                
                target = user_model.target
                if target == 'next_day_return':
                    df['target'] = df['close'].shift(-1) / df['close'] - 1
                elif target == 'next_day_direction':
                    df['target'] = (df['close'].shift(-1) > df['close']).astype(int)
                elif target == 'price_change_5d':
                    df['target'] = df['close'].shift(-5) / df['close'] - 1
                elif target == 'multi_feature_next_day':
                    df['target'] = df['close'].shift(-1) / df['close'] - 1
                elif target == 'next_day_ohlc':
                    df['target'] = df['close'].shift(-1) / df['close'] - 1
                elif target == 'trend_30d':
                    df['target'] = df['close'].shift(-30) / df['close'] - 1
                elif target == 'trend_60d':
                    df['target'] = df['close'].shift(-60) / df['close'] - 1
                elif target == 'trend_90d':
                    df['target'] = df['close'].shift(-90) / df['close'] - 1
                elif target == 'time_to_gain_pct':
                    gain_target = user_model.target_config.get('gain_pct', 10) if user_model.target_config else 10
                    days_to_target = pd.Series(np.nan, index=df.index)
                    for i in range(1, 61):
                        future_val = df['close'].shift(-i) / df['close'] - 1
                        mask = (future_val >= gain_target / 100) & days_to_target.isna()
                        days_to_target[mask] = i
                    df['target'] = days_to_target / 5
                else:
                    df['target'] = df['close'].shift(-1) / df['close'] - 1
                
                relevant_cols = feature_cols + ['target']
                df_clean = df[relevant_cols].dropna()
                
                min_clean = 20
                if model_type in ['lstm', 'gru']:
                    min_clean = max(20, seq_len + 5)
                elif feature_window > 1:
                    min_clean = max(20, feature_window + 5)
                
                if len(df_clean) < min_clean:
                    skip_reasons.append(f"{code}: 清洗后数据不足{len(df_clean)}条（需≥{min_clean}）")
                    continue
                
                df_features = df_clean[feature_cols].copy()
                df_features = (df_features - df_features.mean()) / df_features.std()
                
                X_stock = df_features.values
                y_stock = df_clean['target'].values
                
                if model_type in ['lstm', 'gru']:
                    if len(X_stock) > seq_len:
                        for i in range(len(X_stock) - seq_len):
                            all_features.append(X_stock[i:i+seq_len])
                            all_labels.append(y_stock[i+seq_len])
                        self._log(task_id, f"股票 {code}: 生成 {len(X_stock) - seq_len} 条序列样本")
                    else:
                        skip_reasons.append(f"{code}: 数据不足以构建长度{seq_len}的序列")
                        continue
                elif feature_window > 1:
                    X_windowed = self._construct_window_features(X_stock, feature_window)
                    y_windowed = y_stock[feature_window-1:]
                    if len(X_windowed) > 0:
                        all_features.append(X_windowed)
                        all_labels.append(y_windowed)
                        self._log(task_id, f"股票 {code}: 生成 {len(X_windowed)} 条窗口样本（窗口={feature_window}日）")
                    else:
                        skip_reasons.append(f"{code}: 窗口特征构建失败")
                        continue
                else:
                    all_features.append(X_stock)
                    all_labels.append(y_stock)
            finally:
                processed_stocks += 1
                data_preparation_progress = int(processed_stocks / total_stocks * 100)
                elapsed = time.time() - training_progress[task_id].get('start_time', time.time())
                training_progress[task_id] = {
                    'stage': 'data_preparation',
                    'progress': data_preparation_progress,
                    'start_time': training_progress[task_id].get('start_time'),
                    'data_preparation_progress': data_preparation_progress,
                    'current_stock': code,
                    'total_stocks': total_stocks,
                    'elapsed_seconds': elapsed,
                    'estimated_remaining_seconds': estimate_remaining_seconds(elapsed, data_preparation_progress),
                }
        
        if not all_features:
            detail = '；'.join(skip_reasons) if skip_reasons else '未选择任何股票'
            raise ValueError(f"没有足够的数据进行训练。原因：{detail}")
        
        if model_type in ['lstm', 'gru']:
            X = np.array(all_features)
            y = np.array(all_labels)
        else:
            X = np.vstack(all_features)
            y = np.concatenate(all_labels)
        
        split_idx = int(len(X) * 0.8)
        X_train, X_val = X[:split_idx], X[split_idx:]
        y_train, y_val = y[:split_idx], y[split_idx:]
        
        return X_train, X_val, y_train, y_val
    
    def _construct_window_features(self, X: np.ndarray, window_size: int) -> np.ndarray:
        """构建窗口特征：将最近N日的特征展平拼接为单一向量
        
        对于每个时间步t，输入特征为 [f(t-W+1), f(t-W+2), ..., f(t)] 的展平结果，
        使模型获得时序上下文信息，而非仅依赖单日截面数据。
        
        Args:
            X: 特征矩阵 (T, D)
            window_size: 窗口天数
        
        Returns:
            窗口特征矩阵 (T-window_size+1, window_size*D)
        """
        T, D = X.shape
        n_samples = T - window_size + 1
        
        if n_samples <= 0:
            return np.empty((0, window_size * D))
        
        result = np.zeros((n_samples, window_size * D))
        for i in range(n_samples):
            result[i] = X[i:i+window_size].flatten()
        
        return result
    
    def _compute_feature_importance(self, model, model_type: str, feature_cols: list,
                                     X_train: np.ndarray = None, y_train: np.ndarray = None) -> dict:
        """计算特征重要性，返回 {特征名: 归一化重要性} 字典
        
        策略因模型类型而异：
        - 树模型（xgboost / lightgbm / randomforest）：直接读取 feature_importances_
        - MLP：基于排列重要性（permutation importance），衡量打乱某特征后预测偏差程度
        - LSTM / GRU：序列模型特征重要性难以可靠估计，跳过
        """
        importance = {}
        if not feature_cols:
            return importance
        
        try:
            if model_type in ('xgboost', 'lightgbm', 'randomforest'):
                if hasattr(model, 'feature_importances_'):
                    imp = model.feature_importances_
                elif hasattr(model, 'get_booster'):
                    raw = model.get_booster().get_score(importance_type='gain')
                    imp = np.array([raw.get(f'f{i}', 0) for i in range(len(feature_cols))])
                else:
                    return importance
                
                if isinstance(imp, np.ndarray):
                    total = imp.sum()
                    if total > 0:
                        imp = imp / total
                    for i, col in enumerate(feature_cols):
                        if i < len(imp):
                            importance[col] = round(float(imp[i]), 4)
            
            elif model_type == 'mlp' and X_train is not None and y_train is not None:
                if not TORCH_AVAILABLE:
                    return importance
                if not hasattr(model, 'parameters'):
                    return importance
                
                # 限制采样量，避免排列重要性计算耗时过长
                sample_size = min(500, len(X_train))
                indices = np.random.choice(len(X_train), sample_size, replace=False)
                X_sample = X_train[indices]
                y_sample = y_train[indices]
                
                X_t = torch.FloatTensor(X_sample)
                with torch.no_grad():
                    pred_orig = model(X_t).numpy().flatten()
                baseline_error = np.mean((pred_orig - y_sample) ** 2)
                
                if baseline_error < 1e-12:
                    return importance
                
                perm_imp = np.zeros(len(feature_cols))
                for j in range(len(feature_cols)):
                    X_perm = X_sample.copy()
                    np.random.shuffle(X_perm[:, j])
                    X_t_perm = torch.FloatTensor(X_perm)
                    with torch.no_grad():
                        pred_perm = model(X_t_perm).numpy().flatten()
                    perm_error = np.mean((pred_perm - y_sample) ** 2)
                    perm_imp[j] = max(perm_error - baseline_error, 0)
                
                total = perm_imp.sum()
                if total > 0:
                    perm_imp = perm_imp / total
                    for i, col in enumerate(feature_cols):
                        importance[col] = round(float(perm_imp[i]), 4)
        except Exception:
            pass
        
        return importance
    
    def _train_pytorch_model(
        self, task_id, model_type, config,
        X_train, X_val, y_train, y_val,
        feature_window=1
    ):
        """训练PyTorch模型
        
        LSTM/GRU: _prepare_data已构建3D序列数据，此处直接使用
        MLP: _prepare_data已构建2D窗口特征（若feature_window>1），此处直接使用
        """
        global training_progress
        
        config.setdefault('hidden_size', 64)
        config.setdefault('num_layers', 2)
        config.setdefault('dropout', 0.2)
        config.setdefault('learning_rate', 0.001)
        config.setdefault('epochs', 100)
        config.setdefault('batch_size', 32)
        config.setdefault('hidden_layers', [128, 64])
        config.setdefault('activation', 'relu')
        config.setdefault('sequence_length', 20)
        
        device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        
        X_train_t = torch.FloatTensor(X_train).to(device)
        y_train_t = torch.FloatTensor(y_train).to(device)
        X_val_t = torch.FloatTensor(X_val).to(device)
        y_val_t = torch.FloatTensor(y_val).to(device)
        
        input_size = X_train.shape[-1]
        output_size = 1
        
        if model_type == 'lstm':
            model = LSTMModel(
                input_size, config['hidden_size'], config['num_layers'],
                output_size, config['dropout']
            ).to(device)
        elif model_type == 'gru':
            model = GRUModel(
                input_size, config['hidden_size'], config['num_layers'],
                output_size, config['dropout']
            ).to(device)
        else:
            model = MLPModel(
                input_size, config['hidden_layers'],
                output_size, config['dropout'], config['activation']
            ).to(device)
        
        criterion = nn.MSELoss()
        optimizer = torch.optim.Adam(model.parameters(), lr=config['learning_rate'])
        
        epochs = config['epochs']
        batch_size = config['batch_size']
        
        best_val_loss = float('inf')
        train_losses = []
        val_losses = []
        
        training_start_time = training_progress.get(task_id, {}).get('start_time', time.time())
        
        for epoch in range(epochs):
            model.train()
            epoch_loss = 0
            
            for i in range(0, len(X_train_t), batch_size):
                batch_x = X_train_t[i:i+batch_size]
                batch_y = y_train_t[i:i+batch_size]
                
                optimizer.zero_grad()
                outputs = model(batch_x).squeeze()
                loss = criterion(outputs, batch_y)
                loss.backward()
                optimizer.step()
                
                epoch_loss += loss.item()
            
            model.eval()
            with torch.no_grad():
                val_outputs = model(X_val_t).squeeze()
                val_loss = criterion(val_outputs, y_val_t).item()
            
            train_losses.append(epoch_loss / (len(X_train_t) // batch_size + 1))
            val_losses.append(val_loss)
            
            progress = int((epoch + 1) / epochs * 100)
            elapsed = time.time() - training_start_time
            training_progress[task_id] = {
                'stage': 'training',
                'progress': progress,
                'epoch': epoch + 1,
                'total_epochs': epochs,
                'train_loss': train_losses[-1],
                'val_loss': val_loss,
                'start_time': training_start_time,
                'elapsed_seconds': elapsed,
                'estimated_remaining_seconds': estimate_remaining_seconds(elapsed, progress),
            }
            
            if (epoch + 1) % 10 == 0 or epoch == epochs - 1:
                self._log(task_id, f"Epoch {epoch+1}/{epochs} | 训练损失: {train_losses[-1]:.6f} | 验证损失: {val_loss:.6f}")
            
            if val_loss < best_val_loss:
                best_val_loss = val_loss
                ModelCheckpoint.save_checkpoint(
                    model, task_id, 
                    {'best_val_loss': float(best_val_loss)},
                    config, model_type, input_size=input_size,
                    feature_window=feature_window
                )
        
        model.eval()
        with torch.no_grad():
            predictions = model(X_val_t).squeeze().cpu().numpy()
        
        mse = np.mean((predictions - y_val) ** 2)
        rmse = np.sqrt(mse)
        mae = np.mean(np.abs(predictions - y_val))
        
        metrics = {
            'mse': float(mse),
            'rmse': float(rmse),
            'mae': float(mae),
            'best_val_loss': float(best_val_loss),
            'train_losses': train_losses,
            'val_losses': val_losses
        }
        
        return metrics
    
    def _train_sklearn_model(
        self, task_id, model_type, config,
        X_train, X_val, y_train, y_val,
        feature_window=1
    ):
        """训练sklearn模型"""
        global training_progress
        
        if model_type == 'xgboost':
            from xgboost import XGBRegressor
            valid_params = {'n_estimators', 'max_depth', 'learning_rate', 'subsample',
                            'colsample_bytree', 'min_child_weight', 'gamma', 'reg_alpha',
                            'reg_lambda', 'objective', 'random_state', 'n_jobs'}
            filtered = {k: v for k, v in config.items() if k in valid_params}
            model = XGBRegressor(**filtered)
        elif model_type == 'lightgbm':
            from lightgbm import LGBMRegressor
            valid_params = {'n_estimators', 'max_depth', 'learning_rate', 'subsample',
                            'colsample_bytree', 'min_child_weight', 'reg_alpha',
                            'reg_lambda', 'objective', 'random_state', 'n_jobs',
                            'num_leaves', 'min_data_in_leaf'}
            filtered = {k: v for k, v in config.items() if k in valid_params}
            model = LGBMRegressor(**filtered)
        elif model_type == 'randomforest':
            from sklearn.ensemble import RandomForestRegressor
            valid_params = {'n_estimators', 'max_depth', 'min_samples_split', 'min_samples_leaf',
                            'max_features', 'random_state', 'n_jobs'}
            filtered = {k: v for k, v in config.items() if k in valid_params}
            model = RandomForestRegressor(**filtered)
        else:
            raise ValueError(f"不支持的模型类型: {model_type}")
        
        training_start_time = training_progress.get(task_id, {}).get('start_time', time.time())
        
        elapsed = time.time() - training_start_time
        training_progress[task_id] = {
            'stage': 'training',
            'progress': 10,
            'start_time': training_start_time,
            'elapsed_seconds': elapsed,
            'estimated_remaining_seconds': estimate_remaining_seconds(elapsed, 10),
        }
        self._log(task_id, f"开始训练 {model_type} 模型，参数: {config}")

        elapsed = time.time() - training_start_time
        training_progress[task_id] = {
            'stage': 'training',
            'progress': 30,
            'start_time': training_start_time,
            'elapsed_seconds': elapsed,
            'estimated_remaining_seconds': estimate_remaining_seconds(elapsed, 30),
        }
        self._log(task_id, "数据准备完成，开始拟合模型...")
        model.fit(X_train, y_train)

        elapsed = time.time() - training_start_time
        training_progress[task_id] = {
            'stage': 'validating',
            'progress': 80,
            'start_time': training_start_time,
            'elapsed_seconds': elapsed,
            'estimated_remaining_seconds': estimate_remaining_seconds(elapsed, 80),
        }
        self._log(task_id, "模型拟合完成，正在验证...")
        
        predictions = model.predict(X_val)
        
        from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
        
        mse = mean_squared_error(y_val, predictions)
        rmse = np.sqrt(mse)
        mae = mean_absolute_error(y_val, predictions)
        r2 = r2_score(y_val, predictions)
        
        input_size = X_train.shape[-1]
        metrics = {
            'mse': float(mse),
            'rmse': float(rmse),
            'mae': float(mae),
            'r2': float(r2)
        }
        
        ModelCheckpoint.save_checkpoint(
            model, task_id, metrics,
            config, model_type, input_size=input_size,
            feature_window=feature_window
        )
        
        return metrics
