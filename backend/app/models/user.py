"""
用户模型
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class User(Base):
    """用户模型"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, index=True, nullable=False)
    nickname = Column(String(50), nullable=True, comment="用户昵称")
    email = Column(String(255), unique=True, index=True, nullable=True)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_login_at = Column(DateTime(timezone=True), comment="最后登录时间")
    last_login_ip = Column(String(45), comment="最后登录IP地址")
    last_heartbeat = Column(DateTime(timezone=True), comment="最后心跳时间")
    auto_clear_predictions_daily = Column(Boolean, default=True, comment="每日自动清空预测结果")

    def to_dict(self):
        """转换为字典"""
        return {
            'id': self.id,
            'username': self.username,
            'nickname': self.nickname,
            'email': self.email,
            'is_active': self.is_active,
            'is_admin': self.is_admin,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'last_login_at': self.last_login_at.isoformat() if self.last_login_at else None,
            'last_login_ip': self.last_login_ip,
            'last_heartbeat': self.last_heartbeat.isoformat() if self.last_heartbeat else None,
            'auto_clear_predictions_daily': self.auto_clear_predictions_daily if self.auto_clear_predictions_daily is not None else True,
        }
