"""
数据验证模块
"""
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, validator


class StockCodeValidator:
    """股票代码验证"""
    
    @staticmethod
    def validate(code: str) -> bool:
        """验证股票代码格式"""
        if not code:
            return False
        
        # A股股票代码格式: 6位数字
        # 上海: 600xxx, 601xxx, 603xxx, 688xxx
        # 深圳: 000xxx, 001xxx, 002xxx, 300xxx
        if len(code) != 6:
            return False
        
        if not code.isdigit():
            return False
        
        # 基本格式验证
        first_three = code[:3]
        valid_prefixes = ['600', '601', '603', '688', '000', '001', '002', '300']
        
        return any(code.startswith(prefix) for prefix in valid_prefixes)


class DateRangeValidator:
    """日期范围验证"""
    
    @staticmethod
    def validate(start_date: Optional[str], end_date: Optional[str]) -> tuple[bool, Optional[str]]:
        """验证日期范围"""
        from datetime import datetime
        
        if not start_date or not end_date:
            return True, None
        
        try:
            start = datetime.strptime(start_date, '%Y-%m-%d')
            end = datetime.strptime(end_date, '%Y-%m-%d')
            
            if start > end:
                return False, "开始日期不能晚于结束日期"
            
            if (end - start).days > 3650:  # 10年
                return False, "日期范围不能超过10年"
            
            return True, None
        except ValueError:
            return False, "日期格式错误，请使用YYYY-MM-DD格式"


class ModelConfigValidator:
    """模型配置验证"""
    
    @staticmethod
    def validate_lstm_config(config: Dict[str, Any]) -> tuple[bool, Optional[str]]:
        """验证LSTM配置"""
        required_fields = ['hidden_size', 'num_layers', 'dropout', 'learning_rate', 'epochs', 'batch_size']
        
        for field in required_fields:
            if field not in config:
                return False, f"缺少必需字段: {field}"
        
        hidden_size = config.get('hidden_size', 0)
        num_layers = config.get('num_layers', 0)
        dropout = config.get('dropout', 0)
        learning_rate = config.get('learning_rate', 0)
        
        if not (1 <= hidden_size <= 512):
            return False, "hidden_size必须在1-512之间"
        
        if not (1 <= num_layers <= 5):
            return False, "num_layers必须在1-5之间"
        
        if not (0 <= dropout < 1):
            return False, "dropout必须在0-1之间"
        
        if not (0 < learning_rate <= 0.1):
            return False, "learning_rate必须在0-0.1之间"
        
        return True, None
    
    @staticmethod
    def validate_xgboost_config(config: Dict[str, Any]) -> tuple[bool, Optional[str]]:
        """验证XGBoost配置"""
        required_fields = ['n_estimators', 'max_depth', 'learning_rate']
        
        for field in required_fields:
            if field not in config:
                return False, f"缺少必需字段: {field}"
        
        n_estimators = config.get('n_estimators', 0)
        max_depth = config.get('max_depth', 0)
        
        if not (1 <= n_estimators <= 1000):
            return False, "n_estimators必须在1-1000之间"
        
        if not (1 <= max_depth <= 20):
            return False, "max_depth必须在1-20之间"
        
        return True, None


class FeatureValidator:
    """特征验证"""
    
    VALID_INDICATORS = [
        'sma_5', 'sma_10', 'sma_20', 'sma_60',
        'ema_5', 'ema_10', 'ema_20', 'ema_60',
        'macd', 'macd_signal', 'macd_hist',
        'rsi_6', 'rsi_12', 'rsi_24',
        'kdj_k', 'kdj_d', 'kdj_j',
        'boll_upper', 'boll_middle', 'boll_lower',
        'atr', 'obv', 'volume_sma'
    ]
    
    @staticmethod
    def validate_indicators(indicators: List[str]) -> tuple[bool, Optional[str]]:
        """验证指标列表"""
        if not indicators:
            return False, "必须选择至少一个指标"
        
        if len(indicators) > 20:
            return False, "最多只能选择20个指标"
        
        invalid_indicators = [ind for ind in indicators if ind not in FeatureValidator.VALID_INDICATORS]
        
        if invalid_indicators:
            return False, f"无效的指标: {', '.join(invalid_indicators)}"
        
        return True, None


class BacktestConfigValidator:
    """回测配置验证"""
    
    @staticmethod
    def validate(config: Dict[str, Any]) -> tuple[bool, Optional[str]]:
        """验证回测配置"""
        initial_capital = config.get('initial_capital', 0)
        commission_rate = config.get('commission_rate', 0)
        slippage = config.get('slippage', 0)
        
        if initial_capital < 10000:
            return False, "初始资金不能少于10000"
        
        if initial_capital > 100000000:
            return False, "初始资金不能超过1亿"
        
        if not (0 <= commission_rate <= 0.01):
            return False, "佣金率必须在0-1%之间"
        
        if not (0 <= slippage <= 0.05):
            return False, "滑点必须在0-5%之间"
        
        return True, None
