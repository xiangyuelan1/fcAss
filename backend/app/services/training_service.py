"""
训练服务 - 负责模型训练和评估
"""
import os
import json
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
    def save_checkpoint(model, task_id: int, metrics: Dict[str, Any], model_config: Dict[str, Any], model_type: str, input_size: int = 0):
        """保存模型检查点，包含完整的模型结构和配置
        
        Args:
            input_size: 模型输入特征维度，回测和预测时需要此信息重建模型
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
            }
            torch.save(checkpoint, checkpoint_path)
        else:
            checkpoint = {
                'model_type': model_type,
                'model': model,
                'model_config': model_config,
                'metrics': metrics,
                'input_size': input_size,
            }
            with open(checkpoint_path, 'wb') as f:
                pickle.dump(checkpoint, f)
        
        return checkpoint_path
    
    @staticmethod
    def load_checkpoint(task_id: int, model_type: str = None, model_config: Dict[str, Any] = None, input_size: int = 0):
        """加载模型检查点
        
        自动检测文件格式（PyTorch或pickle），优先从checkpoint中读取input_size
        """
        checkpoint_path = os.path.join(settings.MODEL_DIR, f'task_{task_id}_checkpoint.pt')
        
        if not os.path.exists(checkpoint_path):
            raise FileNotFoundError(f"模型检查点不存在: {checkpoint_path}")
        
        # 自动检测文件格式：PyTorch文件以PK开头（ZIP格式），pickle文件以0x80开头
        with open(checkpoint_path, 'rb') as f:
            magic = f.read(4)
        
        is_pytorch = magic[:2] == b'PK'
        
        if is_pytorch:
            checkpoint = torch.load(checkpoint_path, map_location='cpu', weights_only=False)
            actual_type = checkpoint.get('model_type', model_type)
            actual_config = checkpoint.get('model_config', model_config or {})
            actual_input_size = checkpoint.get('input_size', input_size)
            
            if actual_input_size <= 0:
                raise ValueError(f"模型检查点中input_size无效: {actual_input_size}，请重新训练模型")
            
            model = create_pytorch_model(actual_type, actual_input_size, actual_config)
            model.load_state_dict(checkpoint['model_state_dict'])
            model.eval()
            return model, checkpoint.get('metrics', {}), actual_input_size
        else:
            with open(checkpoint_path, 'rb') as f:
                checkpoint = pickle.load(f)
            actual_input_size = checkpoint.get('input_size', input_size)
            return checkpoint['model'], checkpoint.get('metrics', {}), actual_input_size


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
        
        # 清空旧日志
        log_path = os.path.join(settings.MODEL_DIR, f'task_{task_id}_log.txt')
        if os.path.exists(log_path):
            os.remove(log_path)
        
        # 更新状态
        task.status = 'running'
        task.start_time = datetime.now()
        self.db.commit()
        
        try:
            # 获取模型配置
            user_model = task.user_model
            model_type = user_model.model_type
            model_config = user_model.model_config
            
            self._log(task_id, f"开始训练 | 模型类型: {model_type}")
            self._log(task_id, f"特征指标: {', '.join(user_model.features or [])}")
            self._log(task_id, f"训练股票: {', '.join(user_model.stock_codes or [])}")
            self._log(task_id, f"预测目标: {user_model.target}")
            if user_model.target == 'multi_feature_next_day':
                self._log(task_id, "多维预测模式：训练主目标为收益率，波动率与量变率在预测阶段基于特征推导")
            
            # 准备数据
            training_progress[task_id] = {'stage': 'data_preparation', 'progress': 0}
            self._log(task_id, "阶段1: 数据准备中...")
            
            X_train, X_val, y_train, y_val = self._prepare_data(user_model, task_id)
            
            self._log(task_id, f"数据准备完成 | 训练集: {X_train.shape[0]}条, 验证集: {X_val.shape[0]}条, 特征维度: {X_train.shape[1]}")
            
            # 训练模型
            training_progress[task_id] = {'stage': 'training', 'progress': 0}
            self._log(task_id, "阶段2: 模型训练中...")
            
            if model_type in ['lstm', 'gru', 'mlp']:
                if not TORCH_AVAILABLE:
                    raise ValueError("PyTorch未安装，无法训练深度学习模型。请安装torch或选择其他模型类型。")
                metrics = self._train_pytorch_model(
                    task_id, model_type, model_config,
                    X_train, X_val, y_train, y_val
                )
            else:
                metrics = self._train_sklearn_model(
                    task_id, model_type, model_config,
                    X_train, X_val, y_train, y_val
                )
            
            # 更新任务状态
            task.status = 'completed'
            task.end_time = datetime.now()
            task.metrics = metrics
            self.db.commit()
            
            # 更新模型状态
            user_model.status = 'trained'
            self.db.commit()
            
            training_progress[task_id] = {'stage': 'completed', 'progress': 100}
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
        
        对每只股票：获取价格 → 计算特征 → 生成标签 → 标准化
        合并所有股票数据后按时间序列 80/20 划分训练集和验证集
        
        Args:
            user_model: 用户模型配置
            task_id: 训练任务ID，用于日志记录
        """
        features = []
        labels = []
        skip_reasons = []
        
        for code in user_model.stock_codes:
            # 自动获取缺失的股票数据（共享缓存+动态获取）
            existing_prices = self.data_service.get_stock_prices(code=code, limit=1)
            if len(existing_prices) == 0:
                self._log(task_id, f"股票 {code} 本地无数据，正在自动获取...")
                try:
                    result = self.data_service.fetch_stock_data(code)
                    fetched_count = result.get('price_count', 0)
                    self._log(task_id, f"已自动获取 {code} 的 {fetched_count} 条数据")
                except Exception as e:
                    self._log(task_id, f"自动获取 {code} 数据失败: {str(e)}")

            # 获取价格数据
            prices = self.data_service.get_stock_prices(
                code=code,
                start_date=user_model.train_date_range.get('start') if user_model.train_date_range else None,
                end_date=user_model.train_date_range.get('end') if user_model.train_date_range else None,
                limit=5000
            )
            
            if len(prices) < 30:
                skip_reasons.append(f"{code}: 价格数据不足{len(prices)}条（需≥30）")
                continue
            
            # 计算特征（传递feature_config以使用用户配置的指标参数）
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
            
            # 准备特征列：排除原始价格列、ID和元数据列，保留技术指标列
            exclude_cols = {'id', 'stock_code', 'open', 'high', 'low', 'close', 'volume', 'amount',
                            'change_pct', 'change_amount', 'adj_close'}
            feature_cols = [col for col in df.columns if col not in exclude_cols]
            
            if not feature_cols:
                skip_reasons.append(f"{code}: 无可用特征列")
                continue
            
            # 根据目标类型生成标签
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
                # 预测次日开盘价、最高价、最低价、收盘价（归一化）
                df['target'] = df['close'].shift(-1) / df['close'] - 1
            elif target == 'trend_30d':
                df['target'] = df['close'].shift(-30) / df['close'] - 1
            elif target == 'trend_60d':
                df['target'] = df['close'].shift(-60) / df['close'] - 1
            elif target == 'trend_90d':
                df['target'] = df['close'].shift(-90) / df['close'] - 1
            elif target == 'time_to_gain_pct':
                # 预测达到涨幅X%所需交易日数（近似为周数）
                gain_target = user_model.target_config.get('gain_pct', 10) if user_model.target_config else 10
                days_to_target = pd.Series(np.nan, index=df.index)
                for i in range(1, 61):
                    future_val = df['close'].shift(-i) / df['close'] - 1
                    mask = (future_val >= gain_target / 100) & days_to_target.isna()
                    days_to_target[mask] = i
                df['target'] = days_to_target / 5  # 转换为周数
            else:
                df['target'] = df['close'].shift(-1) / df['close'] - 1
            
            # 仅对特征列和目标列做dropna（避免amount等无关列的NaN污染）
            relevant_cols = feature_cols + ['target']
            df_clean = df[relevant_cols].dropna()
            
            if len(df_clean) < 20:
                skip_reasons.append(f"{code}: 清洗后数据不足{len(df_clean)}条（需≥20）")
                continue
            
            # Z-score标准化
            df_features = df_clean[feature_cols].copy()
            df_features = (df_features - df_features.mean()) / df_features.std()
            
            features.append(df_features.values)
            labels.append(df_clean['target'].values)
        
        if not features:
            detail = '；'.join(skip_reasons) if skip_reasons else '未选择任何股票'
            raise ValueError(f"没有足够的数据进行训练。原因：{detail}")
        
        # 合并数据
        X = np.vstack(features)
        y = np.concatenate(labels)
        
        # 按时间序列划分训练集和验证集（80/20）
        split_idx = int(len(X) * 0.8)
        X_train, X_val = X[:split_idx], X[split_idx:]
        y_train, y_val = y[:split_idx], y[split_idx:]
        
        return X_train, X_val, y_train, y_val
    
    def _train_pytorch_model(
        self, task_id, model_type, config,
        X_train, X_val, y_train, y_val
    ):
        """训练PyTorch模型"""
        global training_progress
        
        # 填充config默认值，避免直接访问不存在的键导致KeyError
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
        
        # 转换为tensor
        if model_type in ['lstm', 'gru']:
            # 序列数据
            seq_len = config.get('sequence_length', 20)
            X_train_seq = []
            y_train_seq = []
            for i in range(len(X_train) - seq_len):
                X_train_seq.append(X_train[i:i+seq_len])
                y_train_seq.append(y_train[i+seq_len])
            X_train = np.array(X_train_seq)
            y_train = np.array(y_train_seq)
            
            X_val_seq = []
            y_val_seq = []
            for i in range(len(X_val) - seq_len):
                X_val_seq.append(X_val[i:i+seq_len])
                y_val_seq.append(y_val[i+seq_len])
            X_val = np.array(X_val_seq)
            y_val = np.array(y_val_seq)
        
        X_train_t = torch.FloatTensor(X_train).to(device)
        y_train_t = torch.FloatTensor(y_train).to(device)
        X_val_t = torch.FloatTensor(X_val).to(device)
        y_val_t = torch.FloatTensor(y_val).to(device)
        
        # 创建模型
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
        else:  # mlp
            model = MLPModel(
                input_size, config['hidden_layers'],
                output_size, config['dropout'], config['activation']
            ).to(device)
        
        # 训练配置
        criterion = nn.MSELoss()
        optimizer = torch.optim.Adam(model.parameters(), lr=config['learning_rate'])
        
        epochs = config['epochs']
        batch_size = config['batch_size']
        
        # 训练循环
        best_val_loss = float('inf')
        train_losses = []
        val_losses = []
        
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
            
            # 验证
            model.eval()
            with torch.no_grad():
                val_outputs = model(X_val_t).squeeze()
                val_loss = criterion(val_outputs, y_val_t).item()
            
            train_losses.append(epoch_loss / (len(X_train_t) // batch_size + 1))
            val_losses.append(val_loss)
            
            # 更新进度
            progress = int((epoch + 1) / epochs * 100)
            training_progress[task_id] = {
                'stage': 'training',
                'progress': progress,
                'epoch': epoch + 1,
                'train_loss': train_losses[-1],
                'val_loss': val_loss
            }
            
            # 每10个epoch或最后一个epoch记录日志
            if (epoch + 1) % 10 == 0 or epoch == epochs - 1:
                self._log(task_id, f"Epoch {epoch+1}/{epochs} | 训练损失: {train_losses[-1]:.6f} | 验证损失: {val_loss:.6f}")
            
            # 保存最佳模型（使用新的检查点格式，包含input_size）
            if val_loss < best_val_loss:
                best_val_loss = val_loss
                ModelCheckpoint.save_checkpoint(
                    model, task_id, 
                    {'best_val_loss': float(best_val_loss)},
                    config, model_type, input_size=input_size
                )
        
        # 计算指标
        model.eval()
        with torch.no_grad():
            predictions = model(X_val_t).squeeze().cpu().numpy()
        
        mse = np.mean((predictions - y_val) ** 2)
        rmse = np.sqrt(mse)
        mae = np.mean(np.abs(predictions - y_val))
        
        # 保存指标
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
        X_train, X_val, y_train, y_val
    ):
        """训练sklearn模型"""
        global training_progress
        
        # 各模型类型的合法参数白名单，过滤掉不属于当前模型的参数，避免传入无效参数导致报错
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
        
        # 训练
        training_progress[task_id] = {'stage': 'training', 'progress': 50}
        self._log(task_id, f"开始训练 {model_type} 模型，参数: {config}")
        model.fit(X_train, y_train)
        training_progress[task_id] = {'stage': 'training', 'progress': 100}
        self._log(task_id, "模型训练完成")
        
        # 预测
        predictions = model.predict(X_val)
        
        # 计算指标
        from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
        
        mse = mean_squared_error(y_val, predictions)
        rmse = np.sqrt(mse)
        mae = mean_absolute_error(y_val, predictions)
        r2 = r2_score(y_val, predictions)
        
        # 保存模型（使用检查点格式，包含input_size）
        input_size = X_train.shape[-1]
        metrics = {
            'mse': float(mse),
            'rmse': float(rmse),
            'mae': float(mae),
            'r2': float(r2)
        }
        
        ModelCheckpoint.save_checkpoint(
            model, task_id, metrics,
            config, model_type, input_size=input_size
        )
        
        return metrics
