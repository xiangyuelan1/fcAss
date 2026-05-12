"""
支付订单模型
"""
from sqlalchemy import Column, Integer, String, Float, DateTime, JSON
from app.core.database import Base

class PaymentOrder(Base):
    """支付订单模型"""
    __tablename__ = "payment_orders"
    
    id = Column(Integer, primary_key=True, index=True)
    order_no = Column(String(64), unique=True, index=True, nullable=False)
    user_id = Column(Integer, index=True)
    amount = Column(Float, nullable=False)
    subject = Column(String(255))
    status = Column(String(20), default="pending")  # pending, paid, failed, refunded
    pay_url = Column(String(500))
    qr_code = Column(String(500))
    notify_data = Column(JSON)
    created_at = Column(DateTime)
    paid_at = Column(DateTime)
    
    def to_dict(self):
        return {
            "id": self.id,
            "order_no": self.order_no,
            "user_id": self.user_id,
            "amount": self.amount,
            "subject": self.subject,
            "status": self.status,
            "pay_url": self.pay_url,
            "qr_code": self.qr_code,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "paid_at": self.paid_at.isoformat() if self.paid_at else None
        }
