/**
 * 社区页面共享常量与工具函数
 * 被 ModelSquare、PredictionShare、Leaderboard、Sidebar 等子组件复用
 */

/** 模型类型 → Tag 颜色映射 */
export const MODEL_TYPE_COLORS: Record<string, string> = {
  lstm: 'blue',
  gru: 'cyan',
  xgboost: 'green',
  lightgbm: 'lime',
  randomforest: 'orange',
  mlp: 'purple',
}

/** 模型广场排序选项 */
export const SORT_OPTIONS = [
  { label: '最新发布', value: 'newest' },
  { label: '最多点赞', value: 'likes' },
  { label: '最多克隆', value: 'clones' },
]

/** 模型类型筛选选项 */
export const TYPE_OPTIONS = [
  { label: '全部类型', value: '' },
  { label: 'LSTM', value: 'lstm' },
  { label: 'GRU', value: 'gru' },
  { label: 'XGBoost', value: 'xgboost' },
  { label: 'LightGBM', value: 'lightgbm' },
  { label: 'RandomForest', value: 'randomforest' },
  { label: 'MLP', value: 'mlp' },
]

/** 预测分享排序选项 */
export const PREDICTION_SORT_OPTIONS = [
  { label: '最新发布', value: 'newest' },
  { label: '最多点赞', value: 'likes' },
  { label: '最高置信度', value: 'confidence' },
]

/** 排行榜时间范围选项 */
export const LEADERBOARD_PERIOD_OPTIONS = [
  { label: '近一周', value: 'week' },
  { label: '近一月', value: 'month' },
  { label: '全部', value: 'all' },
]

/** 预测方向 → 颜色 */
export const getDirectionColor = (direction: string) => {
  if (direction === 'up') return 'red'
  if (direction === 'down') return 'green'
  return 'default'
}

/** 预测方向 → 中文标签 */
export const getDirectionLabel = (direction: string) => {
  if (direction === 'up') return '看涨'
  if (direction === 'down') return '看跌'
  return '震荡'
}

/** 排名 → 头像背景色 */
export const getRankColor = (index: number) => {
  if (index === 0) return '#f5222d'
  if (index === 1) return '#faad14'
  if (index === 2) return '#fa8c16'
  return '#1890ff'
}

/** 友好时间格式化 */
export const formatTime = (dateStr: string) => {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin}分钟前`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}小时前`
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay < 30) return `${diffDay}天前`
  return date.toLocaleDateString()
}
