"""
站内信API - 用户发送消息给开发团队，管理员查看和回复
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict

from app.core.database import get_db
from app.auth import get_current_active_user, require_admin
from app.models.user import User as UserModel
from app.models.message import Message

logger = logging.getLogger(__name__)
router = APIRouter()


class SendMessageRequest(BaseModel):
    subject: str = Field(..., min_length=1, max_length=200, description="消息主题")
    content: str = Field(..., min_length=1, description="消息内容")
    parent_id: Optional[int] = Field(None, description="父消息ID，用于回复")

    model_config = ConfigDict(protected_namespaces=())


class AdminReplyRequest(BaseModel):
    content: str = Field(..., min_length=1, description="回复内容")

    model_config = ConfigDict(protected_namespaces=())


@router.post("")
async def send_message(
    data: SendMessageRequest,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """用户发送消息给开发团队"""
    if data.parent_id is not None:
        parent_msg = db.query(Message).filter(Message.id == data.parent_id).first()
        if not parent_msg:
            raise HTTPException(status_code=404, detail="父消息不存在")

    message = Message(
        sender_id=current_user.id,
        receiver_id=0,
        subject=data.subject,
        content=data.content,
        parent_id=data.parent_id,
        is_read=False,
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    logger.info(f"用户 {current_user.username} 发送了消息 #{message.id}")
    return message.to_dict()


@router.get("")
async def get_messages(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """获取当前用户的消息列表（顶层消息 + 嵌套回复）"""
    offset = (page - 1) * page_size
    query = db.query(Message).filter(
        Message.parent_id.is_(None),
        (Message.sender_id == current_user.id) | (Message.receiver_id == current_user.id),
    )
    total = query.count()
    messages = query.order_by(Message.created_at.desc()).offset(offset).limit(page_size).all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [m.to_dict() for m in messages],
    }


@router.get("/unread-count")
async def get_unread_count(
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """获取当前用户的未读消息数"""
    count = db.query(Message).filter(
        Message.receiver_id == current_user.id,
        Message.is_read == False,
    ).count()
    return {"unread_count": count}


@router.get("/admin/all")
async def admin_get_all(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    is_read: Optional[bool] = Query(None, description="按已读状态筛选"),
    admin: UserModel = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """管理员获取所有消息（仅顶层消息）"""
    offset = (page - 1) * page_size
    query = db.query(Message).filter(Message.parent_id.is_(None))
    if is_read is not None:
        query = query.filter(Message.is_read == is_read)
    total = query.count()
    messages = query.order_by(Message.created_at.desc()).offset(offset).limit(page_size).all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [m.to_dict() for m in messages],
    }


@router.post("/admin/{message_id}/reply")
async def admin_reply(
    message_id: int,
    data: AdminReplyRequest,
    admin: UserModel = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """管理员回复消息"""
    original = db.query(Message).filter(Message.id == message_id).first()
    if not original:
        raise HTTPException(status_code=404, detail="原始消息不存在")

    reply = Message(
        sender_id=admin.id,
        receiver_id=original.sender_id,
        subject=f"Re: {original.subject}",
        content=data.content,
        parent_id=message_id,
        is_read=False,
    )
    db.add(reply)
    original.is_read = True
    db.commit()
    db.refresh(reply)
    logger.info(f"管理员 {admin.username} 回复了消息 #{message_id}")
    return reply.to_dict()


@router.put("/admin/{message_id}/read")
async def admin_mark_read(
    message_id: int,
    admin: UserModel = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """管理员标记消息为已读"""
    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="消息不存在")
    message.is_read = True
    db.commit()
    return {"success": True, "message": "已标记为已读"}


@router.get("/{message_id}")
async def get_message(
    message_id: int,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """获取消息详情，仅发送者或接收者可查看"""
    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="消息不存在")
    if message.sender_id != current_user.id and message.receiver_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权查看此消息")
    return message.to_dict()


@router.put("/{message_id}/read")
async def mark_read(
    message_id: int,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """标记消息为已读"""
    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="消息不存在")
    if message.receiver_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权操作此消息")
    message.is_read = True
    db.commit()
    return {"success": True, "message": "已标记为已读"}
