"""
站内信模型
"""
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base


class Message(Base):
    """站内信模型，支持用户向开发团队发送消息及管理员回复"""
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    receiver_id = Column(Integer, nullable=False, default=0, index=True)
    subject = Column(String(200), nullable=False)
    content = Column(Text, nullable=False)
    parent_id = Column(Integer, ForeignKey("messages.id"), nullable=True, index=True)
    is_read = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime, default=datetime.now)

    sender = relationship("User", foreign_keys=[sender_id])
    parent = relationship("Message", remote_side=[id], backref="replies")

    def to_dict(self):
        """转换为字典，包含发送者名称和嵌套回复"""
        return {
            "id": self.id,
            "sender_id": self.sender_id,
            "sender_name": self.sender.username if self.sender else None,
            "receiver_id": self.receiver_id,
            "subject": self.subject,
            "content": self.content,
            "parent_id": self.parent_id,
            "is_read": self.is_read,
            "created_at": self.created_at.strftime("%Y-%m-%d %H:%M:%S") if self.created_at else None,
            "replies": [r.to_dict() for r in self.replies] if hasattr(self, "replies") else [],
        }
