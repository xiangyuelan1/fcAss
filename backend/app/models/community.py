from sqlalchemy import Column, Integer, String, DateTime, Text, JSON, Boolean, ForeignKey, DECIMAL, UniqueConstraint
from sqlalchemy.orm import relationship
from app.core.database import Base
from datetime import datetime


class CommunityModel(Base):
    __tablename__ = "community_models"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    source_model_id = Column(Integer, nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    model_type = Column(String(50), nullable=False)
    model_config = Column(JSON, nullable=False)
    features = Column(JSON, nullable=False)
    feature_config = Column(JSON, default=dict)
    target = Column(String(50), nullable=False)
    target_config = Column(JSON, default=dict)
    stock_codes = Column(JSON, default=list)
    train_date_range = Column(JSON)
    metrics = Column(JSON)
    is_active = Column(Boolean, default=True)
    visibility = Column(String(20), default="public")
    auto_predict = Column(Boolean, default=True, comment="是否每日自动预测")
    prediction_record = Column(JSON, default=dict, comment="预测战绩记录")
    likes_count = Column(Integer, default=0)
    clones_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    likes = relationship("CommunityLike", back_populates="community_model", cascade="all, delete-orphan",
                         foreign_keys="CommunityLike.community_model_id")

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "source_model_id": self.source_model_id,
            "name": self.name,
            "description": self.description,
            "model_type": self.model_type,
            "model_params": self.model_config,
            "features": self.features,
            "feature_config": self.feature_config,
            "target": self.target,
            "target_config": self.target_config,
            "stock_codes": self.stock_codes,
            "train_date_range": self.train_date_range,
            "metrics": self.metrics,
            "is_active": self.is_active,
            "visibility": self.visibility or "public",
            "auto_predict": self.auto_predict if self.auto_predict is not None else True,
            "prediction_record": self.prediction_record or {},
            "likes_count": self.likes_count,
            "clones_count": self.clones_count,
            "created_at": self.created_at.strftime("%Y-%m-%d %H:%M:%S") if self.created_at else None,
            "updated_at": self.updated_at.strftime("%Y-%m-%d %H:%M:%S") if self.updated_at else None,
        }


class CommunitySignal(Base):
    __tablename__ = "community_signals"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    community_model_id = Column(Integer, ForeignKey("community_models.id"), nullable=False)
    stock_code = Column(String(20), nullable=False, index=True)
    direction = Column(String(10), nullable=False)
    prediction_value = Column(DECIMAL(10, 4))
    confidence = Column(DECIMAL(5, 4))
    prediction_date = Column(String(10), nullable=False)
    likes_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.now)

    community_model = relationship("CommunityModel")
    likes = relationship("CommunityLike", back_populates="community_signal", cascade="all, delete-orphan",
                         foreign_keys="CommunityLike.community_signal_id")

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "community_model_id": self.community_model_id,
            "stock_code": self.stock_code,
            "direction": self.direction,
            "prediction_value": float(self.prediction_value) if self.prediction_value else None,
            "confidence": float(self.confidence) if self.confidence else None,
            "prediction_date": self.prediction_date,
            "likes_count": self.likes_count,
            "created_at": self.created_at.strftime("%Y-%m-%d %H:%M:%S") if self.created_at else None,
        }


class CommunityLike(Base):
    __tablename__ = "community_likes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False)
    community_model_id = Column(Integer, ForeignKey("community_models.id"), nullable=True)
    community_signal_id = Column(Integer, ForeignKey("community_signals.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.now)

    community_model = relationship("CommunityModel", back_populates="likes", foreign_keys=[community_model_id])
    community_signal = relationship("CommunitySignal", back_populates="likes", foreign_keys=[community_signal_id])

    __table_args__ = (
        UniqueConstraint('user_id', 'community_model_id', name='uix_like_model'),
        UniqueConstraint('user_id', 'community_signal_id', name='uix_like_signal'),
    )


class UserPoints(Base):
    __tablename__ = "user_points"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, unique=True, nullable=False, index=True)
    total_points = Column(Integer, default=0)
    level = Column(Integer, default=1)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "total_points": self.total_points,
            "level": self.level,
            "updated_at": self.updated_at.strftime("%Y-%m-%d %H:%M:%S") if self.updated_at else None,
        }


class PointTransaction(Base):
    __tablename__ = "point_transactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    action = Column(String(50), nullable=False)
    points = Column(Integer, nullable=False)
    target_type = Column(String(50))
    target_id = Column(Integer)
    description = Column(String(255))
    created_at = Column(DateTime, default=datetime.now)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "action": self.action,
            "points": self.points,
            "target_type": self.target_type,
            "target_id": self.target_id,
            "description": self.description,
            "created_at": self.created_at.strftime("%Y-%m-%d %H:%M:%S") if self.created_at else None,
        }


class PKChallenge(Base):
    __tablename__ = "pk_challenges"

    id = Column(Integer, primary_key=True, index=True)
    challenger_id = Column(Integer, nullable=False, index=True)
    challenger_model_id = Column(Integer, nullable=False)
    defender_id = Column(Integer)
    defender_model_id = Column(Integer)
    stock_code = Column(String(20), nullable=False)
    pk_mode = Column(String(20), nullable=False)
    pk_config = Column(JSON, default=dict)
    prediction_date = Column(String(10), nullable=False)
    status = Column(String(20), default="open")
    winner_id = Column(Integer)
    challenger_result = Column(JSON)
    defender_result = Column(JSON)
    created_at = Column(DateTime, default=datetime.now)
    evaluated_at = Column(DateTime)

    def to_dict(self):
        return {
            "id": self.id,
            "challenger_id": self.challenger_id,
            "challenger_model_id": self.challenger_model_id,
            "defender_id": self.defender_id,
            "defender_model_id": self.defender_model_id,
            "stock_code": self.stock_code,
            "pk_mode": self.pk_mode,
            "pk_config": self.pk_config,
            "prediction_date": self.prediction_date,
            "status": self.status,
            "winner_id": self.winner_id,
            "challenger_result": self.challenger_result,
            "defender_result": self.defender_result,
            "created_at": self.created_at.strftime("%Y-%m-%d %H:%M:%S") if self.created_at else None,
            "evaluated_at": self.evaluated_at.strftime("%Y-%m-%d %H:%M:%S") if self.evaluated_at else None,
        }


class Achievement(Base):
    __tablename__ = "achievements"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    badge_type = Column(String(50), nullable=False)
    badge_name = Column(String(100), nullable=False)
    description = Column(String(200))
    earned_at = Column(DateTime, default=datetime.now)

    __table_args__ = (UniqueConstraint('user_id', 'badge_type', name='uix_user_badge'),)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "badge_type": self.badge_type,
            "badge_name": self.badge_name,
            "description": self.description,
            "earned_at": self.earned_at.strftime("%Y-%m-%d %H:%M:%S") if self.earned_at else None,
        }


class DailyChallengeSubmission(Base):
    __tablename__ = "daily_challenge_submissions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    challenge_date = Column(String(10), nullable=False)
    stock_code = Column(String(20), nullable=False)
    direction = Column(String(10), nullable=False)
    confidence = Column(DECIMAL(5, 4))
    is_correct = Column(Boolean, nullable=True)
    evaluated = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.now)

    __table_args__ = (UniqueConstraint('user_id', 'challenge_date', name='uix_user_daily_challenge'),)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "challenge_date": self.challenge_date,
            "stock_code": self.stock_code,
            "direction": self.direction,
            "confidence": float(self.confidence) if self.confidence else None,
            "is_correct": self.is_correct,
            "evaluated": self.evaluated,
            "created_at": self.created_at.strftime("%Y-%m-%d %H:%M:%S") if self.created_at else None,
        }
