// 股票相关类型
export interface Stock {
  id: number;
  code: string;
  name: string;
  exchange?: string;
  industry?: string;
  created_at: string;
  price_count?: number;
  earliest_date?: string;
  latest_date?: string;
}

export interface StockPrice {
  id: number;
  stock_code: string;
  date: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  amount?: number;
  change_pct?: number;
  change_amount?: number;
  adj_close?: number;
}

// 特征相关类型
export interface IndicatorParam {
  name: string;
  type: string;
  default: any;
  min?: number;
  max?: number;
  step?: number;
  options?: any[];
  description?: string;
}

export interface Indicator {
  key: string;
  name: string;
  description: string;
  category: string;
  params: IndicatorParam[];
}

// 模型相关类型
export interface ModelConfig {
  model_type: string;
  model_params: Record<string, any>;
  features: string[];
  feature_config?: Record<string, any>;
  target: string;
  target_config?: Record<string, any>;
  stock_codes: string[];
  train_date_range?: {
    start?: string;
    end?: string;
  };
}

export interface UserModel {
  id: number;
  user_id: number;
  name: string;
  description?: string;
  model_type: string;
  model_params: Record<string, any>;
  features: string[];
  feature_config: Record<string, any>;
  target: string;
  target_config: Record<string, any>;
  stock_codes: string[];
  train_date_range?: {
    start?: string;
    end?: string;
  };
  status: 'draft' | 'trained' | 'deployed';
  created_at: string;
  updated_at: string;
}

export interface ModelType {
  key: string;
  name: string;
  description: string;
  category: string;
  default_config: Record<string, any>;
  param_schema: Record<string, any>;
}

// 训练任务相关类型
export interface TrainingTask {
  id: number;
  model_id: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  start_time?: string;
  end_time?: string;
  config: Record<string, any>;
  metrics?: Record<string, any>;
  error_message?: string;
  duration?: number;
}

export interface TrainingProgress {
  stage: string;
  progress: number;
  epoch?: number;
  train_loss?: number;
  val_loss?: number;
  error?: string;
}

// 回测相关类型
export interface BacktestResult {
  id: number;
  task_id: number;
  start_date: string;
  end_date: string;
  initial_capital: number;
  final_capital?: number;
  total_return?: number;
  annual_return?: number;
  max_drawdown?: number;
  max_drawdown_duration?: number;
  sharpe_ratio?: number;
  sortino_ratio?: number;
  calmar_ratio?: number;
  trades_count?: number;
  win_count?: number;
  loss_count?: number;
  win_rate?: number;
  avg_profit?: number;
  avg_loss?: number;
  profit_factor?: number;
  equity_curve?: EquityPoint[];
  trades?: Trade[];
  daily_returns?: DailyReturn[];
  created_at: string;
}

export interface EquityPoint {
  date: string;
  value: number;
  cash: number;
  position_value: number;
}

export interface Trade {
  date: string;
  type: 'buy' | 'sell';
  price: number;
  shares: number;
  amount: number;
  pnl?: number;
}

export interface DailyReturn {
  date: string;
  return: number;
}

// API响应类型
export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
}

// 页面路由类型
export interface RouteConfig {
  path: string;
  element: React.ReactNode;
  title: string;
  icon?: React.ReactNode;
}
