"""
特征工程API
"""
import math
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from pydantic import BaseModel

from app.core.database import get_db
from app.services.feature_service import FeatureService

router = APIRouter()


# ============ 请求/响应模型 ============

class IndicatorInfo(BaseModel):
    key: str
    name: str
    description: str
    category: str
    params: List[Dict[str, Any]]


class CalculateFeaturesRequest(BaseModel):
    stock_code: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    indicators: List[str]  # 要计算的指标列表
    indicator_params: Optional[Dict[str, Dict[str, Any]]] = None  # 指标参数


class CalculateFeaturesResponse(BaseModel):
    success: bool
    message: str
    data: Optional[List[Dict[str, Any]]] = None
    columns: Optional[List[str]] = None


class FeaturePreviewRequest(BaseModel):
    stock_code: str
    indicators: List[str]
    indicator_params: Optional[Dict[str, Dict[str, Any]]] = None
    limit: int = 100


# ============ API端点 ============

@router.get("/indicators", response_model=List[IndicatorInfo])
async def get_available_indicators():
    """获取所有可用的技术指标"""
    service = FeatureService()
    indicators = service.get_available_indicators()
    return indicators


@router.get("/indicators/{name}")
async def get_indicator_detail(name: str):
    """获取特定指标的详细信息"""
    service = FeatureService()
    indicator = service.get_indicator_detail(name)
    if not indicator:
        raise HTTPException(status_code=404, detail=f"指标 {name} 不存在")
    return indicator


@router.post("/calculate", response_model=CalculateFeaturesResponse)
async def calculate_features(
    request: CalculateFeaturesRequest,
    db: Session = Depends(get_db)
):
    """计算指定股票的技术指标特征"""
    service = FeatureService(db)
    try:
        df = service.calculate_features(
            stock_code=request.stock_code,
            indicators=request.indicators,
            indicator_params=request.indicator_params,
            start_date=request.start_date,
            end_date=request.end_date
        )

        if df is None or df.empty:
            return CalculateFeaturesResponse(
                success=False,
                message=f"股票 {request.stock_code} 没有数据，请先在数据管理页面获取该股票的历史数据",
                data=None,
                columns=None
            )

        data = _df_to_json_safe(df)

        return CalculateFeaturesResponse(
            success=True,
            message=f"成功计算 {len(df)} 条数据的特征",
            data=data,
            columns=list(df.columns)
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        return CalculateFeaturesResponse(
            success=False,
            message=f"计算失败: {str(e)}",
            data=None,
            columns=None
        )


def _safe_float(val):
    """将值转为JSON安全的float，处理NaN/Inf"""
    if val is None:
        return None
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return None
        return round(f, 6)
    except (ValueError, TypeError):
        return None


def _df_to_json_safe(df):
    """将DataFrame转为JSON安全的字典列表，处理NaN/Inf/Timestamp"""
    data = df.reset_index().to_dict('records')
    for item in data:
        for key in list(item.keys()):
            val = item[key]
            if key == 'date':
                item[key] = str(val)[:10] if val is not None else None
            elif isinstance(val, float):
                if math.isnan(val) or math.isinf(val):
                    item[key] = None
                else:
                    item[key] = round(val, 6)
            elif hasattr(val, 'item'):
                item[key] = val.item()
    return data


@router.post("/preview")
async def preview_features(
    request: FeaturePreviewRequest,
    db: Session = Depends(get_db)
):
    """预览特征计算结果（前N条）"""
    service = FeatureService(db)
    try:
        df = service.calculate_features(
            stock_code=request.stock_code,
            indicators=request.indicators,
            indicator_params=request.indicator_params,
            limit=request.limit
        )

        if df is None or df.empty:
            return {
                "success": False,
                "message": f"股票 {request.stock_code} 没有数据，请先在数据管理页面获取该股票的历史数据",
                "preview": None
            }

        preview_df = df.head(request.limit)

        stats = {}
        for col in preview_df.columns:
            if preview_df[col].dtype in ['float64', 'int64', 'int32']:
                col_mean = _safe_float(preview_df[col].mean())
                col_std = _safe_float(preview_df[col].std())
                col_min = _safe_float(preview_df[col].min())
                col_max = _safe_float(preview_df[col].max())
                null_count = int(preview_df[col].isnull().sum())
                if col_mean is not None:
                    stats[col] = {
                        "mean": col_mean,
                        "std": col_std,
                        "min": col_min,
                        "max": col_max,
                        "null_count": null_count
                    }

        data = _df_to_json_safe(preview_df)

        date_range = None
        if 'date' in preview_df.columns:
            date_range = {
                "start": str(preview_df.index.min())[:10],
                "end": str(preview_df.index.max())[:10]
            }

        return {
            "success": True,
            "message": f"预览前 {len(preview_df)} 条数据",
            "preview": {
                "data": data,
                "columns": list(preview_df.columns),
                "stats": stats,
                "row_count": len(preview_df),
                "date_range": date_range
            }
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "message": f"预览失败: {str(e)}",
            "preview": None
        }


@router.get("/categories")
async def get_indicator_categories():
    """获取指标分类列表"""
    service = FeatureService()
    categories = service.get_indicator_categories()
    return {"categories": categories}
