"""
自定义指标模型

用户可创建自定义技术指标公式，
并发布到社区供他人使用。
"""
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, JSON
from sqlalchemy.sql import func
from app.core.database import Base


class CustomIndicator(Base):
    """用户自定义技术指标"""
    __tablename__ = "custom_indicators"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    name = Column(String(100), nullable=False)
    key = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    formula = Column(Text, nullable=False, comment="计算公式/表达式")
    params = Column(JSON, nullable=True, comment="参数定义列表")
    category = Column(String(50), default="自定义")
    is_published = Column(Boolean, default=False, index=True)
    likes_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "name": self.name,
            "key": self.key,
            "description": self.description,
            "formula": self.formula,
            "params": self.params,
            "category": self.category,
            "is_published": self.is_published,
            "likes_count": self.likes_count,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
