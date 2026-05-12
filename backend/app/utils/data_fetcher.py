"""
数据获取工具 - 多数据源自动降级

数据源优先级：
1. baostock - 免费、数据全、支持复权（需 TCP 10030 端口）
2. 腾讯财经 - HTTP API、支持前复权、含股票名称
3. 新浪财经 - HTTP API、数据较新、不支持复权

当高优先级数据源不可用时，自动降级到下一个数据源
"""
import json
import logging
from typing import Optional, List
from datetime import datetime, timedelta
from contextlib import contextmanager

import pandas as pd
import requests

logger = logging.getLogger(__name__)

HTTP_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://quote.eastmoney.com/',
}


def _to_baostock_code(code: str) -> str:
    """纯数字代码 -> baostock格式：sh.600519 / sz.000001"""
    code = code.strip().replace('.', '')
    if code.startswith('6'):
        return f'sh.{code}'
    elif code.startswith('0') or code.startswith('3'):
        return f'sz.{code}'
    elif code.startswith('8') or code.startswith('4'):
        return f'sh.{code}'
    return f'sh.{code}'


def _to_tencent_code(code: str) -> str:
    """纯数字代码 -> 腾讯财经格式：sh600519 / sz000001"""
    code = code.strip().replace('.', '')
    if code.startswith('6'):
        return f'sh{code}'
    elif code.startswith('0') or code.startswith('3'):
        return f'sz{code}'
    elif code.startswith('8') or code.startswith('4'):
        return f'sh{code}'
    return f'sh{code}'


def _to_sina_code(code: str) -> str:
    """纯数字代码 -> 新浪财经格式：sh600519 / sz000001"""
    return _to_tencent_code(code)


def _get_exchange(code: str) -> str:
    """根据纯数字代码判断交易所"""
    if code.startswith('6'):
        return 'SH'
    elif code.startswith('0') or code.startswith('3'):
        return 'SZ'
    elif code.startswith('8') or code.startswith('4'):
        return 'BJ'
    return 'Unknown'


# ============================================================
# 数据源1: baostock
# ============================================================

@contextmanager
def baostock_session():
    """baostock 会话上下文管理器"""
    import baostock as bs
    lg = bs.login()
    if lg.error_code != '0':
        raise Exception(f"baostock 登录失败: {lg.error_msg}")
    try:
        yield
    finally:
        bs.logout()


def _fetch_hist_baostock(code: str, start_date: str, end_date: str, adjust: str = "2") -> pd.DataFrame:
    """从 baostock 获取历史K线"""
    import baostock as bs
    bs_code = _to_baostock_code(code)
    fields = "date,code,open,high,low,close,preclose,volume,amount,turn,pctChg"

    with baostock_session():
        rs = bs.query_history_k_data_plus(
            bs_code, fields,
            start_date=start_date, end_date=end_date,
            frequency="d", adjustflag=adjust
        )
        if rs.error_code != '0':
            raise Exception(f"baostock 查询失败: {rs.error_msg}")

        data = []
        while rs.next():
            data.append(rs.get_row_data())

    if not data:
        return pd.DataFrame()

    df = pd.DataFrame(data, columns=rs.fields)
    numeric_cols = ['open', 'high', 'low', 'close', 'preclose', 'volume', 'amount', 'pctChg']
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce')
    return df


def _fetch_info_baostock(code: str) -> Optional[dict]:
    """从 baostock 获取股票基本信息"""
    import baostock as bs
    bs_code = _to_baostock_code(code)
    exchange = _get_exchange(code)

    try:
        with baostock_session():
            name = None
            rs = bs.query_stock_basic(code=bs_code)
            if rs.error_code == '0':
                while rs.next():
                    row = rs.get_row_data()
                    if len(row) >= 2:
                        name = row[1]
                    break

            industry = None
            rs_ind = bs.query_stock_industry(code=bs_code)
            if rs_ind.error_code == '0':
                while rs_ind.next():
                    row = rs_ind.get_row_data()
                    if len(row) >= 3:
                        industry = row[2]
                    break

        return {
            'code': code,
            'name': name or f'股票{code}',
            'exchange': exchange,
            'industry': industry,
        }
    except Exception:
        return None


# ============================================================
# 数据源2: 腾讯财经
# ============================================================

def _fetch_hist_tencent(code: str, start_date: str, end_date: str) -> pd.DataFrame:
    """从腾讯财经获取前复权日K线

    腾讯API参数格式: param=代码,周期,开始日期,结束日期,数量,复权类型
    注意: 指定结束日期时可能返回空数据，因此使用数量限制代替结束日期
    返回字段: [日期, 开盘, 收盘, 最高, 最低, 成交量]
    """
    tencent_code = _to_tencent_code(code)
    url = f'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param={tencent_code},day,{start_date},,10000,qfq'

    resp = requests.get(url, headers=HTTP_HEADERS, timeout=15)
    resp.raise_for_status()
    data = json.loads(resp.text)

    if data.get('code') != 0:
        raise Exception(f"腾讯财经API返回错误: {data.get('msg', 'unknown')}")

    raw_data = data.get('data')
    if not isinstance(raw_data, dict):
        return pd.DataFrame()

    stock_data = raw_data.get(tencent_code, {})
    if not isinstance(stock_data, dict):
        return pd.DataFrame()

    klines = stock_data.get('qfqday', [])
    if not klines:
        klines = stock_data.get('day', [])
    if not klines:
        return pd.DataFrame()

    # 腾讯返回: [日期, 开盘, 收盘, 最高, 最低, 成交量]
    end_dt = datetime.strptime(end_date, '%Y-%m-%d')
    records = []
    for k in klines:
        try:
            k_date = datetime.strptime(k[0], '%Y-%m-%d')
            if k_date > end_dt:
                continue
        except (ValueError, IndexError):
            continue

        records.append({
            'date': k[0],
            'open': float(k[1]) if k[1] else None,
            'close': float(k[2]) if k[2] else None,
            'high': float(k[3]) if k[3] else None,
            'low': float(k[4]) if k[4] else None,
            'volume': int(float(k[5])) if k[5] else None,
        })

    if not records:
        return pd.DataFrame()

    df = pd.DataFrame(records)

    # 计算涨跌幅
    if 'close' in df.columns and len(df) > 0:
        df['preclose'] = df['close'].shift(1)
        df['change_pct'] = ((df['close'] - df['preclose']) / df['preclose'] * 100).round(4)
        df.loc[df.index[0], 'change_pct'] = None

    return df


def _fetch_info_tencent(code: str) -> Optional[dict]:
    """从腾讯财经获取股票名称（通过实时行情接口）"""
    tencent_code = _to_tencent_code(code)
    exchange = _get_exchange(code)

    try:
        url = f'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param={tencent_code},day,,,1,qfq'
        resp = requests.get(url, headers=HTTP_HEADERS, timeout=10)
        data = json.loads(resp.text)

        if data.get('code') != 0:
            return None

        raw_data = data.get('data')
        if not isinstance(raw_data, dict):
            return None

        stock_data = raw_data.get(tencent_code, {})
        if not isinstance(stock_data, dict):
            return None

        qt = stock_data.get('qt', {}).get(tencent_code, [])

        name = None
        if len(qt) >= 2:
            name = qt[1]

        return {
            'code': code,
            'name': name or f'股票{code}',
            'exchange': exchange,
            'industry': None,
        }
    except Exception:
        return None


# ============================================================
# 数据源3: 新浪财经
# ============================================================

def _fetch_hist_sina(code: str, start_date: str, end_date: str) -> pd.DataFrame:
    """从新浪财经获取日K线（不支持复权）

    返回字段: date, open, high, low, close, volume
    """
    sina_code = _to_sina_code(code)
    url = f'https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol={sina_code}&scale=240&ma=no&datalen=1000'

    resp = requests.get(url, headers=HTTP_HEADERS, timeout=15)
    resp.raise_for_status()

    data = json.loads(resp.text)
    if not data:
        return pd.DataFrame()

    start_dt = datetime.strptime(start_date, '%Y-%m-%d')
    end_dt = datetime.strptime(end_date, '%Y-%m-%d')

    records = []
    for item in data:
        day = datetime.strptime(item['day'], '%Y-%m-%d')
        if start_dt <= day <= end_dt:
            records.append({
                'date': item['day'],
                'open': float(item['open']) if item['open'] else None,
                'high': float(item['high']) if item['high'] else None,
                'low': float(item['low']) if item['low'] else None,
                'close': float(item['close']) if item['close'] else None,
                'volume': int(float(item['volume'])) if item['volume'] else None,
            })

    df = pd.DataFrame(records)

    if 'close' in df.columns and len(df) > 0:
        df['preclose'] = df['close'].shift(1)
        df['change_pct'] = ((df['close'] - df['preclose']) / df['preclose'] * 100).round(4)
        df.loc[df.index[0], 'change_pct'] = None

    return df


# ============================================================
# 统一接口：自动降级
# ============================================================

class DataFetcher:
    """数据获取器 - 多数据源自动降级"""

    # 数据源列表，按优先级排序
    _HIST_SOURCES = [
        ('baostock', _fetch_hist_baostock),
        ('tencent', _fetch_hist_tencent),
        ('sina', _fetch_hist_sina),
    ]

    _INFO_SOURCES = [
        ('baostock', _fetch_info_baostock),
        ('tencent', _fetch_info_tencent),
    ]

    @staticmethod
    def get_stock_hist(
        code: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        adjust: str = "2"
    ) -> pd.DataFrame:
        """获取股票历史K线数据，自动降级

        Args:
            code: 纯数字股票代码，如 000001
            start_date: 开始日期 (YYYY-MM-DD)
            end_date: 结束日期 (YYYY-MM-DD)
            adjust: 复权类型 '2'-前复权, '1'-后复权, '3'-不复权

        Returns:
            DataFrame，字段: date, open, high, low, close, volume, change_pct
        """
        if not end_date:
            end_date = datetime.now().strftime("%Y-%m-%d")
        if not start_date:
            start_date = (datetime.now() - timedelta(days=1095)).strftime("%Y-%m-%d")

        # 统一日期格式为 YYYY-MM-DD
        start_date = _normalize_date(start_date)
        end_date = _normalize_date(end_date)

        last_error = None
        for source_name, fetch_fn in DataFetcher._HIST_SOURCES:
            try:
                if source_name == 'baostock':
                    df = fetch_fn(code, start_date, end_date, adjust)
                else:
                    df = fetch_fn(code, start_date, end_date)

                if df is not None and not df.empty:
                    logger.info(f"股票 {code} 历史数据从 {source_name} 获取成功，{len(df)} 条")
                    return _normalize_hist_df(df)

                logger.warning(f"股票 {code} 从 {source_name} 获取到空数据，尝试下一个数据源")
            except Exception as e:
                last_error = e
                logger.warning(f"股票 {code} 从 {source_name} 获取失败: {e}，尝试下一个数据源")
                continue

        if last_error:
            raise Exception(f"所有数据源均获取失败，最后错误: {last_error}")
        return pd.DataFrame()

    @staticmethod
    def get_stock_info(code: str) -> Optional[dict]:
        """获取股票基本信息，自动降级"""
        exchange = _get_exchange(code)

        for source_name, fetch_fn in DataFetcher._INFO_SOURCES:
            try:
                info = fetch_fn(code)
                if info and info.get('name') and not info['name'].startswith('股票'):
                    logger.info(f"股票 {code} 信息从 {source_name} 获取成功")
                    return info
                logger.warning(f"股票 {code} 信息从 {source_name} 获取不完整，尝试下一个数据源")
            except Exception as e:
                logger.warning(f"股票 {code} 信息从 {source_name} 获取失败: {e}，尝试下一个数据源")
                continue

        return {
            'code': code,
            'name': f'股票{code}',
            'exchange': exchange,
            'industry': None,
        }


def _normalize_date(date_str: str) -> str:
    """统一日期格式为 YYYY-MM-DD"""
    clean = date_str.replace("-", "")
    if len(clean) == 8:
        return f"{clean[:4]}-{clean[4:6]}-{clean[6:8]}"
    return date_str


def _normalize_hist_df(df: pd.DataFrame) -> pd.DataFrame:
    """统一历史数据 DataFrame 的列名和格式"""
    col_map = {
        'pctChg': 'change_pct',
        'preclose': 'preclose',
    }
    df = df.rename(columns=col_map)

    required_cols = ['date', 'open', 'high', 'low', 'close', 'volume']
    for col in required_cols:
        if col not in df.columns:
            df[col] = None

    if 'change_pct' not in df.columns:
        if 'close' in df.columns and len(df) > 1:
            df['preclose'] = df['close'].shift(1)
            df['change_pct'] = ((df['close'] - df['preclose']) / df['preclose'] * 100).round(4)
            df.loc[df.index[0], 'change_pct'] = None
        else:
            df['change_pct'] = None

    return df
