import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { message } from 'antd';

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
    message.error(errorMessage);
    return Promise.reject(error);
  }
);

// 数据管理API
export const dataApi = {
  // 按代码获取股票数据（自动创建记录并同步价格，核心入口）
  fetchStock: (data: { code: string; start_date?: string; end_date?: string }) =>
    api.post('/data/stocks/fetch', data),

  // 获取已存的股票列表
  getStocks: (params?: { search?: string; industry?: string }) =>
    api.get('/data/stocks', { params }),

  // 获取股票历史价格
  getStockPrices: (code: string, params?: { start_date?: string; end_date?: string; limit?: number }) =>
    api.get(`/data/stocks/${code}/prices`, { params }),

  // 重新同步股票价格
  syncStockPrices: (code: string) =>
    api.post(`/data/stocks/${code}/sync`),

  // 获取股票信息
  getStockInfo: (code: string) =>
    api.get(`/data/stocks/${code}/info`),

  // 获取行业列表
  getIndustries: () =>
    api.get('/data/industries'),
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
  // 获取模型列表
  getModels: (params?: { skip?: number; limit?: number }) =>
    api.get('/models', { params }),
  
  // 创建模型
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
  
  // 获取模型详情
  getModel: (id: number) =>
    api.get(`/models/${id}`),
  
  // 更新模型
  updateModel: (id: number, data: any) =>
    api.put(`/models/${id}`, data),
  
  // 删除模型
  deleteModel: (id: number) =>
    api.delete(`/models/${id}`),
  
  // 获取模型配置
  getModelConfig: (id: number) =>
    api.get(`/models/${id}/config`),
  
  // 获取可用模型类型
  getModelTypes: () =>
    api.get('/models/types/available'),
  
  // 克隆模型
  cloneModel: (id: number, newName?: string) =>
    api.post(`/models/${id}/clone`, null, { params: { new_name: newName } }),

  // AI优化参数
  aiOptimizeParams: (data: {
    model_type: string;
    features?: string[];
    stock_codes?: string[];
  }) => api.post('/models/ai-optimize-params', data),
};

// 训练任务API
export const trainingApi = {
  // 获取训练任务列表
  getTasks: (params?: { model_id?: number; status?: string; skip?: number; limit?: number }) =>
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
  getResults: (params?: { task_id?: number; skip?: number; limit?: number }) =>
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
};

// 支付API
export const paymentApi = {
  // 获取注册付费信息
  getRegisterInfo: () =>
    api.get('/payment/register-info'),

  // 创建付费注册订单
  createOrder: (data: { username: string; email?: string; password: string; pay_type: string }) =>
    api.post('/payment/order/create', data),

  // 获取支付二维码
  getQrcode: (out_trade_no: string) =>
    api.post('/payment/order/qrcode', null, { params: { out_trade_no } }),

  // 查询订单支付状态
  queryOrderStatus: (out_trade_no: string) =>
    api.get('/payment/order/status', { params: { out_trade_no } }),

  // 获取支付配置（管理员）
  getConfig: () =>
    api.get('/payment/config'),

  // 保存支付配置（管理员）
  saveConfig: (data: { name: string; gateway_url: string; pid: string; secret_key: string; register_fee: number; pay_type: string; is_active: boolean }) =>
    api.post('/payment/config', data),
};

export default api;
