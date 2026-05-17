"""
支付API端点

- 用户注册付费下单
- 支付二维码获取
- 支付回调通知
- 订单状态查询
- 管理员支付配置
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.services import payment_service
from app.models.payment import PaymentConfig, PaymentOrder
from app.auth import require_admin
from app.models.user import User as UserModel

router = APIRouter()


class CreateOrderRequest(BaseModel):
    username: str
    email: Optional[str] = None
    password: str
    pay_type: str = "alipay"


class PaymentConfigRequest(BaseModel):
    name: str
    gateway_url: str
    pid: str
    secret_key: str
    register_fee: float = 1.00
    pay_type: str = "alipay"
    is_active: bool = True


@router.post("/order/create")
async def create_order(request: CreateOrderRequest, db: Session = Depends(get_db)):
    """创建付费注册订单"""
    try:
        result = payment_service.create_payment_order(
            db=db,
            username=request.username,
            email=request.email,
            password=request.password,
            pay_type=request.pay_type,
        )
        return {"success": True, "data": result}
    except Exception as e:
        return {"success": False, "message": str(e)}


@router.post("/order/qrcode")
async def get_qrcode(
    out_trade_no: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """获取支付二维码"""
    try:
        base_url = str(request.base_url).rstrip('/')
        notify_url = f"{base_url}/api/payment/notify"
        return_url = f"{base_url}/payment/callback"

        clientip = request.client.host if request.client else "127.0.0.1"

        result = payment_service.request_qrcode(
            db=db,
            out_trade_no=out_trade_no,
            notify_url=notify_url,
            return_url=return_url,
            clientip=clientip,
        )
        return {"success": True, "data": result}
    except Exception as e:
        return {"success": False, "message": str(e)}


@router.get("/notify")
async def payment_notify_get(request: Request, db: Session = Depends(get_db)):
    """易支付异步通知（GET方式）"""
    params = dict(request.query_params)
    success = payment_service.handle_notify(db, params)
    if success:
        return "success"
    return "fail"


@router.post("/notify")
async def payment_notify_post(request: Request, db: Session = Depends(get_db)):
    """易支付异步通知（POST方式，兼容）"""
    params = dict(request.query_params)
    success = payment_service.handle_notify(db, params)
    if success:
        return "success"
    return "fail"


@router.get("/order/status")
async def query_order_status(out_trade_no: str, db: Session = Depends(get_db)):
    """查询订单支付状态"""
    result = payment_service.query_order_status(db, out_trade_no)
    return {"success": True, "data": result}


@router.get("/config")
async def get_payment_config(current_user: UserModel = Depends(require_admin), db: Session = Depends(get_db)):
    """获取支付配置（管理员）"""
    configs = db.query(PaymentConfig).all()
    result = []
    for c in configs:
        result.append({
            'id': c.id,
            'name': c.name,
            'gateway_url': c.gateway_url,
            'pid': c.pid,
            'secret_key': c.secret_key[:4] + '****' + c.secret_key[-4:],
            'is_active': c.is_active,
            'register_fee': float(c.register_fee),
            'pay_type': c.pay_type,
            'created_at': str(c.created_at) if c.created_at else None,
        })
    return {"success": True, "data": result}


@router.post("/config")
async def save_payment_config(request: PaymentConfigRequest, current_user: UserModel = Depends(require_admin), db: Session = Depends(get_db)):
    """保存支付配置（管理员）"""
    # 停用其他配置
    if request.is_active:
        db.query(PaymentConfig).update({'is_active': False})

    config = PaymentConfig(
        name=request.name,
        gateway_url=request.gateway_url,
        pid=request.pid,
        secret_key=request.secret_key,
        register_fee=request.register_fee,
        pay_type=request.pay_type,
        is_active=request.is_active,
    )
    db.add(config)
    db.commit()
    db.refresh(config)
    return {"success": True, "message": "支付配置已保存", "data": {"id": config.id}}


@router.get("/register-info")
async def get_register_info(db: Session = Depends(get_db)):
    """获取注册付费信息（前端展示用）"""
    config = payment_service.get_active_config(db)
    if config:
        return {
            "success": True,
            "data": {
                "fee": float(config.register_fee),
                "pay_type": config.pay_type,
                "enabled": True,
            }
        }
    return {
        "success": True,
        "data": {
            "fee": 0,
            "pay_type": "alipay",
            "enabled": False,
        }
    }
