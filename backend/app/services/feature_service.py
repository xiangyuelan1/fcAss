"""
特征工程服务 - 负责技术指标计算和特征处理
"""
import pandas as pd
import numpy as np
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional

from app.models.stock import StockPrice


class FeatureService:
    """特征工程服务类"""
    
    # 可用的技术指标定义
    INDICATORS = {
        # 趋势指标
        'sma': {
            'name': 'SMA',
            'description': '简单移动平均线',
            'category': '趋势',
            'params': [{'name': 'period', 'type': 'int', 'default': 20, 'min': 1, 'max': 500}]
        },
        'ema': {
            'name': 'EMA',
            'description': '指数移动平均线',
            'category': '趋势',
            'params': [{'name': 'period', 'type': 'int', 'default': 20, 'min': 1, 'max': 500}]
        },
        'macd': {
            'name': 'MACD',
            'description': '指数平滑异同平均线',
            'category': '趋势',
            'params': [
                {'name': 'fast', 'type': 'int', 'default': 12, 'min': 1, 'max': 100},
                {'name': 'slow', 'type': 'int', 'default': 26, 'min': 1, 'max': 200},
                {'name': 'signal', 'type': 'int', 'default': 9, 'min': 1, 'max': 50}
            ]
        },
        
        # 震荡指标
        'rsi': {
            'name': 'RSI',
            'description': '相对强弱指标',
            'category': '震荡',
            'params': [{'name': 'period', 'type': 'int', 'default': 14, 'min': 1, 'max': 100}]
        },
        'kdj': {
            'name': 'KDJ',
            'description': '随机指标',
            'category': '震荡',
            'params': [
                {'name': 'n', 'type': 'int', 'default': 9, 'min': 1, 'max': 100},
                {'name': 'm1', 'type': 'int', 'default': 3, 'min': 1, 'max': 50},
                {'name': 'm2', 'type': 'int', 'default': 3, 'min': 1, 'max': 50}
            ]
        },
        'cci': {
            'name': 'CCI',
            'description': '顺势指标',
            'category': '震荡',
            'params': [{'name': 'period', 'type': 'int', 'default': 20, 'min': 1, 'max': 100}]
        },
        
        # 波动指标
        'boll': {
            'name': 'BOLL',
            'description': '布林带',
            'category': '波动',
            'params': [
                {'name': 'period', 'type': 'int', 'default': 20, 'min': 1, 'max': 100},
                {'name': 'std_dev', 'type': 'float', 'default': 2.0, 'min': 0.1, 'max': 5.0}
            ]
        },
        'atr': {
            'name': 'ATR',
            'description': '平均真实波幅',
            'category': '波动',
            'params': [{'name': 'period', 'type': 'int', 'default': 14, 'min': 1, 'max': 100}]
        },
        
        # 成交量指标
        'volume_sma': {
            'name': 'Volume_SMA',
            'description': '成交量均线',
            'category': '成交量',
            'params': [{'name': 'period', 'type': 'int', 'default': 20, 'min': 1, 'max': 500}]
        },
        'obv': {
            'name': 'OBV',
            'description': '能量潮',
            'category': '成交量',
            'params': []
        },
        
        # 价格特征
        'returns': {
            'name': 'Returns',
            'description': '收益率',
            'category': '价格',
            'params': [{'name': 'period', 'type': 'int', 'default': 1, 'min': 1, 'max': 100}]
        },
        'volatility': {
            'name': 'Volatility',
            'description': '波动率',
            'category': '价格',
            'params': [{'name': 'period', 'type': 'int', 'default': 20, 'min': 1, 'max': 100}]
        }
    }
    
    def __init__(self, db: Session = None):
        self.db = db
    
    def get_available_indicators(self) -> List[Dict[str, Any]]:
        """获取所有可用的技术指标"""
        indicators = []
        for key, value in self.INDICATORS.items():
            indicator = {
                'key': key,
                'name': value['name'],
                'description': value['description'],
                'category': value['category'],
                'params': value['params']
            }
            indicators.append(indicator)
        return indicators
    
    def get_indicator_detail(self, name: str) -> Optional[Dict[str, Any]]:
        """获取特定指标的详细信息"""
        if name not in self.INDICATORS:
            return None
        
        indicator = self.INDICATORS[name].copy()
        indicator['key'] = name
        return indicator
    
    def get_indicator_categories(self) -> List[str]:
        """获取指标分类列表"""
        categories = set()
        for indicator in self.INDICATORS.values():
            categories.add(indicator['category'])
        return sorted(list(categories))
    
    def calculate_features(
        self,
        stock_code: str,
        indicators: List[str],
        indicator_params: Optional[Dict[str, Dict[str, Any]]] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        limit: int = 1000
    ) -> Optional[pd.DataFrame]:
        """计算指定股票的技术指标特征"""
        
        # 从数据库获取价格数据
        query = self.db.query(StockPrice).filter(StockPrice.stock_code == stock_code)
        
        if start_date:
            query = query.filter(StockPrice.date >= start_date)
        if end_date:
            query = query.filter(StockPrice.date <= end_date)
        
        prices = query.order_by(StockPrice.date).limit(limit).all()
        
        if not prices:
            return None
        
        # 转换为DataFrame
        data = [p.to_dict() for p in prices]
        df = pd.DataFrame(data)
        df['date'] = pd.to_datetime(df['date'])
        df.set_index('date', inplace=True)
        df = df.sort_index()
        
        # 计算指标
        params = indicator_params or {}
        
        for indicator in indicators:
            if indicator in self.INDICATORS:
                indicator_config = self.INDICATORS[indicator]
                indicator_params_config = params.get(indicator, {})
                
                # 获取参数值
                calc_params = {}
                for param in indicator_config['params']:
                    param_name = param['name']
                    calc_params[param_name] = indicator_params_config.get(param_name, param['default'])
                
                # 计算指标
                df = self._calculate_indicator(df, indicator, calc_params)
        
        return df
    
    def _calculate_indicator(
        self,
        df: pd.DataFrame,
        indicator: str,
        params: Dict[str, Any]
    ) -> pd.DataFrame:
        """计算单个指标"""
        
        if indicator == 'sma':
            period = params.get('period', 20)
            df[f'SMA_{period}'] = df['close'].rolling(window=period).mean()
        
        elif indicator == 'ema':
            period = params.get('period', 20)
            df[f'EMA_{period}'] = df['close'].ewm(span=period, adjust=False).mean()
        
        elif indicator == 'macd':
            fast = params.get('fast', 12)
            slow = params.get('slow', 26)
            signal = params.get('signal', 9)
            
            ema_fast = df['close'].ewm(span=fast, adjust=False).mean()
            ema_slow = df['close'].ewm(span=slow, adjust=False).mean()
            df['MACD'] = ema_fast - ema_slow
            df['MACD_Signal'] = df['MACD'].ewm(span=signal, adjust=False).mean()
            df['MACD_Hist'] = df['MACD'] - df['MACD_Signal']
        
        elif indicator == 'rsi':
            period = params.get('period', 14)
            delta = df['close'].diff()
            gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
            loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
            rs = gain / loss
            df[f'RSI_{period}'] = 100 - (100 / (1 + rs))
        
        elif indicator == 'kdj':
            n = params.get('n', 9)
            m1 = params.get('m1', 3)
            m2 = params.get('m2', 3)
            
            low_list = df['low'].rolling(window=n, min_periods=n).min()
            high_list = df['high'].rolling(window=n, min_periods=n).max()
            rsv = (df['close'] - low_list) / (high_list - low_list) * 100
            df['K'] = rsv.ewm(com=m1-1, adjust=False).mean()
            df['D'] = df['K'].ewm(com=m2-1, adjust=False).mean()
            df['J'] = 3 * df['K'] - 2 * df['D']
        
        elif indicator == 'cci':
            period = params.get('period', 20)
            tp = (df['high'] + df['low'] + df['close']) / 3
            sma_tp = tp.rolling(window=period).mean()
            mean_dev = tp.rolling(window=period).apply(lambda x: np.fabs(x - x.mean()).mean())
            df[f'CCI_{period}'] = (tp - sma_tp) / (0.015 * mean_dev)
        
        elif indicator == 'boll':
            period = params.get('period', 20)
            std_dev = params.get('std_dev', 2.0)
            
            df['BOLL_MID'] = df['close'].rolling(window=period).mean()
            std = df['close'].rolling(window=period).std()
            df['BOLL_UP'] = df['BOLL_MID'] + (std * std_dev)
            df['BOLL_DOWN'] = df['BOLL_MID'] - (std * std_dev)
        
        elif indicator == 'atr':
            period = params.get('period', 14)
            high_low = df['high'] - df['low']
            high_close = np.abs(df['high'] - df['close'].shift())
            low_close = np.abs(df['low'] - df['close'].shift())
            tr = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
            df[f'ATR_{period}'] = tr.rolling(window=period).mean()
        
        elif indicator == 'volume_sma':
            period = params.get('period', 20)
            df[f'Volume_SMA_{period}'] = df['volume'].rolling(window=period).mean()
        
        elif indicator == 'obv':
            obv = [0]
            for i in range(1, len(df)):
                if df['close'].iloc[i] > df['close'].iloc[i-1]:
                    obv.append(obv[-1] + df['volume'].iloc[i])
                elif df['close'].iloc[i] < df['close'].iloc[i-1]:
                    obv.append(obv[-1] - df['volume'].iloc[i])
                else:
                    obv.append(obv[-1])
            df['OBV'] = obv
        
        elif indicator == 'returns':
            period = params.get('period', 1)
            df[f'Returns_{period}d'] = df['close'].pct_change(periods=period)
        
        elif indicator == 'volatility':
            period = params.get('period', 20)
            df[f'Volatility_{period}d'] = df['close'].pct_change().rolling(window=period).std() * np.sqrt(252)
        
        return df
    
    def normalize_features(
        self,
        df: pd.DataFrame,
        columns: List[str],
        method: str = 'standard'
    ) -> pd.DataFrame:
        """特征标准化/归一化"""
        df_norm = df.copy()
        
        for col in columns:
            if col not in df.columns:
                continue
            
            if method == 'standard':
                # Z-score标准化
                mean = df[col].mean()
                std = df[col].std()
                df_norm[col] = (df[col] - mean) / std
            
            elif method == 'minmax':
                # Min-Max归一化
                min_val = df[col].min()
                max_val = df[col].max()
                df_norm[col] = (df[col] - min_val) / (max_val - min_val)
            
            elif method == 'robust':
                # Robust标准化
                median = df[col].median()
                iqr = df[col].quantile(0.75) - df[col].quantile(0.25)
                df_norm[col] = (df[col] - median) / iqr
        
        return df_norm
