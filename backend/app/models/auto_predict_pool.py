"""
自动预测池模型

用户可将关注的股票加入自动预测池，
系统每日自动对这些股票执行预测。
"""
from sqlalchemy import Column, Integer, String, DateTime, UniqueConstraint
from sqlalchemy.sql import func
from app.core.database import Base


class AutoPredictPoolItem(Base):
    """自动预测池条目"""
    __tablename__ = "auto_predict_pool"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    stock_code = Column(String(20), nullable=False)
    stock_name = Column(String(50), nullable=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint('user_id', 'stock_code', name='uq_auto_pool_user_stock'),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "stock_code": self.stock_code,
            "stock_name": self.stock_name,
            "sort_order": self.sort_order,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
