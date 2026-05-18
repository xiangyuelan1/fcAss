"""
每日一猜数据模型

每日选取一只股票供用户猜测涨跌，盘后自动揭晓结果。
与现有 DailyChallenge 的区别：
- DailyChallenge 基于模型置信度，方向含 flat
- 每日一猜更轻量，仅看涨/看跌二选一，侧重社区参与感
"""
from sqlalchemy import Column, Integer, String, Date, DECIMAL, DateTime, UniqueConstraint
from app.core.database import Base
from datetime import datetime


class DailyGuessStock(Base):
    """每日一猜股票（每天一只）"""
    __tablename__ = "daily_guess_stocks"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False, unique=True, index=True)
    stock_code = Column(String(20), nullable=False)
    stock_name = Column(String(100), nullable=False)
    reference_close = Column(DECIMAL(10, 4))
    actual_close = Column(DECIMAL(10, 4), nullable=True)
    actual_change_pct = Column(DECIMAL(6, 4), nullable=True)
    created_at = Column(DateTime, default=datetime.now)

    def to_dict(self):
        return {
            "id": self.id,
            "date": self.date.isoformat() if self.date else None,
            "stock_code": self.stock_code,
            "stock_name": self.stock_name,
            "reference_close": float(self.reference_close) if self.reference_close else None,
            "actual_close": float(self.actual_close) if self.actual_close else None,
            "actual_change_pct": float(self.actual_change_pct) if self.actual_change_pct else None,
            "created_at": self.created_at.strftime("%Y-%m-%d %H:%M:%S") if self.created_at else None,
        }


class DailyGuessVote(Base):
    """用户投票记录"""
    __tablename__ = "daily_guess_votes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    guess_date = Column(Date, nullable=False, index=True)
    direction = Column(String(10), nullable=False)
    created_at = Column(DateTime, default=datetime.now)

    __table_args__ = (
        UniqueConstraint('user_id', 'guess_date', name='uix_user_guess_date'),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "guess_date": self.guess_date.isoformat() if self.guess_date else None,
            "direction": self.direction,
            "created_at": self.created_at.strftime("%Y-%m-%d %H:%M:%S") if self.created_at else None,
        }
