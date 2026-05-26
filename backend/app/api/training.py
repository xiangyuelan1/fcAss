"""
训练任务API
"""
import json
import queue
import threading
import logging
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict
from fastapi.responses import StreamingResponse

from app.core.database import get_db, SessionLocal
from app.services.training_service import TrainingService
from app.models.training import TrainingTask
from app.models.user_model import UserModel as UserTableModel
from app.auth import get_current_active_user
from app.models.user import User as UserModel
from sqlalchemy import func

router = APIRouter()
logger = logging.getLogger(__name__)


def _verify_task_ownership(task: TrainingTask, current_user: UserModel):
    """验证训练任务是否属于当前用户，管理员可访问所有任务"""
    if current_user.is_admin:
        return
    if task.user_model is None or task.user_model.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权访问该训练任务")


# ============ 请求/响应模型 ============

class CreateTrainingRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    model_id: int = Field(..., description="模型ID")
    training_config: Dict[str, Any] = Field(default_factory=dict, description="训练配置")


class TrainingTaskResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    id: int
    model_id: int
    status: str
    start_time: Optional[str]
    end_time: Optional[str]
    metrics: Optional[Dict[str, Any]]
    error_message: Optional[str]


class TrainingDetailResponse(TrainingTaskResponse):
    training_config: Dict[str, Any]
    duration: Optional[float]


class PaginatedTrainingTaskResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    items: List[TrainingTaskResponse]
    total: int
    page: int
    page_size: int


# ============ API端点 ============

@router.get("/tasks", response_model=PaginatedTrainingTaskResponse)
async def get_training_tasks(
    model_id: Optional[int] = None,
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 100,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """获取当前用户的训练任务列表"""
    skip = (page - 1) * page_size
    service = TrainingService(db)

    # 管理员可查看所有任务，普通用户仅查看自己的
    filter_user_id = None if current_user.is_admin else current_user.id
    tasks = service.get_tasks(
        model_id=model_id, status=status, skip=skip, limit=page_size,
        user_id=filter_user_id
    )

    query = db.query(TrainingTask)
    if filter_user_id is not None:
        query = query.join(UserTableModel, TrainingTask.model_id == UserTableModel.id).filter(
            UserTableModel.user_id == filter_user_id
        )
    if model_id:
        query = query.filter(TrainingTask.model_id == model_id)
    if status:
        query = query.filter(TrainingTask.status == status)
    total = query.count()

    return {
        "items": [task.to_dict() for task in tasks],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("/tasks", response_model=TrainingTaskResponse)
async def create_training_task(
    request: CreateTrainingRequest,
    background_tasks: BackgroundTasks,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """创建训练任务，需验证模型属于当前用户"""
    # 验证模型属于当前用户
    user_model = db.query(UserTableModel).filter(UserTableModel.id == request.model_id).first()
    if not user_model:
        raise HTTPException(status_code=404, detail=f"模型 {request.model_id} 不存在")
    if not current_user.is_admin and user_model.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权使用该模型创建训练任务")

    running_count = db.query(TrainingTask).join(
        UserTableModel, TrainingTask.model_id == UserTableModel.id
    ).filter(
        UserTableModel.user_id == current_user.id,
        TrainingTask.status == 'running'
    ).count()
    if running_count >= 2:
        raise HTTPException(status_code=429, detail="同时最多允许2个训练任务，请等待当前任务完成后再发起新训练")

    # 检查本周训练次数
    week_start = datetime.now() - timedelta(days=datetime.now().weekday())
    week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)
    weekly_count = db.query(TrainingTask).join(
        UserTableModel, TrainingTask.model_id == UserTableModel.id
    ).filter(
        UserTableModel.user_id == current_user.id,
        TrainingTask.created_at >= week_start,
    ).count()

    WEEKLY_TRAINING_LIMIT = 3
    if not current_user.is_admin and weekly_count >= WEEKLY_TRAINING_LIMIT:
        raise HTTPException(
            status_code=429,
            detail=f"每周最多训练{WEEKLY_TRAINING_LIMIT}次，本周已用{weekly_count}次，下周重置"
        )

    service = TrainingService(db)

    task = service.create_task(
        model_id=request.model_id,
        config=request.training_config
    )

    background_tasks.add_task(service.run_training, task.id)

    return task.to_dict()


@router.get("/tasks/{task_id}", response_model=TrainingDetailResponse)
async def get_training_task(
    task_id: int,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """获取训练任务详情，需验证所有权"""
    service = TrainingService(db)
    task = service.get_task(task_id)

    if not task:
        raise HTTPException(status_code=404, detail=f"训练任务 {task_id} 不存在")

    _verify_task_ownership(task, current_user)

    result = task.to_dict()
    result['training_config'] = result.pop('config', {})
    result['duration'] = task.duration
    return result


@router.post("/tasks/{task_id}/cancel")
async def cancel_training_task(
    task_id: int,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """取消训练任务，需验证所有权"""
    service = TrainingService(db)

    task = service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"训练任务 {task_id} 不存在")

    _verify_task_ownership(task, current_user)

    success = service.cancel_task(task_id)
    if success:
        return {"success": True, "message": f"训练任务 {task_id} 已取消"}
    else:
        return {"success": False, "message": f"无法取消任务，当前状态: {task.status}"}


@router.get("/tasks/{task_id}/logs")
async def get_training_logs(
    task_id: int,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """获取训练日志，需验证所有权"""
    service = TrainingService(db)

    task = service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"训练任务 {task_id} 不存在")

    _verify_task_ownership(task, current_user)

    logs = service.get_training_logs(task_id)
    return {
        "task_id": task_id,
        "logs": logs
    }


@router.get("/tasks/{task_id}/progress")
async def get_training_progress(
    task_id: int,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """获取训练进度，需验证所有权"""
    service = TrainingService(db)

    task = service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"训练任务 {task_id} 不存在")

    _verify_task_ownership(task, current_user)

    progress = service.get_training_progress(task_id)
    return {
        "task_id": task_id,
        "status": task.status,
        "progress": progress
    }


@router.delete("/tasks/{task_id}")
async def delete_training_task(
    task_id: int,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """删除训练任务，需验证所有权"""
    service = TrainingService(db)

    task = service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"训练任务 {task_id} 不存在")

    _verify_task_ownership(task, current_user)

    # 只能删除已完成或已取消的任务
    if task.status in ['running', 'pending']:
        raise HTTPException(status_code=400, detail="无法删除运行中或待执行的任务")

    success = service.delete_task(task_id)
    if success:
        return {"success": True, "message": f"训练任务 {task_id} 已删除"}
    else:
        raise HTTPException(status_code=500, detail="删除失败")


@router.get("/tasks/{task_id}/metrics")
async def get_training_metrics(
    task_id: int,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """获取训练指标详情，需验证所有权"""
    service = TrainingService(db)

    task = service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"训练任务 {task_id} 不存在")

    _verify_task_ownership(task, current_user)

    if not task.metrics:
        return {"success": False, "message": "暂无训练指标"}

    return {
        "success": True,
        "metrics": task.metrics
    }


@router.get("/tasks/{task_id}/progress-stream")
async def training_progress_stream(
    task_id: int,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """SSE 流式获取训练进度，需验证所有权"""
    # 先验证任务存在且属于当前用户
    service = TrainingService(db)
    task = service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"训练任务 {task_id} 不存在")
    _verify_task_ownership(task, current_user)

    q: queue.Queue = queue.Queue()

    def worker():
        db_worker = None
        try:
            db_worker = SessionLocal()
            worker_service = TrainingService(db_worker)

            from app.services.training_service import training_progress, STAGE_LABELS
            import time

            last_progress = None
            while True:
                task_obj = worker_service.get_task(task_id)
                if not task_obj:
                    break

                current_progress = training_progress.get(task_id, {})
                if current_progress != last_progress:
                    last_progress = current_progress.copy() if current_progress else None
                    stage = current_progress.get('stage', task_obj.status)
                    progress_val = current_progress.get('progress', 0)
                    elapsed = current_progress.get('elapsed_seconds')
                    q.put(json.dumps({
                        'stage': stage,
                        'progress': progress_val,
                        'epoch': current_progress.get('epoch'),
                        'total_epochs': current_progress.get('total_epochs'),
                        'train_loss': current_progress.get('train_loss'),
                        'val_loss': current_progress.get('val_loss'),
                        'status': task_obj.status,
                        'start_time': current_progress.get('start_time'),
                        'elapsed_seconds': elapsed,
                        'estimated_remaining_seconds': current_progress.get('estimated_remaining_seconds'),
                        'stage_label': STAGE_LABELS.get(stage, stage),
                        'current_stock': current_progress.get('current_stock'),
                        'total_stocks': current_progress.get('total_stocks'),
                    }, ensure_ascii=False))

                if task_obj.status in ['completed', 'failed', 'cancelled']:
                    metrics = {}
                    if task_obj.metrics and isinstance(task_obj.metrics, dict):
                        for k, v in task_obj.metrics.items():
                            if isinstance(v, (int, float)):
                                metrics[k] = v
                    final_stage = task_obj.status
                    q.put(json.dumps({
                        'stage': final_stage,
                        'progress': 100 if task_obj.status == 'completed' else 0,
                        'status': task_obj.status,
                        'error': task_obj.error_message if task_obj.status == 'failed' else None,
                        'metrics': metrics,
                        'stage_label': STAGE_LABELS.get(final_stage, final_stage),
                        'estimated_remaining_seconds': 0 if task_obj.status == 'completed' else None,
                    }, ensure_ascii=False))
                    break

                time.sleep(0.5)
        except Exception as e:
            logger.exception(f"SSE获取训练进度失败")
            q.put(json.dumps({'stage': 'error', 'progress': 0, 'message': str(e)}, ensure_ascii=False))
        finally:
            if db_worker:
                db_worker.close()
            q.put(None)

    t = threading.Thread(target=worker, daemon=True)
    t.start()

    def event_generator():
        while True:
            item = q.get()
            if item is None:
                break
            yield f"data: {item}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )
