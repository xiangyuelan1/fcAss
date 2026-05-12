"""
技术指标计算工具
"""
import pandas as pd
import numpy as np
from typing import Optional


def calculate_sma(data: pd.Series, period: int = 20) -> pd.Series:
    """计算简单移动平均线"""
    return data.rolling(window=period).mean()


def calculate_ema(data: pd.Series, period: int = 20) -> pd.Series:
    """计算指数移动平均线"""
    return data.ewm(span=period, adjust=False).mean()


def calculate_macd(
    data: pd.Series,
    fast: int = 12,
    slow: int = 26,
    signal: int = 9
) -> tuple:
    """计算MACD指标"""
    ema_fast = data.ewm(span=fast, adjust=False).mean()
    ema_slow = data.ewm(span=slow, adjust=False).mean()
    macd = ema_fast - ema_slow
    signal_line = macd.ewm(span=signal, adjust=False).mean()
    histogram = macd - signal_line
    return macd, signal_line, histogram


def calculate_rsi(data: pd.Series, period: int = 14) -> pd.Series:
    """计算RSI指标"""
    delta = data.diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
    rs = gain / loss
    return 100 - (100 / (1 + rs))


def calculate_kdj(
    high: pd.Series,
    low: pd.Series,
    close: pd.Series,
    n: int = 9,
    m1: int = 3,
    m2: int = 3
) -> tuple:
    """计算KDJ指标"""
    low_list = low.rolling(window=n, min_periods=n).min()
    high_list = high.rolling(window=n, min_periods=n).max()
    rsv = (close - low_list) / (high_list - low_list) * 100
    k = rsv.ewm(com=m1-1, adjust=False).mean()
    d = k.ewm(com=m2-1, adjust=False).mean()
    j = 3 * k - 2 * d
    return k, d, j


def calculate_bollinger(
    data: pd.Series,
    period: int = 20,
    std_dev: float = 2.0
) -> tuple:
    """计算布林带"""
    middle = data.rolling(window=period).mean()
    std = data.rolling(window=period).std()
    upper = middle + (std * std_dev)
    lower = middle - (std * std_dev)
    return upper, middle, lower


def calculate_atr(
    high: pd.Series,
    low: pd.Series,
    close: pd.Series,
    period: int = 14
) -> pd.Series:
    """计算ATR指标"""
    high_low = high - low
    high_close = np.abs(high - close.shift())
    low_close = np.abs(low - close.shift())
    tr = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
    return tr.rolling(window=period).mean()


def calculate_obv(close: pd.Series, volume: pd.Series) -> pd.Series:
    """计算OBV指标"""
    obv = [0]
    for i in range(1, len(close)):
        if close.iloc[i] > close.iloc[i-1]:
            obv.append(obv[-1] + volume.iloc[i])
        elif close.iloc[i] < close.iloc[i-1]:
            obv.append(obv[-1] - volume.iloc[i])
        else:
            obv.append(obv[-1])
    return pd.Series(obv, index=close.index)


def calculate_cci(
    high: pd.Series,
    low: pd.Series,
    close: pd.Series,
    period: int = 20
) -> pd.Series:
    """计算CCI指标"""
    tp = (high + low + close) / 3
    sma_tp = tp.rolling(window=period).mean()
    mean_dev = tp.rolling(window=period).apply(lambda x: np.fabs(x - x.mean()).mean())
    return (tp - sma_tp) / (0.015 * mean_dev)


def calculate_returns(data: pd.Series, period: int = 1) -> pd.Series:
    """计算收益率"""
    return data.pct_change(periods=period)


def calculate_volatility(data: pd.Series, period: int = 20) -> pd.Series:
    """计算波动率"""
    return data.pct_change().rolling(window=period).std() * np.sqrt(252)
