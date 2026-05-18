from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional

from app.core.database import get_db
from app.auth import get_current_active_user, optional_get_current_active_user
from app.models.user import User as UserModel
from app.models.follow import Follow
from app.models.user_model import UserModel as UserORMModel
from app.models.community import CommunityModel

router = APIRouter()


@router.get("/users/{user_id}/profile")
async def get_user_profile(
    user_id: int,
    current_user: Optional[UserModel] = Depends(optional_get_current_active_user),
    db: Session = Depends(get_db),
):
    target = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="用户不存在")

    model_count = db.query(func.count(UserORMModel.id)).filter(
        UserORMModel.user_id == user_id
    ).scalar()

    following_count = db.query(func.count(Follow.id)).filter(
        Follow.follower_id == user_id
    ).scalar()

    followers_count = db.query(func.count(Follow.id)).filter(
        Follow.following_id == user_id
    ).scalar()

    is_following = False
    if current_user:
        is_following = db.query(Follow).filter(
            Follow.follower_id == current_user.id,
            Follow.following_id == user_id,
        ).first() is not None

    published_models = db.query(CommunityModel).filter(
        CommunityModel.user_id == user_id,
        CommunityModel.visibility == "public",
    ).order_by(CommunityModel.created_at.desc()).all()

    return {
        "id": target.id,
        "username": target.username,
        "nickname": target.nickname,
        "model_count": model_count,
        "following_count": following_count,
        "followers_count": followers_count,
        "is_following": is_following,
        "published_models": [m.to_dict() for m in published_models],
        "created_at": target.created_at.isoformat() if target.created_at else None,
    }


@router.post("/users/{user_id}/follow")
async def follow_user(
    user_id: int,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    if current_user.id == user_id:
        raise HTTPException(status_code=400, detail="不能关注自己")

    target = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="用户不存在")

    existing = db.query(Follow).filter(
        Follow.follower_id == current_user.id,
        Follow.following_id == user_id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="已经关注了该用户")

    follow = Follow(follower_id=current_user.id, following_id=user_id)
    db.add(follow)
    db.commit()

    return {"success": True, "message": f"已关注 {target.nickname or target.username}"}


@router.delete("/users/{user_id}/follow")
async def unfollow_user(
    user_id: int,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    follow = db.query(Follow).filter(
        Follow.follower_id == current_user.id,
        Follow.following_id == user_id,
    ).first()
    if not follow:
        raise HTTPException(status_code=404, detail="未关注该用户")

    db.delete(follow)
    db.commit()

    return {"success": True, "message": "已取消关注"}


@router.get("/users/{user_id}/followers")
async def get_followers(
    user_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    target = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="用户不存在")

    query = db.query(Follow).filter(Follow.following_id == user_id)
    total = query.count()
    offset = (page - 1) * page_size
    follows = query.order_by(Follow.created_at.desc()).offset(offset).limit(page_size).all()

    follower_ids = [f.follower_id for f in follows]
    follower_map = {}
    if follower_ids:
        users = db.query(UserModel).filter(UserModel.id.in_(follower_ids)).all()
        for u in users:
            follower_map[u.id] = u

    result = []
    for f in follows:
        u = follower_map.get(f.follower_id)
        if u:
            result.append({
                "id": u.id,
                "username": u.username,
                "nickname": u.nickname,
                "followed_at": f.created_at.isoformat() if f.created_at else None,
            })

    return {"total": total, "page": page, "page_size": page_size, "followers": result}


@router.get("/users/{user_id}/following")
async def get_following(
    user_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    target = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="用户不存在")

    query = db.query(Follow).filter(Follow.follower_id == user_id)
    total = query.count()
    offset = (page - 1) * page_size
    follows = query.order_by(Follow.created_at.desc()).offset(offset).limit(page_size).all()

    following_ids = [f.following_id for f in follows]
    following_map = {}
    if following_ids:
        users = db.query(UserModel).filter(UserModel.id.in_(following_ids)).all()
        for u in users:
            following_map[u.id] = u

    result = []
    for f in follows:
        u = following_map.get(f.following_id)
        if u:
            result.append({
                "id": u.id,
                "username": u.username,
                "nickname": u.nickname,
                "followed_at": f.created_at.isoformat() if f.created_at else None,
            })

    return {"total": total, "page": page, "page_size": page_size, "following": result}


@router.get("/following/updates")
async def get_following_updates(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    following_ids = [
        r[0] for r in db.query(Follow.following_id).filter(
            Follow.follower_id == current_user.id
        ).all()
    ]

    if not following_ids:
        return {"total": 0, "page": page, "page_size": page_size, "updates": []}

    query = db.query(CommunityModel).filter(
        CommunityModel.user_id.in_(following_ids),
        CommunityModel.visibility == "public",
    )
    total = query.count()
    offset = (page - 1) * page_size
    models = query.order_by(CommunityModel.created_at.desc()).offset(offset).limit(page_size).all()

    user_map = {}
    user_ids = list({m.user_id for m in models})
    if user_ids:
        users = db.query(UserModel).filter(UserModel.id.in_(user_ids)).all()
        for u in users:
            user_map[u.id] = u

    updates = []
    for m in models:
        u = user_map.get(m.user_id)
        updates.append({
            "type": "new_model",
            "model": m.to_dict(),
            "user": {
                "id": u.id,
                "username": u.username,
                "nickname": u.nickname,
            } if u else None,
        })

    return {"total": total, "page": page, "page_size": page_size, "updates": updates}
