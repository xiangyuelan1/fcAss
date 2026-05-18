"""
自选股表模型

用户可创建多个自选表，每个自选表包含多只股票，
用于在模型训练时快速选择关注的股票组合。
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base


class Watchlist(Base):
    """用户自选股表"""
    __tablename__ = "watchlists"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    name = Column(String(100), nullable=False)
    description = Column(String(500))
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    items = relationship(
        "WatchlistItem",
        back_populates="watchlist",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    def to_dict(self, stock_count: int = 0):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "name": self.name,
            "description": self.description,
            "stock_count": stock_count,
            "created_at": self.created_at.strftime("%Y-%m-%d %H:%M:%S") if self.created_at else None,
            "updated_at": self.updated_at.strftime("%Y-%m-%d %H:%M:%S") if self.updated_at else None,
        }


class WatchlistItem(Base):
    """自选股表中的股票项"""
    __tablename__ = "watchlist_items"

    id = Column(Integer, primary_key=True, index=True)
    watchlist_id = Column(
        Integer,
        ForeignKey("watchlists.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    stock_code = Column(String(20), nullable=False, index=True)
    stock_name = Column(String(100), nullable=False)
    added_at = Column(DateTime, default=datetime.now)

    watchlist = relationship("Watchlist", back_populates="items")

    __table_args__ = (
        UniqueConstraint("watchlist_id", "stock_code", name="uix_watchlist_stock"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "watchlist_id": self.watchlist_id,
            "stock_code": self.stock_code,
            "stock_name": self.stock_name,
            "added_at": self.added_at.strftime("%Y-%m-%d %H:%M:%S") if self.added_at else None,
        }
