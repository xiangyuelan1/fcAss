"""
用户模型相关数据模型
"""
from sqlalchemy import Column, Integer, String, DateTime, Text, JSON, Boolean
from sqlalchemy.orm import relationship
from app.core.database import Base
from datetime import datetime


class UserModel(Base):
    """用户自定义模型表"""
    __tablename__ = "user_models"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, default=None, nullable=True, comment="用户ID")
    name = Column(String(100), nullable=False, comment="模型名称")
    description = Column(Text, comment="模型描述")
    
    # 模型配置
    model_type = Column(String(50), nullable=False, comment="模型类型")
    model_config = Column(JSON, nullable=False, comment="模型配置参数")
    
    # 特征配置
    features = Column(JSON, nullable=False, comment="特征列表")
    feature_config = Column(JSON, default=dict, comment="特征工程配置")
    
    # 目标配置
    target = Column(String(50), nullable=False, comment="预测目标")
    target_config = Column(JSON, default=dict, comment="目标配置")
    
    # 数据配置
    stock_codes = Column(JSON, default=list, comment="训练股票列表")
    train_date_range = Column(JSON, comment="训练日期范围")
    
    # 状态
    status = Column(String(20), default="draft", comment="状态: draft/trained/deployed")

    # 自动化配置
    auto_retrain_daily = Column(Boolean, default=False, comment="每日自动重新训练")
    auto_predict_pool_daily = Column(Boolean, default=False, comment="每日自动对预测池预测")
    
    # 时间戳
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    # 关系
    training_tasks = relationship("TrainingTask", back_populates="user_model", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<UserModel(id={self.id}, name='{self.name}', type='{self.model_type}')>"
    
    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "name": self.name,
            "description": self.description,
            "model_type": self.model_type,
            "model_params": self.model_config,
            "features": self.features,
            "feature_config": self.feature_config,
            "target": self.target,
            "target_config": self.target_config,
            "stock_codes": self.stock_codes,
            "train_date_range": self.train_date_range,
            "status": self.status,
            "auto_retrain_daily": self.auto_retrain_daily if self.auto_retrain_daily is not None else False,
            "auto_predict_pool_daily": self.auto_predict_pool_daily if self.auto_predict_pool_daily is not None else False,
            "created_at": self.created_at.strftime("%Y-%m-%d %H:%M:%S") if self.created_at else None,
            "updated_at": self.updated_at.strftime("%Y-%m-%d %H:%M:%S") if self.updated_at else None,
        }
