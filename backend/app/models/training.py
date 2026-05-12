"""
训练任务和回测结果数据模型
"""
from sqlalchemy import Column, Integer, String, DateTime, Text, JSON, DECIMAL, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base
from datetime import datetime


class TrainingTask(Base):
    """模型训练任务表"""
    __tablename__ = "training_tasks"
    
    id = Column(Integer, primary_key=True, index=True)
    model_id = Column(Integer, ForeignKey("user_models.id"), nullable=False)
    
    # 任务状态
    status = Column(String(20), default="pending", comment="状态: pending/running/completed/failed/cancelled")
    
    # 时间记录
    start_time = Column(DateTime, comment="开始时间")
    end_time = Column(DateTime, comment="结束时间")
    
    # 训练配置
    config = Column(JSON, nullable=False, comment="训练配置")
    
    # 训练结果
    metrics = Column(JSON, comment="评估指标")
    model_path = Column(String(255), comment="模型文件路径")
    
    # 错误信息
    error_message = Column(Text, comment="错误信息")
    
    # 创建时间
    created_at = Column(DateTime, default=datetime.now)
    
    # 关系
    user_model = relationship("UserModel", back_populates="training_tasks")
    backtest_results = relationship("BacktestResult", back_populates="training_task", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<TrainingTask(id={self.id}, model_id={self.model_id}, status='{self.status}')>"
    
    def to_dict(self):
        return {
            "id": self.id,
            "model_id": self.model_id,
            "status": self.status,
            "start_time": self.start_time.strftime("%Y-%m-%d %H:%M:%S") if self.start_time else None,
            "end_time": self.end_time.strftime("%Y-%m-%d %H:%M:%S") if self.end_time else None,
            "config": self.config,
            "metrics": self.metrics,
            "model_path": self.model_path,
            "error_message": self.error_message,
        }
    
    @property
    def duration(self):
        """计算训练时长（秒）"""
        if self.start_time and self.end_time:
            return (self.end_time - self.start_time).total_seconds()
        return None


class BacktestResult(Base):
    """回测结果表"""
    __tablename__ = "backtest_results"
    
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("training_tasks.id"), nullable=False)
    
    # 回测时间范围
    start_date = Column(String(10), nullable=False, comment="回测开始日期")
    end_date = Column(String(10), nullable=False, comment="回测结束日期")
    
    # 资金配置
    initial_capital = Column(DECIMAL(15, 2), default=100000, comment="初始资金")
    final_capital = Column(DECIMAL(15, 2), comment="最终资金")
    
    # 收益指标
    total_return = Column(DECIMAL(10, 4), comment="总收益率")
    annual_return = Column(DECIMAL(10, 4), comment="年化收益率")
    
    # 风险指标
    max_drawdown = Column(DECIMAL(10, 4), comment="最大回撤")
    max_drawdown_duration = Column(Integer, comment="最大回撤持续天数")
    
    # 风险调整收益
    sharpe_ratio = Column(DECIMAL(10, 4), comment="夏普比率")
    sortino_ratio = Column(DECIMAL(10, 4), comment="索提诺比率")
    calmar_ratio = Column(DECIMAL(10, 4), comment="卡尔玛比率")
    
    # 交易统计
    trades_count = Column(Integer, comment="交易次数")
    win_count = Column(Integer, comment="盈利次数")
    loss_count = Column(Integer, comment="亏损次数")
    win_rate = Column(DECIMAL(6, 4), comment="胜率")
    avg_profit = Column(DECIMAL(10, 4), comment="平均盈利")
    avg_loss = Column(DECIMAL(10, 4), comment="平均亏损")
    profit_factor = Column(DECIMAL(10, 4), comment="盈亏比")
    
    # 详细数据
    equity_curve = Column(JSON, comment="权益曲线数据")
    trades = Column(JSON, comment="交易记录")
    daily_returns = Column(JSON, comment="每日收益")
    
    # 创建时间
    created_at = Column(DateTime, default=datetime.now)
    
    # 关系
    training_task = relationship("TrainingTask", back_populates="backtest_results")
    
    def __repr__(self):
        return f"<BacktestResult(id={self.id}, task_id={self.task_id}, return={self.total_return})>"
    
    def to_dict(self):
        return {
            "id": self.id,
            "task_id": self.task_id,
            "start_date": self.start_date,
            "end_date": self.end_date,
            "initial_capital": float(self.initial_capital) if self.initial_capital else None,
            "final_capital": float(self.final_capital) if self.final_capital else None,
            "total_return": float(self.total_return) if self.total_return else None,
            "annual_return": float(self.annual_return) if self.annual_return else None,
            "max_drawdown": float(self.max_drawdown) if self.max_drawdown else None,
            "max_drawdown_duration": self.max_drawdown_duration,
            "sharpe_ratio": float(self.sharpe_ratio) if self.sharpe_ratio else None,
            "sortino_ratio": float(self.sortino_ratio) if self.sortino_ratio else None,
            "calmar_ratio": float(self.calmar_ratio) if self.calmar_ratio else None,
            "trades_count": self.trades_count,
            "win_count": self.win_count,
            "loss_count": self.loss_count,
            "win_rate": float(self.win_rate) if self.win_rate else None,
            "avg_profit": float(self.avg_profit) if self.avg_profit else None,
            "avg_loss": float(self.avg_loss) if self.avg_loss else None,
            "profit_factor": float(self.profit_factor) if self.profit_factor else None,
            "equity_curve": self.equity_curve,
            "trades": self.trades,
            "daily_returns": self.daily_returns,
            "created_at": self.created_at.strftime("%Y-%m-%d %H:%M:%S") if self.created_at else None,
        }
