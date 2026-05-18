import axios, { AxiosInstance, AxiosResponse } from 'axios';

// 创建axios实例
const api: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
api.interceptors.response.use(
  (response: AxiosResponse) => {
    return response.data;
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }
    const errorMessage = error.response?.data?.detail || error.message || '请求失败';
    console.error('API请求失败:', errorMessage);
    return Promise.reject(error);
  }
);

// 数据管理API
export const dataApi = {
  fetchStock: (data: { code: string; start_date?: string; end_date?: string }) =>
    api.post('/data/stocks/fetch', data),

  getStocks: (params?: { search?: string; industry?: string }) =>
    api.get('/data/stocks', { params }),

  getStockPrices: (code: string, params?: { start_date?: string; end_date?: string; limit?: number }) =>
    api.get(`/data/stocks/${code}/prices`, { params }),

  syncStockPrices: (code: string) =>
    api.post(`/data/stocks/${code}/sync`),

  getStockInfo: (code: string) =>
    api.get(`/data/stocks/${code}/info`),

  getIndustries: () =>
    api.get('/data/industries'),

  pinStock: (code: string) =>
    api.post(`/data/stocks/${code}/pin`),

  unpinStock: (code: string) =>
    api.post(`/data/stocks/${code}/unpin`),

  deleteStock: (code: string) =>
    api.delete(`/data/stocks/${code}`),

  checkStaleData: () =>
    api.get('/data/stale-check'),

  batchSync: () =>
    api.post('/data/batch-sync'),

  updateAll: () =>
    api.post('/data/update-all'),

  ensureStockData: (code: string) =>
    api.post(`/data/stocks/${code}/ensure`),

  searchStockPool: (q: string) =>
    api.get('/data/stocks/search', { params: { q } }),

  syncStockPool: () =>
    api.post('/data/stocks/sync-pool'),

  getRealtimeQuotes: (codes: string[]) =>
    api.get('/data/stocks/realtime', { params: { codes: codes.join(',') } }),

  getRealtimeQuote: (code: string) =>
    api.get(`/data/stocks/${code}/realtime`),
};

// 特征工程API
export const featureApi = {
  // 获取可用指标
  getIndicators: () =>
    api.get('/features/indicators'),
  
  // 获取指标详情
  getIndicatorDetail: (name: string) =>
    api.get(`/features/indicators/${name}`),
  
  // 计算特征
  calculateFeatures: (data: {
    stock_code: string;
    indicators: string[];
    indicator_params?: Record<string, Record<string, any>>;
    start_date?: string;
    end_date?: string;
  }) => api.post('/features/calculate', data),
  
  // 预览特征
  previewFeatures: (data: {
    stock_code: string;
    indicators: string[];
    indicator_params?: Record<string, Record<string, any>>;
    limit?: number;
  }) => api.post('/features/preview', data),
  
  // 获取指标分类
  getCategories: () =>
    api.get('/features/categories'),
};

// 模型管理API
export const modelApi = {
  getModels: (params?: { page?: number; page_size?: number }) =>
    api.get('/models', { params }),
  
  createModel: (data: {
    name: string;
    description?: string;
    config: {
      model_type: string;
      model_params?: Record<string, any>;
      features: string[];
      feature_config?: Record<string, any>;
      target: string;
      target_config?: Record<string, any>;
      stock_codes: string[];
      train_date_range?: { start?: string; end?: string };
    };
  }) => api.post('/models', data),
  
  getModel: (id: number) =>
    api.get(`/models/${id}`),
  
  updateModel: (id: number, data: any) =>
    api.put(`/models/${id}`, data),
  
  deleteModel: (id: number) =>
    api.delete(`/models/${id}`),
  
  getModelConfig: (id: number) =>
    api.get(`/models/${id}/config`),
  
  getModelTypes: () =>
    api.get('/models/types/available'),

  getTypeStats: () =>
    api.get('/models/types/stats'),
  
  cloneModel: (id: number, newName?: string) =>
    api.post(`/models/${id}/clone`, null, { params: { new_name: newName } }),

  aiOptimizeParams: (data: {
    model_type: string;
    features?: string[];
    stock_codes?: string[];
  }) => api.post('/models/ai-optimize-params', data),

  pinModel: (id: number) =>
    api.post(`/models/${id}/pin`),

  unpinModel: (id: number) =>
    api.post(`/models/${id}/unpin`),

  favoriteModel: (id: number) =>
    api.post(`/models/${id}/favorite`),

  unfavoriteModel: (id: number) =>
    api.post(`/models/${id}/unfavorite`),

  getTemplates: () =>
    api.get('/models/templates'),

  createFromTemplate: (templateId: string) =>
    api.post(`/models/templates/${templateId}/create`),

  getRandomStock: () =>
    api.get('/models/random-stock'),
};

// 训练任务API
export const trainingApi = {
  // 获取训练任务列表
  getTasks: (params?: { model_id?: number; status?: string; page?: number; page_size?: number }) =>
    api.get('/training/tasks', { params }),
  
  // 创建训练任务
  createTask: (data: { model_id: number; config?: Record<string, any> }) =>
    api.post('/training/tasks', data),
  
  // 获取训练任务详情
  getTask: (id: number) =>
    api.get(`/training/tasks/${id}`),
  
  // 取消训练任务
  cancelTask: (id: number) =>
    api.post(`/training/tasks/${id}/cancel`),
  
  // 获取训练日志
  getTaskLogs: (id: number) =>
    api.get(`/training/tasks/${id}/logs`),
  
  // 获取训练进度
  getTaskProgress: (id: number) =>
    api.get(`/training/tasks/${id}/progress`),
  
  // 删除训练任务
  deleteTask: (id: number) =>
    api.delete(`/training/tasks/${id}`),
  
  // 获取训练指标
  getTaskMetrics: (id: number) =>
    api.get(`/training/tasks/${id}/metrics`),
};

// 回测API
export const backtestApi = {
  // 执行回测
  runBacktest: (data: {
    task_id: number;
    start_date: string;
    end_date: string;
    initial_capital?: number;
    commission_rate?: number;
    slippage?: number;
    position_size?: number;
    stop_loss?: number;
    take_profit?: number;
  }) => api.post('/backtest/run', data),
  
  // 获取回测结果列表
  getResults: (params?: { task_id?: number; page?: number; page_size?: number }) =>
    api.get('/backtest/results', { params }),
  
  // 获取回测结果详情
  getResult: (id: number) =>
    api.get(`/backtest/results/${id}`),
  
  // 获取权益曲线
  getEquityCurve: (id: number) =>
    api.get(`/backtest/results/${id}/equity`),
  
  // 获取交易记录
  getTrades: (id: number) =>
    api.get(`/backtest/results/${id}/trades`),
  
  // 获取每日收益
  getDailyReturns: (id: number) =>
    api.get(`/backtest/results/${id}/daily-returns`),
  
  // 删除回测结果
  deleteResult: (id: number) =>
    api.delete(`/backtest/results/${id}`),
  
  // 对比回测结果
  compareBacktests: (backtestIds: number[]) =>
    api.post('/backtest/compare', backtestIds),
};

// 预测API
export const predictionApi = {
  // 单只股票预测
  predict: (data: {
    task_id: number;
    stock_code: string;
    days?: number;
  }) => api.post('/prediction/predict', data),

  // 批量预测
  batchPredict: (data: {
    task_id: number;
    stock_codes: string[];
  }) => api.post('/prediction/batch-predict', data),

  // 获取可预测股票列表
  getPredictableStocks: (taskId: number) =>
    api.get(`/prediction/tasks/${taskId}/predictable-stocks`),
};

// 认证API
export const authApi = {
  // 用户注册
  register: (data: { username: string; email?: string; password: string }) =>
    api.post('/auth/register', data),

  // 用户登录
  login: (data: { username: string; password: string }) =>
    api.post('/auth/token', new URLSearchParams(data), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }),

  // 获取当前用户信息
  getMe: () =>
    api.get('/auth/me'),

  // 刷新令牌
  refreshToken: () =>
    api.post('/auth/refresh'),

  // 修改密码
  changePassword: (data: { old_password: string; new_password: string }) =>
    api.post('/auth/change-password', data),

  // 心跳上报（保持在线状态）
  heartbeat: () =>
    api.post('/auth/heartbeat'),

  // 获取当前在线人数
  getOnlineCount: () =>
    api.get('/auth/online-count'),
};

// 支付API
export const paymentApi = {
  getRegisterInfo: () =>
    api.get('/payment/register-info'),

  createOrder: (data: { username: string; email?: string; password: string; pay_type: string }) =>
    api.post('/payment/order/create', data),

  getQrcode: (out_trade_no: string) =>
    api.post('/payment/order/qrcode', null, { params: { out_trade_no } }),

  queryOrderStatus: (out_trade_no: string) =>
    api.get('/payment/order/status', { params: { out_trade_no } }),

  getConfig: () =>
    api.get('/payment/config'),

  saveConfig: (data: { name: string; gateway_url: string; pid: string; secret_key: string; register_fee: number; pay_type: string; is_active: boolean }) =>
    api.post('/payment/config', data),
};

export const adminApi = {
  listUsers: (params?: { skip?: number; limit?: number }) =>
    api.get('/admin/users', { params }),

  getUser: (userId: number) =>
    api.get(`/admin/users/${userId}`),

  resetUserPassword: (userId: number, data: { new_password: string }) =>
    api.post(`/admin/users/${userId}/reset-password`, data),

  toggleUserActive: (userId: number) =>
    api.post(`/admin/users/${userId}/toggle-active`),

  listConfigs: (params?: { category?: string }) =>
    api.get('/admin/config', { params }),

  createConfig: (data: { category: string; name: string; key: string; description?: string; value: any; is_active?: boolean; sort_order?: number }) =>
    api.post('/admin/config', data),

  updateConfig: (configId: number, data: { category?: string; name?: string; description?: string; value?: any; is_active?: boolean; sort_order?: number }) =>
    api.put(`/admin/config/${configId}`, data),

  deleteConfig: (configId: number) =>
    api.delete(`/admin/config/${configId}`),

  getActiveConfigs: (category: string) =>
    api.get(`/admin/config/active/${category}`),

  getStats: () =>
    api.get('/admin/stats'),

  getActivity: (params?: any) =>
    api.get('/admin/activity', { params }),

  // 获取用户详情（含模型、训练记录等）
  getUserDetail: (userId: number) =>
    api.get(`/admin/users/${userId}/detail`),

  // 获取用户统计信息（含在线人数）
  getUserStats: () =>
    api.get('/admin/user-stats'),
};

export const communityApi = {
  getModels: (params?: any) => api.get('/community/models', { params }),
  getModel: (id: number) => api.get(`/community/models/${id}`),
  publishModel: (data: any) => api.post('/community/models/publish', data),
  unpublishModel: (id: number) => api.post(`/community/models/${id}/unpublish`),
  likeModel: (id: number) => api.post(`/community/models/${id}/like`),
  cloneModel: (id: number) => api.post(`/community/models/${id}/clone`),
  predictWithModel: (modelId: number, data: { stock_code: string; days?: number }) =>
    api.post(`/community/models/${modelId}/predict`, data),
  backtestModel: (modelId: number, data: { stock_code: string; start_date?: string; end_date?: string; initial_capital?: number }) =>
    api.post(`/community/models/${modelId}/backtest`, data),
  getSignals: (params?: any) => api.get('/community/signals', { params }),
  publishSignal: (data: any) => api.post('/community/signals/publish', data),
  likeSignal: (id: number) => api.post(`/community/signals/${id}/like`),
  getMySignals: () => api.get('/community/signals/my'),
};

export const pkApi = {
  createChallenge: (data: any) => api.post('/pk/challenges', data),
  getChallenges: (params?: any) => api.get('/pk/challenges', { params }),
  acceptChallenge: (id: number, data: any) => api.post(`/pk/challenges/${id}/accept`, data),
  evaluateChallenge: (id: number) => api.post(`/pk/challenges/${id}/evaluate`),
  getChallenge: (id: number) => api.get(`/pk/challenges/${id}`),
  getLeaderboard: (params?: any) => api.get('/pk/leaderboard', { params }),
};

export const pointsApi = {
  getBalance: () => api.get('/points/balance'),
  getTransactions: (params?: any) => api.get('/points/transactions', { params }),
  getLeaderboard: (params?: any) => api.get('/points/leaderboard', { params }),
  dailyCheckin: () => api.post('/points/daily-checkin'),
  getAchievements: () => api.get('/points/achievements'),
  getAllAchievements: () => api.get('/points/achievements/all'),
  checkAchievements: () => api.post('/points/check-achievements'),
  getDailyChallenge: () => api.get('/points/daily-challenge'),
  submitDailyChallenge: (data: any) => api.post('/points/daily-challenge/submit', data),
};

export const messageApi = {
  sendMessage: (data: { subject: string; content: string; parent_id?: number }) =>
    api.post('/messages', data),
  getMessages: (params?: { page?: number; page_size?: number }) =>
    api.get('/messages', { params }),
  getMessage: (id: number) =>
    api.get(`/messages/${id}`),
  markRead: (id: number) =>
    api.put(`/messages/${id}/read`),
  getUnreadCount: () =>
    api.get('/messages/unread-count'),
  adminGetAll: (params?: { page?: number; page_size?: number; is_read?: boolean }) =>
    api.get('/messages/admin/all', { params }),
  adminReply: (id: number, content: string) =>
    api.post(`/messages/admin/${id}/reply`, { content }),
  adminMarkRead: (id: number) =>
    api.put(`/messages/admin/${id}/read`),
};

export const guideApi = {
  getState: () => api.get('/guide/state'),
  complete: () => api.post('/guide/complete'),
};

export const watchlistApi = {
  getWatchlists: () => api.get('/watchlists'),
  createWatchlist: (data: { name: string; description?: string }) => api.post('/watchlists', data),
  updateWatchlist: (id: number, data: { name?: string; description?: string }) => api.put(`/watchlists/${id}`, data),
  deleteWatchlist: (id: number) => api.delete(`/watchlists/${id}`),
  addStock: (id: number, data: { stock_code: string; stock_name: string }) => api.post(`/watchlists/${id}/stocks`, data),
  removeStock: (id: number, code: string) => api.delete(`/watchlists/${id}/stocks/${code}`),
  getStocks: (id: number) => api.get(`/watchlists/${id}/stocks`),
};

export const dailyGuessApi = {
  getToday: () => api.get('/daily-guess/today'),
  vote: (direction: 'up' | 'down') => api.post('/daily-guess/vote', { direction }),
  getHistory: () => api.get('/daily-guess/history'),
};

export default api;
