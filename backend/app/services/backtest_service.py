"""
回测服务 - 负责策略回测和结果分析
"""
import os
import pickle
import numpy as np
import pandas as pd
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from datetime import datetime

try:
    import torch
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    torch = None

from app.models.training import TrainingTask, BacktestResult
from app.models.user_model import UserModel
from app.services.feature_service import FeatureService
from app.services.data_service import DataService
from app.services.training_service import ModelCheckpoint
from app.core.config import settings


class BacktestService:
    """回测服务类"""
    
    def __init__(self, db: Session):
        self.db = db
        self.feature_service = FeatureService(db)
        self.data_service = DataService(db)
    
    def get_results(
        self,
        task_id: Optional[int] = None,
        skip: int = 0,
        limit: int = 100,
        user_id: Optional[int] = None
    ) -> List[BacktestResult]:
        """获取回测结果列表，按 user_id 过滤时通过 join TrainingTask -> UserModel 实现"""
        query = self.db.query(BacktestResult)
        
        if user_id is not None:
            query = query.join(TrainingTask, BacktestResult.task_id == TrainingTask.id).join(
                UserModel, TrainingTask.model_id == UserModel.id
            ).filter(UserModel.user_id == user_id)
        
        if task_id:
            query = query.filter(BacktestResult.task_id == task_id)
        
        return query.order_by(BacktestResult.created_at.desc()).offset(skip).limit(limit).all()
    
    def get_result(self, backtest_id: int) -> Optional[BacktestResult]:
        """获取回测结果"""
        return self.db.query(BacktestResult).filter(BacktestResult.id == backtest_id).first()
    
    def create_backtest(
        self,
        task_id: int,
        start_date: str,
        end_date: str,
        initial_capital: float = 100000,
        commission_rate: float = 0.0003,
        slippage: float = 0.001,
        position_size: float = 1.0,
        stop_loss: Optional[float] = None,
        take_profit: Optional[float] = None
    ) -> BacktestResult:
        """创建回测任务"""
        backtest = BacktestResult(
            task_id=task_id,
            start_date=start_date,
            end_date=end_date,
            initial_capital=initial_capital
        )
        self.db.add(backtest)
        self.db.commit()
        self.db.refresh(backtest)
        return backtest
    
    def delete_result(self, backtest_id: int) -> bool:
        """删除回测结果"""
        result = self.get_result(backtest_id)
        if not result:
            return False
        
        self.db.delete(result)
        self.db.commit()
        return True
    
    def run_backtest(self, backtest_id: int, override_stock_codes: list = None):
        """执行回测
        
        Args:
            override_stock_codes: 可选，覆盖训练时的股票列表，支持对非训练股票回测
        """
        backtest = self.get_result(backtest_id)
        if not backtest:
            return
        
        try:
            # 获取训练任务和模型
            task = backtest.training_task
            user_model = task.user_model
            
            # 加载模型（同时获取input_size和feature_window）
            model, input_size, feature_window = self._load_model(task)
            
            # 执行回测（可覆盖股票列表）
            results = self._execute_backtest(
                model, user_model, backtest,
                backtest.start_date, backtest.end_date,
                input_size, feature_window,
                override_stock_codes=override_stock_codes
            )
            
            # 更新回测结果
            backtest.final_capital = results['final_capital']
            backtest.total_return = results['total_return']
            backtest.annual_return = results['annual_return']
            backtest.max_drawdown = results['max_drawdown']
            backtest.max_drawdown_duration = results['max_drawdown_duration']
            backtest.sharpe_ratio = results['sharpe_ratio']
            backtest.sortino_ratio = results['sortino_ratio']
            backtest.calmar_ratio = results['calmar_ratio']
            backtest.trades_count = results['trades_count']
            backtest.win_count = results['win_count']
            backtest.loss_count = results['loss_count']
            backtest.win_rate = results['win_rate']
            backtest.avg_profit = results['avg_profit']
            backtest.avg_loss = results['avg_loss']
            backtest.profit_factor = results['profit_factor']
            backtest.equity_curve = results['equity_curve']
            backtest.trades = results['trades']
            backtest.daily_returns = results['daily_returns']
            
            self.db.commit()
            
        except Exception as e:
            print(f"回测失败: {str(e)}")
            raise
    
    def _load_model(self, task: TrainingTask):
        """加载训练好的模型（从checkpoint中读取input_size和feature_window）"""
        try:
            model, metrics, input_size, feature_window = ModelCheckpoint.load_checkpoint(task.id)
            return model, input_size, feature_window
        except FileNotFoundError:
            raise FileNotFoundError(f"模型检查点不存在，请先完成模型训练")
    
    def _execute_backtest(
        self, model, user_model, backtest,
        start_date: str, end_date: str,
        input_size: int = 0,
        feature_window: int = 1,
        override_stock_codes: list = None
    ) -> Dict[str, Any]:
        """执行回测逻辑
        
        多股票独立回测：每只股票分配 initial_capital / len(stock_codes) 的资金，
        独立执行交易，最后合并所有股票的结果。
        
        Args:
            input_size: 模型期望的特征维度
            feature_window: 特征窗口天数
            override_stock_codes: 可选，覆盖训练时的股票列表
        """
        # 使用覆盖的股票列表或训练时的股票列表
        stock_codes = override_stock_codes or user_model.stock_codes
        
        initial_capital = float(backtest.initial_capital)
        
        # 每只股票独立分配资金
        per_stock_capital = initial_capital / len(stock_codes) if stock_codes else initial_capital
        
        # 获取模型类型和配置（所有股票共用）
        model_type = user_model.model_type
        model_config = user_model.model_config
        
        # 对每个股票独立回测
        all_stock_results = []
        
        for code in stock_codes:
            # 自动获取缺失的股票数据（共享缓存+动态获取）
            existing_prices = self.data_service.get_stock_prices(code=code, limit=1)
            if len(existing_prices) == 0:
                try:
                    result = self.data_service.fetch_stock_data(code)
                except Exception:
                    pass

            # 获取回测期间数据
            prices = self.data_service.get_stock_prices(
                code=code,
                start_date=start_date,
                end_date=end_date,
                limit=2000
            )
            
            if len(prices) < 50:
                continue
            
            # 计算特征（传递feature_config以使用用户配置的指标参数）
            df = self.feature_service.calculate_features(
                stock_code=code,
                indicators=user_model.features,
                indicator_params=user_model.feature_config or {},
                start_date=start_date,
                end_date=end_date,
                limit=5000
            )
            
            if df is None or df.empty:
                continue
            
            # 标准化（排除原始价格列、ID和元数据列）
            exclude_cols = {'id', 'stock_code', 'open', 'high', 'low', 'close', 'volume', 'amount',
                            'change_pct', 'change_amount', 'adj_close'}
            feature_cols = [col for col in df.columns if col not in exclude_cols]
            df_features = df[feature_cols].copy()
            df_features = df_features.fillna(0)
            df_features = (df_features - df_features.mean()) / df_features.std()
            
            # 该股票的独立回测状态
            stock_capital = per_stock_capital
            stock_position = 0
            stock_trades = []
            stock_equity_curve = []
            
            # 模拟交易
            for i in range(len(df)):
                current_price = df['close'].iloc[i]
                date = df.index[i].strftime('%Y-%m-%d')
                
                try:
                    if model_type in ['lstm', 'gru']:
                        seq_len = model_config.get('sequence_length', 20)
                        if i >= seq_len:
                            seq_features = df_features.iloc[i-seq_len:i].values.reshape(1, seq_len, -1)
                            if TORCH_AVAILABLE:
                                seq_tensor = torch.FloatTensor(seq_features)
                                with torch.no_grad():
                                    prediction = model(seq_tensor).item()
                            else:
                                prediction = 0
                        else:
                            prediction = 0
                    elif feature_window > 1:
                        if i >= feature_window - 1:
                            window_data = df_features.iloc[i-feature_window+1:i+1].values.flatten().reshape(1, -1)
                            if model_type == 'mlp' and TORCH_AVAILABLE:
                                feat_tensor = torch.FloatTensor(window_data)
                                with torch.no_grad():
                                    prediction = model(feat_tensor).item()
                            else:
                                prediction = model.predict(window_data)[0]
                        else:
                            prediction = 0
                    elif model_type == 'mlp':
                        features = df_features.iloc[i].values.reshape(1, -1)
                        if TORCH_AVAILABLE:
                            feat_tensor = torch.FloatTensor(features)
                            with torch.no_grad():
                                prediction = model(feat_tensor).item()
                        else:
                            prediction = 0
                    else:
                        features = df_features.iloc[i].values.reshape(1, -1)
                        prediction = model.predict(features)[0]
                except Exception as e:
                    print(f"预测失败: {e}，使用基准预测")
                    prediction = 0
                
                # 交易逻辑
                if stock_position == 0 and prediction > 0.001:  # 买入信号
                    shares = int(stock_capital * 0.95 / current_price)
                    if shares > 0:
                        cost = shares * current_price * (1 + 0.0003)
                        if cost <= stock_capital:
                            stock_position = shares
                            stock_capital -= cost
                            stock_trades.append({
                                'date': date,
                                'type': 'buy',
                                'price': float(current_price),
                                'shares': shares,
                                'amount': float(cost),
                                'stock_code': code,
                            })
                
                elif stock_position > 0 and prediction < -0.001:  # 卖出信号
                    revenue = stock_position * current_price * (1 - 0.0003)
                    stock_capital += revenue
                    
                    stock_trades.append({
                        'date': date,
                        'type': 'sell',
                        'price': float(current_price),
                        'shares': stock_position,
                        'amount': float(revenue),
                        'pnl': float(revenue - stock_trades[-1]['amount']) if stock_trades and stock_trades[-1]['type'] == 'buy' else 0,
                        'stock_code': code,
                    })
                    stock_position = 0
                
                # 记录权益
                total_value = stock_capital + stock_position * current_price
                stock_equity_curve.append({
                    'date': date,
                    'value': float(total_value),
                    'cash': float(stock_capital),
                    'position_value': float(stock_position * current_price),
                    'stock_code': code,
                })
            
            # 该股票回测结束，计算最终资金（若仍持仓则按最后收盘价清仓）
            stock_final_capital = stock_capital
            if stock_position > 0:
                final_price = df['close'].iloc[-1] if len(df) > 0 else 0
                stock_final_capital += stock_position * final_price
            
            all_stock_results.append({
                'stock_code': code,
                'final_capital': stock_final_capital,
                'trades': stock_trades,
                'equity_curve': stock_equity_curve,
            })
        
        # 合并所有股票的结果
        final_capital = sum(r['final_capital'] for r in all_stock_results)
        all_trades = []
        for r in all_stock_results:
            all_trades.extend(r['trades'])
        
        # 合并 equity_curve：按日期聚合，同一日期的 value/cash/position_value 求和
        merged_equity_curve = self._merge_equity_curves(all_stock_results)
        
        # 计算回测指标
        total_return = (final_capital - initial_capital) / initial_capital
        
        # 年化收益
        days = len(merged_equity_curve)
        annual_return = (1 + total_return) ** (252 / days) - 1 if days > 0 else 0
        
        # 计算最大回撤
        max_drawdown = 0
        max_drawdown_duration = 0
        peak = initial_capital
        peak_idx = 0
        
        for i, point in enumerate(merged_equity_curve):
            value = point['value']
            if value > peak:
                peak = value
                peak_idx = i
            drawdown = (peak - value) / peak
            if drawdown > max_drawdown:
                max_drawdown = drawdown
                max_drawdown_duration = i - peak_idx
        
        # 计算夏普比率
        returns = []
        for i in range(1, len(merged_equity_curve)):
            daily_return = (merged_equity_curve[i]['value'] - merged_equity_curve[i-1]['value']) / merged_equity_curve[i-1]['value']
            returns.append(daily_return)
        
        if len(returns) > 1:
            avg_return = np.mean(returns)
            std_return = np.std(returns)
            sharpe_ratio = (avg_return / std_return) * np.sqrt(252) if std_return > 0 else 0
            
            # 索提诺比率（只考虑下行波动）
            downside_returns = [r for r in returns if r < 0]
            downside_std = np.std(downside_returns) if downside_returns else 0
            sortino_ratio = (avg_return / downside_std) * np.sqrt(252) if downside_std > 0 else 0
        else:
            sharpe_ratio = 0
            sortino_ratio = 0
        
        # 卡尔玛比率
        calmar_ratio = annual_return / max_drawdown if max_drawdown > 0 else 0
        
        # 交易统计
        buy_trades = [t for t in all_trades if t['type'] == 'buy']
        sell_trades = [t for t in all_trades if t['type'] == 'sell']
        
        win_trades = [t for t in sell_trades if t.get('pnl', 0) > 0]
        loss_trades = [t for t in sell_trades if t.get('pnl', 0) <= 0]
        
        win_count = len(win_trades)
        loss_count = len(loss_trades)
        win_rate = win_count / len(sell_trades) if sell_trades else 0
        
        avg_profit = np.mean([t['pnl'] for t in win_trades]) if win_trades else 0
        avg_loss = np.mean([abs(t['pnl']) for t in loss_trades]) if loss_trades else 0
        profit_factor = avg_profit / avg_loss if avg_loss > 0 else 0
        
        return {
            'final_capital': float(final_capital),
            'total_return': float(total_return),
            'annual_return': float(annual_return),
            'max_drawdown': float(max_drawdown),
            'max_drawdown_duration': max_drawdown_duration,
            'sharpe_ratio': float(sharpe_ratio),
            'sortino_ratio': float(sortino_ratio),
            'calmar_ratio': float(calmar_ratio),
            'trades_count': len(sell_trades),
            'win_count': win_count,
            'loss_count': loss_count,
            'win_rate': float(win_rate),
            'avg_profit': float(avg_profit),
            'avg_loss': float(avg_loss),
            'profit_factor': float(profit_factor),
            'equity_curve': merged_equity_curve,
            'trades': all_trades,
            'daily_returns': [{'date': merged_equity_curve[i]['date'], 'return': float(returns[i-1])} for i in range(1, len(merged_equity_curve))]
        }
    
    @staticmethod
    def _merge_equity_curves(stock_results: list) -> list:
        """合并多只股票的权益曲线，按日期聚合求和
        
        同一日期的 value/cash/position_value 分别求和，
        缺失日期用该股票最后一个已知值填充（未参与回测的日期视为资金不变）。
        """
        if not stock_results:
            return []
        
        # 收集所有出现过的日期
        all_dates = set()
        for r in stock_results:
            for point in r['equity_curve']:
                all_dates.add(point['date'])
        
        if not all_dates:
            return []
        
        sorted_dates = sorted(all_dates)
        
        # 为每只股票建立日期 -> 权益的映射
        stock_date_maps = []
        for r in stock_results:
            date_map = {}
            for point in r['equity_curve']:
                date_map[point['date']] = point
            stock_date_maps.append(date_map)
        
        # 按日期聚合
        merged = []
        # 记录每只股票上一个已知值，用于前向填充
        last_known = [None] * len(stock_date_maps)
        
        for date in sorted_dates:
            total_value = 0
            total_cash = 0
            total_position_value = 0
            all_present = True
            
            for idx, date_map in enumerate(stock_date_maps):
                if date in date_map:
                    point = date_map[date]
                    last_known[idx] = point
                    total_value += point['value']
                    total_cash += point['cash']
                    total_position_value += point['position_value']
                elif last_known[idx] is not None:
                    # 该日期此股票无数据，用上一个已知值填充
                    all_present = False
                    total_value += last_known[idx]['value']
                    total_cash += last_known[idx]['cash']
                    total_position_value += last_known[idx]['position_value']
                else:
                    all_present = False
            
            merged.append({
                'date': date,
                'value': float(total_value),
                'cash': float(total_cash),
                'position_value': float(total_position_value),
            })
        
        return merged
    
    def compare_backtests(self, backtest_ids: List[int]) -> Dict[str, Any]:
        """对比多个回测结果"""
        results = []
        for bid in backtest_ids:
            result = self.get_result(bid)
            if result:
                results.append(result.to_dict())
        
        if not results:
            return {'results': [], 'comparison': {}}
        
        # 提取关键指标进行对比
        metrics = ['total_return', 'annual_return', 'max_drawdown', 'sharpe_ratio', 'win_rate']
        comparison = {}
        
        for metric in metrics:
            values = [r.get(metric) for r in results if r.get(metric) is not None]
            if values:
                comparison[metric] = {
                    'best': max(values),
                    'worst': min(values),
                    'average': sum(values) / len(values)
                }
        
        return {
            'results': results,
            'comparison': comparison
        }
