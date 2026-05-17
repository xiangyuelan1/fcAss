from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from app.core.database import Base


class UserStockPrefs(Base):
    __tablename__ = "user_stock_prefs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    stock_code = Column(String(20), nullable=False, index=True)
    is_pinned = Column(Boolean, default=False)
    pinned_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint('user_id', 'stock_code', name='uix_user_stock_prefs'),
    )


class UserModelPrefs(Base):
    __tablename__ = "user_model_prefs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    model_id = Column(Integer, nullable=False, index=True)
    is_pinned = Column(Boolean, default=False)
    is_favorited = Column(Boolean, default=False)
    pinned_at = Column(DateTime(timezone=True), nullable=True)
    favorited_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint('user_id', 'model_id', name='uix_user_model_prefs'),
    )
