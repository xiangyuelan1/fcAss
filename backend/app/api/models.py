"""
模型管理API
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict
import httpx
import json
import logging

from app.core.database import get_db
from app.services.model_service import ModelService
from app.models.payment import PaymentConfig

router = APIRouter()
logger = logging.getLogger(__name__)


def _map_model_response(model) -> dict:
    """将数据库模型映射为API响应字典"""
    d = model.to_dict()
    d['model_params'] = d.pop('model_config', {})
    return d


class ModelConfigRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    model_type: str = Field(..., description="模型类型: lstm, gru, xgboost, lightgbm, randomforest, mlp")
    model_params: Optional[Dict[str, Any]] = Field(default_factory=dict, description="模型配置参数")
    features: List[str] = Field(..., description="特征列表")
    feature_config: Optional[Dict[str, Any]] = Field(default_factory=dict, description="特征工程配置")
    target: str = Field(..., description="预测目标")
    target_config: Optional[Dict[str, Any]] = Field(default_factory=dict, description="目标配置")
    stock_codes: List[str] = Field(..., description="训练股票列表")
    train_date_range: Optional[Dict[str, str]] = Field(None, description="训练日期范围")


class CreateModelRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    name: str = Field(..., min_length=1, max_length=100, description="模型名称")
    description: Optional[str] = Field(None, description="模型描述")
    config: ModelConfigRequest


class UpdateModelRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    config: Optional[ModelConfigRequest] = None


# ============================================================
# 固定路径路由（必须在动态路径 /{model_id} 之前注册）
# ============================================================

@router.get("/types/available")
async def get_available_model_types():
    """获取可用的模型类型列表"""
    service = ModelService()
    types = service.get_available_model_types()
    return {"types": types}


class AiOptimizeRequest(BaseModel):
    """AI优化参数请求"""
    model_type: str = Field(..., description="模型类型")
    features: List[str] = Field(default_factory=list, description="已选特征")
    stock_codes: List[str] = Field(default_factory=list, description="训练股票")


@router.post("/ai-optimize-params")
async def ai_optimize_params(
    request: AiOptimizeRequest,
    db: Session = Depends(get_db)
):
    """使用AI接口优化模型参数
    
    需要管理员在支付配置中配置AI接口地址和密钥。
    如果未配置或AI接口不可用，返回提示信息。
    """
    # 查找AI配置（复用payment_config表，name以"ai_"开头的记录视为AI配置）
    ai_config = db.query(PaymentConfig).filter(
        PaymentConfig.name.like('ai_%'),
        PaymentConfig.is_active == True
    ).first()

    if not ai_config:
        return {
            "success": False,
            "message": "AI优化功能未启用，请管理员在支付配置中添加AI接口配置（名称以ai_开头）"
        }

    api_url = ai_config.gateway_url
    api_key = ai_config.secret_key

    if not api_url:
        return {"success": False, "message": "AI接口地址未配置"}

    # 构建AI请求
    service = ModelService()
    model_type_info = service.MODEL_TYPES.get(request.model_type)
    if not model_type_info:
        return {"success": False, "message": f"未知模型类型: {request.model_type}"}

    prompt = (
        f"你是一个量化交易模型参数优化专家。请为以下模型推荐最优参数，"
        f"以JSON格式返回参数字典（只返回JSON，不要其他文字）。\n\n"
        f"模型类型: {request.model_type} ({model_type_info['description']})\n"
        f"可用参数: {json.dumps(model_type_info['param_schema'], ensure_ascii=False)}\n"
        f"默认参数: {json.dumps(model_type_info['default_config'], ensure_ascii=False)}\n"
        f"已选特征: {request.features}\n"
        f"训练股票: {request.stock_codes}\n\n"
        f"请基于A股市场特征，推荐适合的参数配置。"
    )

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # 兼容OpenAI API格式
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            }
            payload = {
                "model": ai_config.pid or "gpt-3.5-turbo",
                "messages": [
                    {"role": "system", "content": "你是量化交易参数优化专家，只返回JSON格式的参数配置。"},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.3,
                "max_tokens": 500,
            }
            resp = await client.post(api_url, headers=headers, json=payload)
            resp.raise_for_status()
            result = resp.json()

            # 解析AI返回的参数
            content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
            # 尝试提取JSON
            json_str = content.strip()
            if json_str.startswith("```"):
                json_str = json_str.split("\n", 1)[-1].rsplit("```", 1)[0]
            params = json.loads(json_str)

            return {"success": True, "params": params}

    except httpx.HTTPStatusError as e:
        logger.warning(f"AI接口HTTP错误: {e.response.status_code}")
        return {"success": False, "message": f"AI接口返回错误({e.response.status_code})，请检查配置"}
    except json.JSONDecodeError:
        logger.warning("AI返回内容无法解析为JSON")
        return {"success": False, "message": "AI返回格式异常，请重试"}
    except Exception as e:
        logger.warning(f"AI优化失败: {e}")
        return {"success": False, "message": f"AI优化调用失败: {str(e)[:100]}"}


# ============================================================
# 动态路径路由
# ============================================================

@router.get("")
async def get_models(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """获取用户模型列表"""
    service = ModelService(db)
    models = service.get_models(skip=skip, limit=limit)
    return [_map_model_response(m) for m in models]


@router.post("")
async def create_model(
    request: CreateModelRequest,
    db: Session = Depends(get_db)
):
    """创建新模型"""
    service = ModelService(db)
    model_params = request.config.model_params or {}
    model = service.create_model(
        name=request.name,
        description=request.description,
        model_type=request.config.model_type,
        model_config=model_params,
        features=request.config.features,
        feature_config=request.config.feature_config,
        target=request.config.target,
        target_config=request.config.target_config,
        stock_codes=request.config.stock_codes,
        train_date_range=request.config.train_date_range
    )
    return _map_model_response(model)


@router.get("/{model_id}")
async def get_model(
    model_id: int,
    db: Session = Depends(get_db)
):
    """获取模型详情"""
    service = ModelService(db)
    model = service.get_model(model_id)
    if not model:
        raise HTTPException(status_code=404, detail=f"模型 {model_id} 不存在")
    return _map_model_response(model)


@router.put("/{model_id}")
async def update_model(
    model_id: int,
    request: UpdateModelRequest,
    db: Session = Depends(get_db)
):
    """更新模型"""
    service = ModelService(db)
    existing = service.get_model(model_id)
    if not existing:
        raise HTTPException(status_code=404, detail=f"模型 {model_id} 不存在")

    update_data = {}
    if request.name is not None:
        update_data['name'] = request.name
    if request.description is not None:
        update_data['description'] = request.description
    if request.config is not None:
        update_data.update({
            'model_type': request.config.model_type,
            'model_config': request.config.model_params,
            'features': request.config.features,
            'feature_config': request.config.feature_config,
            'target': request.config.target,
            'target_config': request.config.target_config,
            'stock_codes': request.config.stock_codes,
            'train_date_range': request.config.train_date_range
        })
    model = service.update_model(model_id, **update_data)
    return _map_model_response(model)


@router.delete("/{model_id}")
async def delete_model(
    model_id: int,
    db: Session = Depends(get_db)
):
    """删除模型"""
    service = ModelService(db)
    existing = service.get_model(model_id)
    if not existing:
        raise HTTPException(status_code=404, detail=f"模型 {model_id} 不存在")
    success = service.delete_model(model_id)
    if success:
        return {"success": True, "message": f"模型 {model_id} 已删除"}
    else:
        raise HTTPException(status_code=500, detail="删除失败")


@router.get("/{model_id}/config")
async def get_model_config(
    model_id: int,
    db: Session = Depends(get_db)
):
    """获取模型配置"""
    service = ModelService(db)
    model = service.get_model(model_id)
    if not model:
        raise HTTPException(status_code=404, detail=f"模型 {model_id} 不存在")
    return {
        "model_type": model.model_type,
        "model_config": model.model_config,
        "features": model.features,
        "feature_config": model.feature_config,
        "target": model.target,
        "target_config": model.target_config,
        "stock_codes": model.stock_codes,
        "train_date_range": model.train_date_range
    }


@router.post("/{model_id}/clone")
async def clone_model(
    model_id: int,
    new_name: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """克隆模型"""
    service = ModelService(db)
    new_model = service.clone_model(model_id, new_name)
    if not new_model:
        raise HTTPException(status_code=404, detail=f"模型 {model_id} 不存在")
    return {
        "success": True,
        "message": f"模型已克隆为 {new_model.name}",
        "model": _map_model_response(new_model)
    }
