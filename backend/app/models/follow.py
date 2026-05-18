from sqlalchemy import Column, Integer, String, DateTime, UniqueConstraint
from sqlalchemy.sql import func
from app.core.database import Base


class Follow(Base):
    __tablename__ = "follows"

    id = Column(Integer, primary_key=True, index=True)
    follower_id = Column(Integer, nullable=False, index=True, comment="关注者ID")
    following_id = Column(Integer, nullable=False, index=True, comment="被关注者ID")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (UniqueConstraint('follower_id', 'following_id', name='uq_follow_pair'),)
