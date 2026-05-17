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
from datetime import datetime

from app.core.database import get_db
from app.services.model_service import ModelService
from app.models.payment import PaymentConfig
from app.auth import get_current_active_user
from app.models.user import User as UserModel
from app.models.user_prefs import UserModelPrefs
from app.models.user_model import UserModel as UserTableModel
from sqlalchemy import func

router = APIRouter()
logger = logging.getLogger(__name__)


def _verify_model_ownership(model: UserTableModel, current_user: UserModel):
    """验证模型是否属于当前用户，管理员可访问所有模型"""
    if current_user.is_admin:
        return
    if model.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权访问该模型")


def _map_model_response(model) -> dict:
    """将数据库模型映射为API响应字典"""
    return model.to_dict()


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


MODEL_TYPE_DESCRIPTIONS = {
    "lstm": "长短期记忆网络，适合捕捉时序依赖关系",
    "gru": "门控循环单元，LSTM的轻量替代方案",
    "mlp": "多层感知器，经典前馈神经网络",
    "xgboost": "梯度提升树，集成学习中的强力选手",
    "lightgbm": "轻量梯度提升，训练速度快、内存占用低",
    "randomforest": "随机森林，稳健的集成学习方法",
}

# ============================================================
# 模型模板定义
# ============================================================

MODEL_TEMPLATES = [
    {
        "id": "simple_direction",
        "name": "简单涨跌预测",
        "description": "最简单的入门模板，预测股票次日涨跌方向",
        "category": "beginner",
        "model_type": "xgboost",
        "model_params": {
            "n_estimators": 100,
            "max_depth": 6,
            "learning_rate": 0.1,
            "subsample": 0.8,
            "colsample_bytree": 0.8,
            "reg_alpha": 0.0,
            "reg_lambda": 1.0,
        },
        "features": ["sma", "rsi", "macd"],
        "feature_config": {},
        "target": "next_day_direction",
        "target_config": {},
        "stock_codes": [],
        "train_date_range": None,
        "difficulty": "简单",
        "tags": ["入门", "分类", "XGBoost"],
        "is_recommended": True,
    },
    {
        "id": "trend_following",
        "name": "趋势跟踪策略",
        "description": "使用均线和布林带跟踪趋势",
        "category": "beginner",
        "model_type": "randomforest",
        "model_params": {
            "n_estimators": 100,
            "max_depth": 10,
            "min_samples_split": 2,
            "min_samples_leaf": 1,
            "max_features": "sqrt",
        },
        "features": ["sma", "ema", "boll"],
        "feature_config": {},
        "target": "next_day_return",
        "target_config": {},
        "stock_codes": [],
        "train_date_range": None,
        "difficulty": "简单",
        "tags": ["趋势", "均线", "随机森林"],
        "is_recommended": False,
    },
    {
        "id": "multi_factor",
        "name": "多因子选股",
        "description": "综合多个技术指标进行选股预测",
        "category": "intermediate",
        "model_type": "lightgbm",
        "model_params": {
            "n_estimators": 100,
            "max_depth": -1,
            "learning_rate": 0.1,
            "num_leaves": 31,
            "subsample": 0.8,
            "colsample_bytree": 0.8,
            "reg_alpha": 0.0,
            "reg_lambda": 0.0,
        },
        "features": ["sma", "ema", "rsi", "macd", "kdj", "cci"],
        "feature_config": {},
        "target": "next_day_return",
        "target_config": {},
        "stock_codes": [],
        "train_date_range": None,
        "difficulty": "中等",
        "tags": ["多因子", "选股", "LightGBM"],
        "is_recommended": True,
    },
    {
        "id": "deep_sequence",
        "name": "深度时序预测",
        "description": "使用LSTM深度学习模型捕捉时序规律",
        "category": "intermediate",
        "model_type": "lstm",
        "model_params": {
            "hidden_size": 64,
            "num_layers": 2,
            "dropout": 0.2,
            "sequence_length": 20,
            "learning_rate": 0.001,
            "epochs": 50,
            "batch_size": 32,
        },
        "features": ["sma", "ema", "rsi", "macd", "boll", "atr"],
        "feature_config": {},
        "target": "next_day_return",
        "target_config": {},
        "stock_codes": [],
        "train_date_range": None,
        "difficulty": "中等",
        "tags": ["深度学习", "时序", "LSTM"],
        "is_recommended": False,
    },
    {
        "id": "short_term_fast",
        "name": "短线快速预测",
        "description": "GRU模型快速预测短线涨跌",
        "category": "advanced",
        "model_type": "gru",
        "model_params": {
            "hidden_size": 64,
            "num_layers": 2,
            "dropout": 0.2,
            "sequence_length": 20,
            "learning_rate": 0.001,
            "epochs": 50,
            "batch_size": 32,
        },
        "features": ["sma", "rsi", "macd", "kdj", "volume_sma", "volatility"],
        "feature_config": {},
        "target": "next_day_direction",
        "target_config": {},
        "stock_codes": [],
        "train_date_range": None,
        "difficulty": "较难",
        "tags": ["短线", "GRU", "深度学习"],
        "is_recommended": False,
    },
    {
        "id": "comprehensive_features",
        "name": "综合特征组合",
        "description": "MLP模型利用全部特征进行综合预测",
        "category": "advanced",
        "model_type": "mlp",
        "model_params": {
            "hidden_layers": [128, 64],
            "dropout": 0.2,
            "learning_rate": 0.001,
            "epochs": 50,
            "batch_size": 32,
            "activation": "relu",
        },
        "features": ["sma", "ema", "rsi", "macd", "kdj", "cci", "boll", "atr", "obv", "volume_sma"],
        "feature_config": {},
        "target": "multi_feature_next_day",
        "target_config": {},
        "stock_codes": [],
        "train_date_range": None,
        "difficulty": "较难",
        "tags": ["全特征", "MLP", "多维预测"],
        "is_recommended": False,
    },
]


@router.get("/templates")
async def get_templates():
    """获取预定义模型模板列表"""
    return {"templates": MODEL_TEMPLATES}


@router.get("/random-stock")
async def get_random_stock_with_data(db: Session = Depends(get_db)):
    """随机获取一只已有数据的股票，用于模板创建时默认填充"""
    import random
    from app.models.stock import Stock, StockPrice

    stocks_with_data = (
        db.query(Stock.code, Stock.name)
        .join(StockPrice, StockPrice.stock_code == Stock.code)
        .group_by(Stock.code, Stock.name)
        .having(func.count(StockPrice.id) > 50)
        .all()
    )

    if not stocks_with_data:
        return {"stock": None, "message": "暂无足够数据的股票，请先获取股票数据"}

    chosen = random.choice(stocks_with_data)
    return {"stock": {"code": chosen.code, "name": chosen.name}, "message": None}


@router.post("/templates/{template_id}/create")
async def create_from_template(
    template_id: str,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """根据模板创建模型，绑定到当前用户"""
    template = next((t for t in MODEL_TEMPLATES if t["id"] == template_id), None)
    if not template:
        raise HTTPException(status_code=404, detail=f"模板 {template_id} 不存在")

    service = ModelService(db)
    model = service.create_model(
        name=template["name"],
        description=template["description"],
        model_type=template["model_type"],
        model_config=template["model_params"],
        features=template["features"],
        feature_config=template["feature_config"],
        target=template["target"],
        target_config=template["target_config"],
        stock_codes=template["stock_codes"],
        train_date_range=template["train_date_range"],
        user_id=current_user.id,
    )
    return _map_model_response(model)


@router.get("/types/stats")
async def get_model_type_stats(db: Session = Depends(get_db)):
    """获取模型类型使用统计"""
    service = ModelService()
    available_types = service.get_available_model_types()

    type_name_map = {t["key"]: t["name"] for t in available_types}

    count_rows = db.query(
        UserTableModel.model_type,
        func.count(UserTableModel.id).label("count"),
        func.count(func.distinct(UserTableModel.user_id)).label("unique_users"),
    ).group_by(UserTableModel.model_type).all()

    count_map = {}
    for row in count_rows:
        count_map[row.model_type] = {
            "count": row.count,
            "unique_users": row.unique_users,
        }

    stats = []
    for type_info in available_types:
        key = type_info["key"]
        c = count_map.get(key, {"count": 0, "unique_users": 0})
        unique = c["unique_users"] or 1
        stats.append({
            "model_type": key,
            "display_name": type_name_map.get(key, key),
            "count": c["count"],
            "unique_users": c["unique_users"],
            "avg_per_user": round(c["count"] / unique, 2) if c["count"] > 0 else 0,
            "description": MODEL_TYPE_DESCRIPTIONS.get(key, ""),
        })

    return {"stats": stats}


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
    page: int = 1,
    page_size: int = 100,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """获取当前用户的模型列表"""
    skip = (page - 1) * page_size
    service = ModelService(db)

    # 管理员可查看所有模型，普通用户仅查看自己的
    filter_user_id = None if current_user.is_admin else current_user.id
    models = service.get_models(skip=skip, limit=page_size, user_id=filter_user_id)

    prefs_map = {}
    prefs = db.query(UserModelPrefs).filter(
        UserModelPrefs.user_id == current_user.id
    ).all()
    for p in prefs:
        prefs_map[p.model_id] = {
            'is_pinned': p.is_pinned,
            'is_favorited': p.is_favorited,
        }

    result = []
    for m in models:
        d = _map_model_response(m)
        pref = prefs_map.get(m.id, {})
        d['is_pinned'] = pref.get('is_pinned', False)
        d['is_favorited'] = pref.get('is_favorited', False)
        result.append(d)

    result.sort(key=lambda x: (0 if x.get('is_pinned') else 1, x.get('id', 0)), reverse=False)
    pinned = [x for x in result if x.get('is_pinned')]
    others = [x for x in result if not x.get('is_pinned')]
    others.sort(key=lambda x: x.get('id', 0), reverse=True)
    result = pinned + others

    total_query = db.query(func.count(UserTableModel.id))
    if filter_user_id is not None:
        total_query = total_query.filter(UserTableModel.user_id == filter_user_id)
    total = total_query.scalar()

    return {
        "items": result,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("")
async def create_model(
    request: CreateModelRequest,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """创建新模型，绑定到当前用户"""
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
        train_date_range=request.config.train_date_range,
        user_id=current_user.id
    )
    return _map_model_response(model)


@router.get("/{model_id}")
async def get_model(
    model_id: int,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """获取模型详情，需验证所有权"""
    service = ModelService(db)
    model = service.get_model(model_id)
    if not model:
        raise HTTPException(status_code=404, detail=f"模型 {model_id} 不存在")
    _verify_model_ownership(model, current_user)
    return _map_model_response(model)


@router.put("/{model_id}")
async def update_model(
    model_id: int,
    request: UpdateModelRequest,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """更新模型，需验证所有权"""
    service = ModelService(db)
    existing = service.get_model(model_id)
    if not existing:
        raise HTTPException(status_code=404, detail=f"模型 {model_id} 不存在")
    _verify_model_ownership(existing, current_user)

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
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """删除模型，需验证所有权"""
    service = ModelService(db)
    existing = service.get_model(model_id)
    if not existing:
        raise HTTPException(status_code=404, detail=f"模型 {model_id} 不存在")
    _verify_model_ownership(existing, current_user)
    success = service.delete_model(model_id)
    if success:
        return {"success": True, "message": f"模型 {model_id} 已删除"}
    else:
        raise HTTPException(status_code=500, detail="删除失败")


@router.get("/{model_id}/config")
async def get_model_config(
    model_id: int,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """获取模型配置，需验证所有权"""
    service = ModelService(db)
    model = service.get_model(model_id)
    if not model:
        raise HTTPException(status_code=404, detail=f"模型 {model_id} 不存在")
    _verify_model_ownership(model, current_user)
    return {
        "model_type": model.model_type,
        "model_params": model.model_config,
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
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """克隆模型，克隆后的模型属于当前用户"""
    service = ModelService(db)
    source_model = service.get_model(model_id)
    if not source_model:
        raise HTTPException(status_code=404, detail=f"模型 {model_id} 不存在")
    _verify_model_ownership(source_model, current_user)
    new_model = service.clone_model(model_id, new_name, user_id=current_user.id)
    if not new_model:
        raise HTTPException(status_code=404, detail=f"模型 {model_id} 不存在")
    return {
        "success": True,
        "message": f"模型已克隆为 {new_model.name}",
        "model": _map_model_response(new_model)
    }


@router.post("/{model_id}/pin")
async def pin_model(
    model_id: int,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    service = ModelService(db)
    model = service.get_model(model_id)
    if not model:
        raise HTTPException(status_code=404, detail=f"模型 {model_id} 不存在")
    _verify_model_ownership(model, current_user)
    pref = db.query(UserModelPrefs).filter(
        UserModelPrefs.user_id == current_user.id,
        UserModelPrefs.model_id == model_id
    ).first()
    if pref:
        pref.is_pinned = True
        pref.pinned_at = datetime.now()
    else:
        pref = UserModelPrefs(
            user_id=current_user.id,
            model_id=model_id,
            is_pinned=True,
            pinned_at=datetime.now()
        )
        db.add(pref)
    db.commit()
    return {"success": True, "message": f"模型已置顶"}


@router.post("/{model_id}/unpin")
async def unpin_model(
    model_id: int,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    pref = db.query(UserModelPrefs).filter(
        UserModelPrefs.user_id == current_user.id,
        UserModelPrefs.model_id == model_id
    ).first()
    if pref:
        pref.is_pinned = False
        pref.pinned_at = None
        db.commit()
    return {"success": True, "message": f"模型已取消置顶"}


@router.post("/{model_id}/favorite")
async def favorite_model(
    model_id: int,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    service = ModelService(db)
    model = service.get_model(model_id)
    if not model:
        raise HTTPException(status_code=404, detail=f"模型 {model_id} 不存在")
    _verify_model_ownership(model, current_user)
    pref = db.query(UserModelPrefs).filter(
        UserModelPrefs.user_id == current_user.id,
        UserModelPrefs.model_id == model_id
    ).first()
    if pref:
        pref.is_favorited = True
        pref.favorited_at = datetime.now()
    else:
        pref = UserModelPrefs(
            user_id=current_user.id,
            model_id=model_id,
            is_favorited=True,
            favorited_at=datetime.now()
        )
        db.add(pref)
    db.commit()
    return {"success": True, "message": f"模型已收藏"}


@router.post("/{model_id}/unfavorite")
async def unfavorite_model(
    model_id: int,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    pref = db.query(UserModelPrefs).filter(
        UserModelPrefs.user_id == current_user.id,
        UserModelPrefs.model_id == model_id
    ).first()
    if pref:
        pref.is_favorited = False
        pref.favorited_at = None
        db.commit()
    return {"success": True, "message": f"模型已取消收藏"}
