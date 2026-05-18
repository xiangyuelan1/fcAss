"""
数据服务 - 负责A股数据的获取和管理

支持多数据源自动降级（baostock -> 腾讯财经 -> 新浪财经）
按股票代码直接获取数据，无需先同步全量列表
"""
import math
from datetime import datetime, date as date_type
from sqlalchemy.orm import Session
from typing import List, Optional

from app.models.stock import Stock, StockPrice
from app.utils.data_fetcher import DataFetcher, _get_exchange


class DataService:
    """数据服务类"""

    def __init__(self, db: Session = None):
        self.db = db

    def _ensure_stock_exists(self, code: str) -> Stock:
        """确保股票记录存在，不存在则从数据源获取信息并创建"""
        stock = self.db.query(Stock).filter(Stock.code == code).first()
        if stock:
            return stock

        info = DataFetcher.get_stock_info(code)
        stock = Stock(
            code=code,
            name=info['name'] if info else f'股票{code}',
            exchange=info['exchange'] if info else _get_exchange(code),
            industry=info.get('industry') if info else None,
        )
        self.db.add(stock)
        self.db.commit()
        return stock

    def fetch_stock_data(
        self,
        code: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> dict:
        """按股票代码获取数据：自动创建股票记录 + 同步历史价格

        Returns:
            dict: {stock: Stock, price_count: int}
        """
        stock = self._ensure_stock_exists(code)
        price_count = self._sync_prices(code, start_date, end_date)

        # 如果名称是回退值，尝试重新获取更新
        if stock.name.startswith('股票') and price_count > 0:
            self._try_update_stock_name(stock)

        return {'stock': stock, 'price_count': price_count}

    def fetch_stock_data_with_progress(
        self,
        code: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        progress_callback=None
    ) -> dict:
        """带进度回调的获取股票数据

        Args:
            progress_callback: 回调函数 (stage, progress, message, data=None)
        """
        def _notify(stage, progress, message, **data):
            if progress_callback:
                progress_callback(stage, progress, message, **data)

        _notify('init', 5, f'正在初始化股票 {code}...')

        stock = self._ensure_stock_exists(code)
        _notify('info', 15, f'已获取股票信息: {stock.name}({code})', stock_name=stock.name)

        _notify('fetch', 25, f'正在从数据源获取 {stock.name} 的历史数据...')
        price_count = self._sync_prices_with_progress(code, start_date, end_date, progress_callback)

        if stock.name.startswith('股票') and price_count > 0:
            _notify('update', 90, '正在更新股票名称...')
            self._try_update_stock_name(stock)

        return {'stock': stock, 'price_count': price_count}

    def _sync_prices(
        self,
        code: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> int:
        """从数据源同步历史价格数据到数据库（自动降级）

        Returns:
            受影响的总行数（新增 + 更新）
        """
        try:
            df = DataFetcher.get_stock_hist(code, start_date, end_date, adjust="2")
            if df.empty:
                return 0

            affected = 0
            for _, row in df.iterrows():
                date_str = str(row['date'])

                # 将字符串日期转换为 Python date 对象（SQLite Date 类型要求）
                try:
                    if isinstance(row['date'], str):
                        parsed_date = datetime.strptime(date_str, '%Y-%m-%d').date()
                    elif isinstance(row['date'], date_type):
                        parsed_date = row['date']
                    else:
                        parsed_date = datetime.strptime(date_str, '%Y-%m-%d').date()
                except (ValueError, TypeError):
                    continue

                existing = self.db.query(StockPrice).filter(
                    StockPrice.stock_code == code,
                    StockPrice.date == parsed_date
                ).first()

                close_val = row['close'] if row.get('close') and not math.isnan(row.get('close', 0)) else None
                preclose_val = row.get('preclose')
                if preclose_val is not None and (isinstance(preclose_val, float) and math.isnan(preclose_val)):
                    preclose_val = None
                change_pct = row.get('change_pct')
                if change_pct is not None and (isinstance(change_pct, float) and math.isnan(change_pct)):
                    change_pct = None

                volume_val = row.get('volume')
                if volume_val is not None and (isinstance(volume_val, float) and math.isnan(volume_val)):
                    volume_val = None
                elif volume_val is not None:
                    volume_val = int(volume_val)

                amount_val = row.get('amount')
                if amount_val is not None and (isinstance(amount_val, float) and math.isnan(amount_val)):
                    amount_val = None

                open_val = row.get('open')
                if open_val is not None and (isinstance(open_val, float) and math.isnan(open_val)):
                    open_val = None
                high_val = row.get('high')
                if high_val is not None and (isinstance(high_val, float) and math.isnan(high_val)):
                    high_val = None
                low_val = row.get('low')
                if low_val is not None and (isinstance(low_val, float) and math.isnan(low_val)):
                    low_val = None

                if existing:
                    existing.open = open_val
                    existing.high = high_val
                    existing.low = low_val
                    existing.close = close_val
                    existing.volume = volume_val
                    existing.amount = amount_val
                    existing.change_pct = change_pct
                    existing.change_amount = (close_val - preclose_val) if (close_val and preclose_val) else None
                    existing.adj_close = close_val
                    affected += 1
                else:
                    price = StockPrice(
                        stock_code=code,
                        date=parsed_date,
                        open=open_val,
                        high=high_val,
                        low=low_val,
                        close=close_val,
                        volume=volume_val,
                        amount=amount_val,
                        change_pct=change_pct,
                        change_amount=(close_val - preclose_val) if (close_val and preclose_val) else None,
                        adj_close=close_val,
                    )
                    self.db.add(price)
                    affected += 1

                if affected % 100 == 0:
                    self.db.commit()

            self.db.commit()
            return affected

        except Exception as e:
            self.db.rollback()
            raise Exception(f"同步股票 {code} 价格数据失败: {str(e)}")

    def _sync_prices_with_progress(
        self,
        code: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        progress_callback=None
    ) -> int:
        """带进度回调的同步历史价格数据"""
        try:
            df = DataFetcher.get_stock_hist(code, start_date, end_date, adjust="2")
            if df.empty:
                if progress_callback:
                    progress_callback('fetch', 80, '数据源返回空数据', total=0)
                return 0

            total = len(df)
            if progress_callback:
                progress_callback('fetch', 40, f'获取到 {total} 条原始数据，正在写入数据库...', total=total)

            affected = 0
            for idx, (_, row) in enumerate(df.iterrows()):
                date_str = str(row['date'])

                try:
                    if isinstance(row['date'], str):
                        parsed_date = datetime.strptime(date_str, '%Y-%m-%d').date()
                    elif isinstance(row['date'], date_type):
                        parsed_date = row['date']
                    else:
                        parsed_date = datetime.strptime(date_str, '%Y-%m-%d').date()
                except (ValueError, TypeError):
                    continue

                existing = self.db.query(StockPrice).filter(
                    StockPrice.stock_code == code,
                    StockPrice.date == parsed_date
                ).first()

                close_val = row['close'] if row.get('close') and not math.isnan(row.get('close', 0)) else None
                preclose_val = row.get('preclose')
                if preclose_val is not None and (isinstance(preclose_val, float) and math.isnan(preclose_val)):
                    preclose_val = None
                change_pct = row.get('change_pct')
                if change_pct is not None and (isinstance(change_pct, float) and math.isnan(change_pct)):
                    change_pct = None

                volume_val = row.get('volume')
                if volume_val is not None and (isinstance(volume_val, float) and math.isnan(volume_val)):
                    volume_val = None
                elif volume_val is not None:
                    volume_val = int(volume_val)

                amount_val = row.get('amount')
                if amount_val is not None and (isinstance(amount_val, float) and math.isnan(amount_val)):
                    amount_val = None

                open_val = row.get('open')
                if open_val is not None and (isinstance(open_val, float) and math.isnan(open_val)):
                    open_val = None
                high_val = row.get('high')
                if high_val is not None and (isinstance(high_val, float) and math.isnan(high_val)):
                    high_val = None
                low_val = row.get('low')
                if low_val is not None and (isinstance(low_val, float) and math.isnan(low_val)):
                    low_val = None

                if existing:
                    existing.open = open_val
                    existing.high = high_val
                    existing.low = low_val
                    existing.close = close_val
                    existing.volume = volume_val
                    existing.amount = amount_val
                    existing.change_pct = change_pct
                    existing.change_amount = (close_val - preclose_val) if (close_val and preclose_val) else None
                    existing.adj_close = close_val
                else:
                    price = StockPrice(
                        stock_code=code,
                        date=parsed_date,
                        open=open_val,
                        high=high_val,
                        low=low_val,
                        close=close_val,
                        volume=volume_val,
                        amount=amount_val,
                        change_pct=change_pct,
                        change_amount=(close_val - preclose_val) if (close_val and preclose_val) else None,
                        adj_close=close_val,
                    )
                    self.db.add(price)
                affected += 1

                if affected % 100 == 0:
                    self.db.commit()

                # 每50条推送一次进度
                if progress_callback and (idx + 1) % 50 == 0:
                    pct = int(40 + (idx + 1) / total * 50)
                    progress_callback('sync', pct, f'正在写入数据 {idx+1}/{total}...', current=idx+1, total=total)

            self.db.commit()

            if progress_callback:
                progress_callback('sync', 90, f'数据写入完成，共 {affected} 条', total=affected)

            return affected

        except Exception as e:
            self.db.rollback()
            raise Exception(f"同步股票 {code} 价格数据失败: {str(e)}")

    def _try_update_stock_name(self, stock: Stock):
        """尝试重新获取股票名称并更新（当名称是回退值时）"""
        try:
            info = DataFetcher.get_stock_info(stock.code)
            if info and info['name'] and not info['name'].startswith('股票'):
                stock.name = info['name']
                if info.get('industry'):
                    stock.industry = info['industry']
                self.db.commit()
        except Exception:
            pass

    def sync_stock_prices(
        self,
        code: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> int:
        """同步单只股票的历史价格数据"""
        self._ensure_stock_exists(code)
        return self._sync_prices(code, start_date, end_date)

    def get_stocks(
        self,
        search: Optional[str] = None,
        industry: Optional[str] = None
    ) -> List[Stock]:
        """获取数据库中的股票列表"""
        query = self.db.query(Stock)

        if search:
            query = query.filter(
                (Stock.code.contains(search)) |
                (Stock.name.contains(search))
            )

        if industry:
            query = query.filter(Stock.industry == industry)

        return query.all()

    def get_stock_by_code(self, code: str) -> Optional[Stock]:
        """根据代码获取股票"""
        return self.db.query(Stock).filter(Stock.code == code).first()

    def get_stock_prices(
        self,
        code: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        limit: int = 500
    ) -> List[StockPrice]:
        """获取股票历史价格"""
        query = self.db.query(StockPrice).filter(StockPrice.stock_code == code)

        if start_date:
            query = query.filter(StockPrice.date >= start_date)

        if end_date:
            query = query.filter(StockPrice.date <= end_date)

        query = query.order_by(StockPrice.date.desc()).limit(limit)
        return query.all()[::-1]

    def get_industries(self) -> List[str]:
        """获取所有行业列表（从数据库中已存的股票记录）"""
        industries = self.db.query(Stock.industry).distinct().all()
        return [ind[0] for ind in industries if ind[0]]

    def sync_stock_pool(self) -> int:
        """同步A股股票池（仅代码和名称，不获取价格数据）

        从 akshare 获取沪深A股列表，增量更新 stocks 表。
        新增不存在的股票记录，更新已有股票的名称。

        Returns:
            新增的股票数量
        """
        import akshare as ak

        all_stocks = []

        # 沪市主板
        try:
            df_sh = ak.stock_info_sh_name_code(symbol="主板A股")
            for _, row in df_sh.iterrows():
                code = str(row.get('证券代码', '')).zfill(6)
                name = str(row.get('证券简称', ''))
                if code and name and not name.startswith('N'):
                    all_stocks.append({'code': code, 'name': name, 'exchange': 'SH'})
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"获取沪市股票列表失败: {e}")

        # 深市
        try:
            df_sz = ak.stock_info_sz_name_code(indicator="A股列表")
            for _, row in df_sz.iterrows():
                code = str(row.get('A股代码', '')).zfill(6)
                name = str(row.get('A股简称', ''))
                if code and name and not name.startswith('N'):
                    all_stocks.append({'code': code, 'name': name, 'exchange': 'SZ'})
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"获取深市股票列表失败: {e}")

        if not all_stocks:
            return 0

        # 增量更新：新增/更新名称
        new_count = 0
        for item in all_stocks:
            existing = self.db.query(Stock).filter(Stock.code == item['code']).first()
            if not existing:
                stock = Stock(
                    code=item['code'],
                    name=item['name'],
                    exchange=item.get('exchange'),
                )
                self.db.add(stock)
                new_count += 1
            elif existing.name != item['name']:
                existing.name = item['name']

        self.db.commit()
        return new_count
