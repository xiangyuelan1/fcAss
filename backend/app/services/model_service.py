"""
模型服务 - 负责用户模型的CRUD和管理
"""
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any

from app.models.user_model import UserModel


class ModelService:
    """模型服务类"""
    
    # 支持的模型类型配置
    MODEL_TYPES = {
        'lstm': {
            'name': 'LSTM',
            'description': '长短期记忆网络，适合时序预测',
            'category': '深度学习',
            'default_config': {
                'hidden_size': 128,
                'num_layers': 2,
                'dropout': 0.2,
                'sequence_length': 20,
                'learning_rate': 0.001,
                'epochs': 100,
                'batch_size': 32
            },
            'param_schema': {
                'hidden_size': {'type': 'int', 'min': 16, 'max': 512, 'step': 16,
                    'description': 'LSTM隐藏层神经元数量，越大模型容量越大但越容易过拟合。推荐64~256'},
                'num_layers': {'type': 'int', 'min': 1, 'max': 5, 'step': 1,
                    'description': 'LSTM堆叠层数，1~2层通常足够，3层以上需要更多数据'},
                'dropout': {'type': 'float', 'min': 0.0, 'max': 0.5, 'step': 0.1,
                    'description': 'Dropout比率，防止过拟合。0表示不丢弃，0.2~0.3较常用'},
                'sequence_length': {'type': 'int', 'min': 5, 'max': 100, 'step': 5,
                    'description': '输入序列长度（回看天数），20表示用过去20天数据预测'},
                'learning_rate': {'type': 'float', 'min': 0.0001, 'max': 0.01, 'step': 0.0001,
                    'description': '学习率，控制每次参数更新幅度。太大不收敛，太小训练慢'},
                'epochs': {'type': 'int', 'min': 10, 'max': 500, 'step': 10,
                    'description': '训练轮数，数据少时可增大。过多会过拟合'},
                'batch_size': {'type': 'int', 'min': 8, 'max': 128, 'step': 8,
                    'description': '每批训练样本数，影响训练速度和稳定性'}
            }
        },
        'gru': {
            'name': 'GRU',
            'description': '门控循环单元，LSTM的简化版本',
            'category': '深度学习',
            'default_config': {
                'hidden_size': 128,
                'num_layers': 2,
                'dropout': 0.2,
                'sequence_length': 20,
                'learning_rate': 0.001,
                'epochs': 100,
                'batch_size': 32
            },
            'param_schema': {
                'hidden_size': {'type': 'int', 'min': 16, 'max': 512, 'step': 16,
                    'description': 'GRU隐藏层神经元数量，越大模型容量越大但越容易过拟合'},
                'num_layers': {'type': 'int', 'min': 1, 'max': 5, 'step': 1,
                    'description': 'GRU堆叠层数，1~2层通常足够'},
                'dropout': {'type': 'float', 'min': 0.0, 'max': 0.5, 'step': 0.1,
                    'description': 'Dropout比率，防止过拟合'},
                'sequence_length': {'type': 'int', 'min': 5, 'max': 100, 'step': 5,
                    'description': '输入序列长度（回看天数）'},
                'learning_rate': {'type': 'float', 'min': 0.0001, 'max': 0.01, 'step': 0.0001,
                    'description': '学习率，控制参数更新幅度'},
                'epochs': {'type': 'int', 'min': 10, 'max': 500, 'step': 10,
                    'description': '训练轮数'},
                'batch_size': {'type': 'int', 'min': 8, 'max': 128, 'step': 8,
                    'description': '每批训练样本数'}
            }
        },
        'xgboost': {
            'name': 'XGBoost',
            'description': '极端梯度提升，高效准确',
            'category': '集成学习',
            'default_config': {
                'n_estimators': 100,
                'max_depth': 6,
                'learning_rate': 0.1,
                'subsample': 0.8,
                'colsample_bytree': 0.8,
                'reg_alpha': 0.0,
                'reg_lambda': 1.0
            },
            'param_schema': {
                'n_estimators': {'type': 'int', 'min': 10, 'max': 1000, 'step': 10,
                    'description': '树的数量，越多越精确但越慢。100~300通常足够'},
                'max_depth': {'type': 'int', 'min': 2, 'max': 15, 'step': 1,
                    'description': '树的最大深度，越深越容易过拟合。3~8较常用'},
                'learning_rate': {'type': 'float', 'min': 0.01, 'max': 0.5, 'step': 0.01,
                    'description': '学习率（收缩步长），小学习率+多树效果更好'},
                'subsample': {'type': 'float', 'min': 0.5, 'max': 1.0, 'step': 0.1,
                    'description': '样本采样比例，<1可防止过拟合。0.7~0.9常用'},
                'colsample_bytree': {'type': 'float', 'min': 0.5, 'max': 1.0, 'step': 0.1,
                    'description': '特征采样比例，每棵树随机选择部分特征'},
                'reg_alpha': {'type': 'float', 'min': 0.0, 'max': 10.0, 'step': 0.1,
                    'description': 'L1正则化系数，增大可做特征选择、防止过拟合'},
                'reg_lambda': {'type': 'float', 'min': 0.0, 'max': 10.0, 'step': 0.1,
                    'description': 'L2正则化系数，平滑权重、防止过拟合'}
            }
        },
        'lightgbm': {
            'name': 'LightGBM',
            'description': '轻量级梯度提升，速度快',
            'category': '集成学习',
            'default_config': {
                'n_estimators': 100,
                'max_depth': -1,
                'learning_rate': 0.1,
                'num_leaves': 31,
                'subsample': 0.8,
                'colsample_bytree': 0.8,
                'reg_alpha': 0.0,
                'reg_lambda': 0.0
            },
            'param_schema': {
                'n_estimators': {'type': 'int', 'min': 10, 'max': 1000, 'step': 10,
                    'description': '树的数量，越多越精确但越慢'},
                'max_depth': {'type': 'int', 'min': -1, 'max': 15, 'step': 1,
                    'description': '树的最大深度，-1表示不限制。通常用num_leaves控制'},
                'learning_rate': {'type': 'float', 'min': 0.01, 'max': 0.5, 'step': 0.01,
                    'description': '学习率'},
                'num_leaves': {'type': 'int', 'min': 10, 'max': 150, 'step': 5,
                    'description': '叶子节点数，主要复杂度控制参数。2^max_depth为理论上限'},
                'subsample': {'type': 'float', 'min': 0.5, 'max': 1.0, 'step': 0.1,
                    'description': '样本采样比例'},
                'colsample_bytree': {'type': 'float', 'min': 0.5, 'max': 1.0, 'step': 0.1,
                    'description': '特征采样比例'},
                'reg_alpha': {'type': 'float', 'min': 0.0, 'max': 10.0, 'step': 0.1,
                    'description': 'L1正则化系数'},
                'reg_lambda': {'type': 'float', 'min': 0.0, 'max': 10.0, 'step': 0.1,
                    'description': 'L2正则化系数'}
            }
        },
        'randomforest': {
            'name': 'Random Forest',
            'description': '随机森林，稳定可靠',
            'category': '集成学习',
            'default_config': {
                'n_estimators': 100,
                'max_depth': 10,
                'min_samples_split': 2,
                'min_samples_leaf': 1,
                'max_features': 'sqrt'
            },
            'param_schema': {
                'n_estimators': {'type': 'int', 'min': 10, 'max': 500, 'step': 10,
                    'description': '树的数量，越多越稳定但越慢。100~200通常足够'},
                'max_depth': {'type': 'int', 'min': 2, 'max': 50, 'step': 1,
                    'description': '树的最大深度，越深越容易过拟合'},
                'min_samples_split': {'type': 'int', 'min': 2, 'max': 20, 'step': 1,
                    'description': '分裂节点所需最小样本数，增大可防止过拟合'},
                'min_samples_leaf': {'type': 'int', 'min': 1, 'max': 20, 'step': 1,
                    'description': '叶子节点最小样本数，增大可平滑模型'},
                'max_features': {'type': 'select', 'options': ['sqrt', 'log2', None],
                    'description': '每棵树考虑的特征数，sqrt=sqrt(n_features)'}
            }
        },
        'mlp': {
            'name': 'MLP',
            'description': '多层感知机神经网络',
            'category': '深度学习',
            'default_config': {
                'hidden_layers': [128, 64],
                'dropout': 0.2,
                'learning_rate': 0.001,
                'epochs': 100,
                'batch_size': 32,
                'activation': 'relu'
            },
            'param_schema': {
                'hidden_layers': {'type': 'array',
                    'description': '隐藏层大小列表，如[128,64]表示两个隐藏层分别128和64个神经元。层数1~4层，每层16~512'},
                'dropout': {'type': 'float', 'min': 0.0, 'max': 0.5, 'step': 0.1,
                    'description': 'Dropout比率，防止过拟合'},
                'learning_rate': {'type': 'float', 'min': 0.0001, 'max': 0.01, 'step': 0.0001,
                    'description': '学习率'},
                'epochs': {'type': 'int', 'min': 10, 'max': 500, 'step': 10,
                    'description': '训练轮数'},
                'batch_size': {'type': 'int', 'min': 8, 'max': 128, 'step': 8,
                    'description': '每批训练样本数'},
                'activation': {'type': 'select', 'options': ['relu', 'tanh', 'sigmoid'],
                    'description': '激活函数，relu最常用且训练快，tanh适合归一化输出'}
            }
        }
    }
    
    def __init__(self, db: Session = None):
        self.db = db
    
    def get_available_model_types(self) -> List[Dict[str, Any]]:
        """获取可用的模型类型列表"""
        types = []
        for key, value in self.MODEL_TYPES.items():
            types.append({
                'key': key,
                'name': value['name'],
                'description': value['description'],
                'category': value['category'],
                'default_config': value['default_config'],
                'param_schema': value['param_schema']
            })
        return types
    
    def get_models(self, skip: int = 0, limit: int = 100, user_id: Optional[int] = None) -> List[UserModel]:
        """获取用户模型列表，按 user_id 过滤"""
        query = self.db.query(UserModel)
        if user_id is not None:
            query = query.filter(UserModel.user_id == user_id)
        return query.offset(skip).limit(limit).all()
    
    def get_model(self, model_id: int) -> Optional[UserModel]:
        """根据ID获取模型"""
        return self.db.query(UserModel).filter(UserModel.id == model_id).first()
    
    def create_model(
        self,
        name: str,
        model_type: str,
        model_config: Dict[str, Any],
        features: List[str],
        target: str,
        stock_codes: List[str],
        user_id: Optional[int] = None,
        description: Optional[str] = None,
        feature_config: Optional[Dict[str, Any]] = None,
        feature_window: Optional[int] = None,
        target_config: Optional[Dict[str, Any]] = None,
        train_date_range: Optional[Dict[str, str]] = None
    ) -> UserModel:
        """创建新模型，绑定 user_id"""
        
        if model_type not in self.MODEL_TYPES:
            raise ValueError(f"不支持的模型类型: {model_type}")
        
        model = UserModel(
            user_id=user_id,
            name=name,
            description=description,
            model_type=model_type,
            model_config=model_config,
            features=features,
            feature_config=feature_config or {},
            feature_window=feature_window if feature_window is not None else 5,
            target=target,
            target_config=target_config or {},
            stock_codes=stock_codes,
            train_date_range=train_date_range,
            status='draft'
        )
        
        self.db.add(model)
        self.db.commit()
        self.db.refresh(model)
        
        return model
    
    def update_model(self, model_id: int, **kwargs) -> UserModel:
        """更新模型"""
        model = self.get_model(model_id)
        if not model:
            raise ValueError(f"模型 {model_id} 不存在")
        
        # 更新字段
        for key, value in kwargs.items():
            if hasattr(model, key):
                setattr(model, key, value)
        
        self.db.commit()
        self.db.refresh(model)
        
        return model
    
    def delete_model(self, model_id: int) -> bool:
        """删除模型"""
        model = self.get_model(model_id)
        if not model:
            return False
        
        self.db.delete(model)
        self.db.commit()
        
        return True
    
    def clone_model(self, model_id: int, new_name: Optional[str] = None, user_id: Optional[int] = None) -> Optional[UserModel]:
        """克隆模型，绑定到指定用户"""
        model = self.get_model(model_id)
        if not model:
            return None
        
        if not new_name:
            new_name = f"{model.name}_副本"
        
        new_model = UserModel(
            user_id=user_id,
            name=new_name,
            description=model.description,
            model_type=model.model_type,
            model_config=model.model_config.copy(),
            features=model.features.copy(),
            feature_config=model.feature_config.copy() if model.feature_config else {},
            target=model.target,
            target_config=model.target_config.copy() if model.target_config else {},
            stock_codes=model.stock_codes.copy() if model.stock_codes else [],
            train_date_range=model.train_date_range.copy() if model.train_date_range else None,
            status='draft'
        )
        
        self.db.add(new_model)
        self.db.commit()
        self.db.refresh(new_model)
        
        return new_model
