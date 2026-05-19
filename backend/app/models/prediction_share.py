"""
预测分享模型

用户可将预测结果发布到社区，
其他用户可浏览、点赞。
"""
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, JSON
from sqlalchemy.sql import func
from app.core.database import Base


class PredictionShare(Base):
    """预测分享记录"""
    __tablename__ = "prediction_shares"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    task_id = Column(Integer, nullable=True)
    model_id = Column(Integer, nullable=True)
    model_name = Column(String(100), nullable=True)
    model_type = Column(String(50), nullable=True)
    stock_code = Column(String(20), nullable=False, index=True)
    stock_name = Column(String(50), nullable=True)
    target_type = Column(String(50), nullable=True)
    direction = Column(String(20), nullable=True)
    prediction_value = Column(Float, nullable=True)
    confidence = Column(Float, nullable=True)
    predicted_change_pct = Column(Float, nullable=True)
    prediction_data = Column(JSON, nullable=True)
    is_published = Column(Boolean, default=False, index=True)
    likes_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "task_id": self.task_id,
            "model_id": self.model_id,
            "model_name": self.model_name,
            "model_type": self.model_type,
            "stock_code": self.stock_code,
            "stock_name": self.stock_name,
            "target_type": self.target_type,
            "direction": self.direction,
            "prediction_value": self.prediction_value,
            "confidence": self.confidence,
            "predicted_change_pct": self.predicted_change_pct,
            "prediction_data": self.prediction_data,
            "is_published": self.is_published,
            "likes_count": self.likes_count,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
