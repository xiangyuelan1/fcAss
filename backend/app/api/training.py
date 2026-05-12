"""
训练任务API
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict

from app.core.database import get_db
from app.services.training_service import TrainingService

router = APIRouter()


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


# ============ API端点 ============

@router.get("/tasks", response_model=List[TrainingTaskResponse])
async def get_training_tasks(
    model_id: Optional[int] = None,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """获取训练任务列表"""
    service = TrainingService(db)
    tasks = service.get_tasks(model_id=model_id, status=status, skip=skip, limit=limit)
    return [task.to_dict() for task in tasks]


@router.post("/tasks", response_model=TrainingTaskResponse)
async def create_training_task(
    request: CreateTrainingRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """创建训练任务"""
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
    db: Session = Depends(get_db)
):
    """获取训练任务详情"""
    service = TrainingService(db)
    task = service.get_task(task_id)
    
    if not task:
        raise HTTPException(status_code=404, detail=f"训练任务 {task_id} 不存在")
    
    result = task.to_dict()
    result['training_config'] = result.pop('config', {})
    result['duration'] = task.duration
    return result


@router.post("/tasks/{task_id}/cancel")
async def cancel_training_task(
    task_id: int,
    db: Session = Depends(get_db)
):
    """取消训练任务"""
    service = TrainingService(db)
    
    task = service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"训练任务 {task_id} 不存在")
    
    success = service.cancel_task(task_id)
    if success:
        return {"success": True, "message": f"训练任务 {task_id} 已取消"}
    else:
        return {"success": False, "message": f"无法取消任务，当前状态: {task.status}"}


@router.get("/tasks/{task_id}/logs")
async def get_training_logs(
    task_id: int,
    db: Session = Depends(get_db)
):
    """获取训练日志"""
    service = TrainingService(db)
    
    task = service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"训练任务 {task_id} 不存在")
    
    logs = service.get_training_logs(task_id)
    return {
        "task_id": task_id,
        "logs": logs
    }


@router.get("/tasks/{task_id}/progress")
async def get_training_progress(
    task_id: int,
    db: Session = Depends(get_db)
):
    """获取训练进度（用于实时更新）"""
    service = TrainingService(db)
    
    task = service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"训练任务 {task_id} 不存在")
    
    progress = service.get_training_progress(task_id)
    return {
        "task_id": task_id,
        "status": task.status,
        "progress": progress
    }


@router.delete("/tasks/{task_id}")
async def delete_training_task(
    task_id: int,
    db: Session = Depends(get_db)
):
    """删除训练任务"""
    service = TrainingService(db)
    
    task = service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"训练任务 {task_id} 不存在")
    
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
    db: Session = Depends(get_db)
):
    """获取训练指标详情"""
    service = TrainingService(db)
    
    task = service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"训练任务 {task_id} 不存在")
    
    if not task.metrics:
        return {"success": False, "message": "暂无训练指标"}
    
    return {
        "success": True,
        "metrics": task.metrics
    }
