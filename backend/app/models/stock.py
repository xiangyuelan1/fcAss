"""
股票相关数据模型
"""
from sqlalchemy import Column, Integer, String, Date, DECIMAL, BigInteger, UniqueConstraint, Index, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base
from datetime import datetime


class Stock(Base):
    """股票基础信息表"""
    __tablename__ = "stocks"
    
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(20), unique=True, nullable=False, index=True, comment="股票代码")
    name = Column(String(100), nullable=False, comment="股票名称")
    exchange = Column(String(10), comment="交易所")
    industry = Column(String(50), comment="所属行业")
    created_at = Column(String(20), default=lambda: datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    
    def __repr__(self):
        return f"<Stock(code='{self.code}', name='{self.name}')>"
    
    def to_dict(self):
        return {
            "id": self.id,
            "code": self.code,
            "name": self.name,
            "exchange": self.exchange,
            "industry": self.industry,
            "created_at": self.created_at
        }


class StockPrice(Base):
    """股票历史价格数据表"""
    __tablename__ = "stock_prices"
    
    id = Column(Integer, primary_key=True, index=True)
    stock_code = Column(String(20), ForeignKey("stocks.code"), nullable=False, index=True, comment="股票代码")
    date = Column(Date, nullable=False, comment="交易日期")
    
    # 价格数据
    open = Column(DECIMAL(10, 4), comment="开盘价")
    high = Column(DECIMAL(10, 4), comment="最高价")
    low = Column(DECIMAL(10, 4), comment="最低价")
    close = Column(DECIMAL(10, 4), comment="收盘价")
    volume = Column(BigInteger, comment="成交量")
    amount = Column(DECIMAL(15, 2), comment="成交额")
    
    # 涨跌幅
    change_pct = Column(DECIMAL(6, 4), comment="涨跌幅")
    change_amount = Column(DECIMAL(10, 4), comment="涨跌额")
    
    # 复权价格
    adj_close = Column(DECIMAL(10, 4), comment="复权收盘价")
    
    # 复合唯一索引
    __table_args__ = (
        UniqueConstraint('stock_code', 'date', name='uix_stock_date'),
        Index('ix_stock_code_date', 'stock_code', 'date'),
    )
    
    def __repr__(self):
        return f"<StockPrice(code='{self.stock_code}', date='{self.date}', close='{self.close}')>"
    
    def to_dict(self):
        return {
            "id": self.id,
            "stock_code": self.stock_code,
            "date": self.date.strftime("%Y-%m-%d") if self.date else None,
            "open": float(self.open) if self.open else None,
            "high": float(self.high) if self.high else None,
            "low": float(self.low) if self.low else None,
            "close": float(self.close) if self.close else None,
            "volume": int(self.volume) if self.volume else None,
            "amount": float(self.amount) if self.amount else None,
            "change_pct": float(self.change_pct) if self.change_pct else None,
            "change_amount": float(self.change_amount) if self.change_amount else None,
            "adj_close": float(self.adj_close) if self.adj_close else None,
        }
