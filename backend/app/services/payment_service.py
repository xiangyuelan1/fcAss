"""
易支付对接服务

实现易支付标准聚合支付接口：
- MD5签名
- API下单（获取二维码）
- 异步通知验签
- 订单查询
"""
import hashlib
import time
import uuid
import logging
import requests
from typing import Optional
from urllib.parse import urlencode

from app.models.payment import PaymentConfig, PaymentOrder
from app.auth import get_password_hash
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def _md5(text: str) -> str:
    """MD5哈希，返回小写十六进制"""
    return hashlib.md5(text.encode('utf-8')).hexdigest()


def _generate_order_no() -> str:
    """生成商户订单号：时间戳 + 随机数"""
    return f"{int(time.time() * 1000)}{uuid.uuid4().hex[:8]}"


def _build_sign(params: dict, key: str) -> str:
    """易支付MD5签名算法

    1. 过滤 sign、sign_type 和空值参数
    2. 按键名升序排序 (a-z)
    3. 拼接为 a=b&c=d 格式（值不做urlencode）
    4. 末尾拼接商户密钥
    5. MD5加密，返回小写
    """
    filtered = {
        k: v for k, v in params.items()
        if k not in ('sign', 'sign_type') and v is not None and v != ''
    }
    sorted_keys = sorted(filtered.keys())
    query_string = '&'.join(f'{k}={filtered[k]}' for k in sorted_keys)
    sign_str = query_string + key
    return _md5(sign_str)


def _verify_sign(params: dict, key: str) -> bool:
    """验证回调签名"""
    received_sign = params.get('sign', '')
    computed_sign = _build_sign(params, key)
    return received_sign == computed_sign


def get_active_config(db: Session) -> Optional[PaymentConfig]:
    """获取当前启用的支付配置"""
    return db.query(PaymentConfig).filter(PaymentConfig.is_active == True).first()


def create_payment_order(
    db: Session,
    username: str,
    email: Optional[str],
    password: str,
    pay_type: str = "alipay",
) -> dict:
    """创建支付订单并获取二维码

    流程：
    1. 获取支付配置
    2. 创建本地订单记录
    3. 调用易支付API获取二维码
    4. 返回订单信息和二维码

    Returns:
        dict: {out_trade_no, money, pay_type, qrcode_url, pay_url}
    """
    config = get_active_config(db)
    if not config:
        raise Exception("支付渠道未配置，请联系管理员")

    # 检查用户名是否已存在
    from app.models.user import User as UserModel
    existing = db.query(UserModel).filter(UserModel.username == username).first()
    if existing:
        raise Exception("用户名已存在")

    # 检查是否有未支付的订单
    pending = db.query(PaymentOrder).filter(
        PaymentOrder.username == username,
        PaymentOrder.status == 0
    ).first()
    if pending:
        # 返回已有订单
        return {
            'out_trade_no': pending.out_trade_no,
            'money': float(pending.money),
            'pay_type': pending.pay_type,
            'qrcode_url': pending.qrcode_url,
            'pay_url': pending.pay_url,
        }

    out_trade_no = _generate_order_no()
    money = float(config.register_fee)
    password_hash = get_password_hash(password)

    # 构建请求参数
    notify_url = ""  # 将在API层补充完整URL
    return_url = ""  # 将在API层补充完整URL

    order = PaymentOrder(
        out_trade_no=out_trade_no,
        username=username,
        email=email,
        password_hash=password_hash,
        money=money,
        pay_type=pay_type,
        status=0,
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    return {
        'out_trade_no': out_trade_no,
        'money': money,
        'pay_type': pay_type,
        'qrcode_url': None,
        'pay_url': None,
        'order_id': order.id,
    }


def request_qrcode(
    db: Session,
    out_trade_no: str,
    notify_url: str,
    return_url: str,
    clientip: str = "127.0.0.1",
) -> dict:
    """调用易支付API获取支付二维码/跳转URL"""
    config = get_active_config(db)
    if not config:
        raise Exception("支付渠道未配置")

    order = db.query(PaymentOrder).filter(PaymentOrder.out_trade_no == out_trade_no).first()
    if not order:
        raise Exception("订单不存在")

    params = {
        'pid': config.pid,
        'type': order.pay_type,
        'out_trade_no': out_trade_no,
        'notify_url': notify_url,
        'return_url': return_url,
        'name': '成都威客字节科技有限公司-A股预测平台注册',
        'money': str(order.money),
        'clientip': clientip,
    }
    params['sign'] = _build_sign(params, config.secret_key)
    params['sign_type'] = 'MD5'

    # 调用易支付API
    api_url = config.gateway_url.rstrip('/') + '/mapi.php'
    try:
        resp = requests.post(api_url, data=params, timeout=15)
        result = resp.json()
    except Exception as e:
        logger.error(f"易支付API调用失败: {e}")
        raise Exception(f"支付接口调用失败: {e}")

    if result.get('code') != 1:
        logger.error(f"易支付API返回错误: {result.get('msg')}")
        raise Exception(f"创建支付订单失败: {result.get('msg', '未知错误')}")

    # 保存二维码/支付URL
    qrcode_url = result.get('qrcode')
    pay_url = result.get('payurl')
    trade_no = result.get('trade_no')

    order.qrcode_url = qrcode_url
    order.pay_url = pay_url
    order.trade_no = trade_no
    db.commit()

    return {
        'out_trade_no': out_trade_no,
        'qrcode_url': qrcode_url,
        'pay_url': pay_url,
        'trade_no': trade_no,
    }


def handle_notify(db: Session, params: dict) -> bool:
    """处理易支付异步通知

    1. 验证签名
    2. 检查支付状态
    3. 创建用户账号
    4. 返回是否处理成功
    """
    config = get_active_config(db)
    if not config:
        logger.error("支付通知处理失败: 支付渠道未配置")
        return False

    # 验证签名
    if not _verify_sign(params, config.secret_key):
        logger.error("支付通知验签失败")
        return False

    # 检查支付状态
    trade_status = params.get('trade_status', '')
    if trade_status != 'TRADE_SUCCESS':
        logger.warning(f"支付状态非成功: {trade_status}")
        return False

    out_trade_no = params.get('out_trade_no', '')
    order = db.query(PaymentOrder).filter(PaymentOrder.out_trade_no == out_trade_no).first()
    if not order:
        logger.error(f"订单不存在: {out_trade_no}")
        return False

    # 防止重复处理
    if order.status == 1:
        return True

    # 更新订单状态
    order.status = 1
    order.trade_no = params.get('trade_no', order.trade_no)
    from datetime import datetime
    order.paid_at = datetime.now()

    # 创建用户
    from app.models.user import User as UserModel
    new_user = UserModel(
        username=order.username,
        email=order.email,
        hashed_password=order.password_hash,
        is_active=True,
    )
    db.add(new_user)
    db.commit()

    logger.info(f"用户 {order.username} 支付成功，账号已创建")
    return True


def query_order_status(db: Session, out_trade_no: str) -> dict:
    """查询订单支付状态"""
    order = db.query(PaymentOrder).filter(PaymentOrder.out_trade_no == out_trade_no).first()
    if not order:
        return {'status': 'not_found', 'message': '订单不存在'}

    if order.status == 1:
        return {'status': 'paid', 'message': '支付成功', 'username': order.username}

    # 主动查询易支付
    config = get_active_config(db)
    if config:
        try:
            query_url = config.gateway_url.rstrip('/') + '/api.php'
            resp = requests.get(query_url, params={
                'act': 'order',
                'pid': config.pid,
                'key': config.secret_key,
                'out_trade_no': out_trade_no,
            }, timeout=10)
            result = resp.json()
            if result.get('code') == 1 and result.get('status') == 1:
                # 易支付确认已支付，触发创建用户
                handle_notify(db, {
                    'pid': config.pid,
                    'trade_no': result.get('trade_no', ''),
                    'out_trade_no': out_trade_no,
                    'type': order.pay_type,
                    'name': 'A股预测平台注册费',
                    'money': str(order.money),
                    'trade_status': 'TRADE_SUCCESS',
                    'sign': result.get('sign', ''),
                    'sign_type': 'MD5',
                })
                return {'status': 'paid', 'message': '支付成功', 'username': order.username}
        except Exception as e:
            logger.warning(f"查询易支付订单失败: {e}")

    return {'status': 'unpaid', 'message': '等待支付'}
