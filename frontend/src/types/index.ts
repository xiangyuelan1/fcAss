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
  is_pinned?: boolean;
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
  is_pinned?: boolean;
  is_favorited?: boolean;
  is_published?: boolean;
}

export interface ModelType {
  key: string;
  name: string;
  description: string;
  category: string;
  default_config: Record<string, any>;
  param_schema: Record<string, any>;
}

export interface ModelTemplate {
  id: string;
  name: string;
  description: string;
  category: 'beginner' | 'intermediate' | 'advanced';
  model_type: string;
  model_params: Record<string, any>;
  features: string[];
  feature_config: Record<string, any>;
  target: string;
  target_config: Record<string, any>;
  stock_codes: string[];
  train_date_range: { start?: string; end?: string } | null;
  difficulty: '简单' | '中等' | '较难';
  tags: string[];
  is_recommended: boolean;
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

export interface AdminUser {
  id: number;
  username: string;
  email: string | null;
  is_active: boolean;
  is_admin: boolean;
  created_at: string | null;
  updated_at: string | null;
  last_login_at: string | null;
  last_login_ip: string | null;
  last_heartbeat: string | null;
  is_online: boolean;
}

export interface SystemConfigItem {
  id: number;
  category: string;
  name: string;
  key: string;
  description: string | null;
  value: Record<string, any>;
  is_active: boolean;
  sort_order: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface CommunityModel {
  id: number;
  user_id: number;
  source_model_id: number;
  name: string;
  description?: string;
  model_type: string;
  model_params: Record<string, any>;
  features: string[];
  feature_config: Record<string, any>;
  target: string;
  target_config: Record<string, any>;
  stock_codes: string[];
  train_date_range?: { start?: string; end?: string };
  metrics?: Record<string, number>;
  likes_count: number;
  clones_count: number;
  is_active: boolean;
  author?: { id: number; username: string };
  is_liked?: boolean;
  created_at: string;
  updated_at: string;
}

export interface CommunitySignal {
  id: number;
  user_id: number;
  community_model_id: number;
  stock_code: string;
  stock_name?: string;
  prediction_date: string;
  direction: string;
  prediction_value?: number;
  confidence?: number;
  actual_result?: string;
  is_correct?: boolean;
  likes_count: number;
  is_active: boolean;
  author?: { id: number; username: string };
  is_liked?: boolean;
  created_at: string;
}

export interface PKChallenge {
  id: number;
  challenger_id: number;
  challenger_model_id: number;
  defender_model_id?: number;
  defender_id?: number;
  stock_code: string;
  pk_mode: 'direction' | 'multi_price' | 'trend_5d' | 'custom';
  pk_config?: Record<string, any>;
  status: 'open' | 'accepted' | 'evaluating' | 'completed' | 'cancelled';
  prediction_date?: string;
  challenger_prediction?: Record<string, any>;
  defender_prediction?: Record<string, any>;
  actual_data?: Record<string, any>;
  winner_id?: number;
  result_detail?: Record<string, any>;
  challenger?: { id: number; username: string };
  defender?: { id: number; username: string };
  created_at: string;
  evaluated_at?: string;
}

export interface UserPoints {
  id: number;
  user_id: number;
  total_points: number;
  level: number;
  username?: string;
  created_at: string;
}

export interface PointTransaction {
  id: number;
  user_id: number;
  action: string;
  points: number;
  target_type?: string;
  target_id?: number;
  description?: string;
  created_at: string;
}

export interface Achievement {
  id: number;
  user_id: number;
  badge_type: string;
  badge_name: string;
  description?: string;
  earned_at?: string;
}

export interface AchievementBadge {
  badge_type: string;
  badge_name: string;
  description: string;
  bonus: number;
  earned: boolean;
  earned_at?: string;
}

export interface DailyChallenge {
  challenge_date: string;
  stock_code: string | null;
  stock_name: string | null;
  completed: boolean;
  direction?: string | null;
  confidence?: number | null;
}

export interface AdminStats {
  users: { total: number; active: number; admins: number; new_today: number };
  models: { total: number; trained: number; community_published: number };
  training: { total_tasks: number; completed: number; failed: number; running: number };
  community: { models: number; signals: number; likes: number; clones: number; pk_challenges: number };
  data: { stocks: number; price_records: number };
  points: { total_distributed: number; top_users: { user_id: number; username: string; total_points: number; level: number }[] };
}

export interface ActivityItem {
  type: string;
  description: string;
  user_id: number;
  username: string;
  created_at: string | null;
}

export interface Message {
  id: number;
  sender_id: number;
  sender_name?: string;
  receiver_id: number;
  subject: string;
  content: string;
  parent_id?: number | null;
  is_read: boolean;
  created_at: string;
  replies?: Message[];
}
