import { UserModel, TrainingTask, PredictionShareItem, CommunityModel } from '@/types'

/* ================================================================
 *  自选股行情
 * ================================================================ */

export interface WatchlistQuote {
  code: string
  name: string
  price: number | null
  change_pct: number | null
  open?: number | null
  high?: number | null
  low?: number | null
  volume?: number | null
}

/* ================================================================
 *  SSE 训练进度
 * ================================================================ */

export interface ProgressData {
  stage?: string
  progress?: number
  epoch?: number
  total_epochs?: number
  train_loss?: number
  val_loss?: number
  status?: string
  elapsed_seconds?: number
  estimated_remaining_seconds?: number | null
  stage_label?: string
  current_stock?: string
  total_stocks?: number
}

/* ================================================================
 *  过期模型
 * ================================================================ */

export interface StaleModel {
  model_id: number
  model_name: string
  model_type: string
  task_id: number
  trained_at: string
  stale_stocks: { code: string; latest_data_date: string; trained_at: string }[]
  new_data_count: number
}

/* ================================================================
 *  Dashboard 统计
 * ================================================================ */

export interface DashboardStats {
  stockCount: number
  modelCount: number
  taskCount: number
  backtestCount: number
  completedTaskCount: number
}

/* ================================================================
 *  快速预测结果（社区模型预测返回）
 * ================================================================ */

export interface QuickPredictResult {
  prediction_label?: string
  direction?: string
  confidence?: number
  predicted_close?: number
  predicted_price?: number
  predicted_change_pct?: number
}

/* ================================================================
 *  模型内预测结果
 * ================================================================ */

export interface ModelPredictResult {
  prediction_label?: string
  direction?: string
  confidence?: number
  predicted_close?: number
  predicted_price?: number
  predicted_change_pct?: number
}

/* ================================================================
 *  模型内回测结果（精简，仅 Dashboard 卡片展示用）
 * ================================================================ */

export interface ModelBacktestResult {
  total_return?: number | null
  sharpe_ratio?: number | null
  max_drawdown?: number | null
}

/* ================================================================
 *  子组件 Props
 * ================================================================ */

export interface QuickPredictCardProps {
  communityModels: CommunityModel[]
  stockCode: string
  onStockCodeChange: (code: string) => void
  onPredictComplete: () => void
}

export interface PredictionResultsCardProps {
  predictions: PredictionShareItem[]
  completedTasks: TrainingTask[]
  recentModels: UserModel[]
  onRefreshPredictions: () => void
}

export interface WatchlistQuotesCardProps {
  onSelectStockCode: (code: string) => void
}

export interface MyModelsCardProps {
  models: UserModel[]
  tasks: TrainingTask[]
  progressMap: Record<number, ProgressData>
  /* 回测结果来自后端，可能包含 model_id 等额外字段，使用宽松类型 */
  backtestResults: any[]
  onTrain: (modelId: number) => void
  onCreateModel: () => void
  onRefresh: () => void
}

export interface CreateModelDrawerProps {
  visible: boolean
  onClose: () => void
  onCreate: () => void
}
