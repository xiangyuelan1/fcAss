"""
支付相关数据模型
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, DECIMAL, Text
from sqlalchemy.sql import func
from app.core.database import Base


class PaymentConfig(Base):
    """支付渠道配置表（管理员配置）"""
    __tablename__ = "payment_config"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, comment="配置名称")
    gateway_url = Column(String(500), nullable=False, comment="支付网关地址")
    pid = Column(String(50), nullable=False, comment="商户ID")
    secret_key = Column(String(200), nullable=False, comment="商户密钥")
    is_active = Column(Boolean, default=True, comment="是否启用")
    register_fee = Column(DECIMAL(10, 2), default=1.00, comment="注册费用（元）")
    pay_type = Column(String(20), default="alipay", comment="默认支付方式: alipay/wxpay/qqpay")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class PaymentOrder(Base):
    """支付订单表"""
    __tablename__ = "payment_orders"

    id = Column(Integer, primary_key=True, index=True)
    out_trade_no = Column(String(64), unique=True, index=True, nullable=False, comment="商户订单号")
    trade_no = Column(String(64), index=True, nullable=True, comment="易支付订单号")
    username = Column(String(100), nullable=False, comment="注册用户名")
    email = Column(String(255), nullable=True, comment="注册邮箱")
    password_hash = Column(String(255), nullable=False, comment="注册密码哈希")
    money = Column(DECIMAL(10, 2), nullable=False, comment="支付金额")
    pay_type = Column(String(20), default="alipay", comment="支付方式")
    status = Column(Integer, default=0, comment="支付状态: 0未支付, 1已支付")
    qrcode_url = Column(Text, nullable=True, comment="二维码链接")
    pay_url = Column(Text, nullable=True, comment="支付跳转URL")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    paid_at = Column(DateTime(timezone=True), nullable=True, comment="支付完成时间")
