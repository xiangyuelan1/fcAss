from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, JSON
from sqlalchemy.sql import func
from app.core.database import Base


class SystemConfig(Base):
    __tablename__ = "system_configs"

    id = Column(Integer, primary_key=True, index=True)
    category = Column(String(50), nullable=False, index=True, comment="分类: model_type/algorithm/param_template")
    name = Column(String(100), nullable=False, comment="配置名称")
    key = Column(String(100), nullable=False, unique=True, comment="配置键(唯一)")
    description = Column(Text, nullable=True, comment="配置描述")
    value = Column(JSON, nullable=False, comment="配置内容(JSON)")
    is_active = Column(Boolean, default=True, comment="是否启用")
    sort_order = Column(Integer, default=0, comment="排序权重")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
