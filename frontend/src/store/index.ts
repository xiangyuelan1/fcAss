import { create } from 'zustand';
import { Stock, UserModel, TrainingTask, BacktestResult, Indicator, ModelType } from '@/types';
import { authApi } from '@/services/api';

// 认证状态
interface UserInfo {
  id: number;
  username: string;
  nickname?: string;
  email: string | null;
  is_active: boolean;
  is_admin: boolean;
}

interface AuthState {
  user: UserInfo | null;
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  setUser: (user: UserInfo | null) => void;
  setToken: (token: string | null) => void;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string | undefined, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: localStorage.getItem('token'),
  isAuthenticated: !!localStorage.getItem('token'),
  loading: false,

  setUser: (user) => set({ user, isAuthenticated: !!user }),
  setToken: (token) => {
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
    set({ token, isAuthenticated: !!token });
  },

  login: async (username, password) => {
    set({ loading: true });
    try {
      const res: any = await authApi.login({ username, password });
      const token = res.access_token;
      localStorage.setItem('token', token);
      set({ token, isAuthenticated: true });
      const userRes: any = await authApi.getMe();
      set({ user: userRes, loading: false });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  register: async (username, email, password) => {
    set({ loading: true });
    try {
      await authApi.register({ username, email, password });
      await get().login(username, password);
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    set({ user: null, token: null, isAuthenticated: false });
  },

  checkAuth: async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      set({ user: null, token: null, isAuthenticated: false });
      return;
    }
    try {
      const userRes: any = await authApi.getMe();
      set({ user: userRes, token, isAuthenticated: true });
    } catch {
      localStorage.removeItem('token');
      set({ user: null, token: null, isAuthenticated: false });
    }
  },
}));

// 股票数据状态
interface StockState {
  stocks: Stock[];
  industries: string[];
  loading: boolean;
  setStocks: (stocks: Stock[]) => void;
  setIndustries: (industries: string[]) => void;
  setLoading: (loading: boolean) => void;
}

export const useStockStore = create<StockState>((set) => ({
  stocks: [],
  industries: [],
  loading: false,
  setStocks: (stocks) => set({ stocks }),
  setIndustries: (industries) => set({ industries }),
  setLoading: (loading) => set({ loading }),
}));

// 模型状态
interface ModelState {
  models: UserModel[];
  modelTypes: ModelType[];
  indicators: Indicator[];
  currentModel: UserModel | null;
  loading: boolean;
  setModels: (models: UserModel[]) => void;
  setModelTypes: (types: ModelType[]) => void;
  setIndicators: (indicators: Indicator[]) => void;
  setCurrentModel: (model: UserModel | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useModelStore = create<ModelState>((set) => ({
  models: [],
  modelTypes: [],
  indicators: [],
  currentModel: null,
  loading: false,
  setModels: (models) => set({ models }),
  setModelTypes: (modelTypes) => set({ modelTypes }),
  setIndicators: (indicators) => set({ indicators }),
  setCurrentModel: (currentModel) => set({ currentModel }),
  setLoading: (loading) => set({ loading }),
}));

// 训练任务状态
interface TrainingState {
  tasks: TrainingTask[];
  currentTask: TrainingTask | null;
  taskProgress: Record<string, any>;
  loading: boolean;
  setTasks: (tasks: TrainingTask[]) => void;
  setCurrentTask: (task: TrainingTask | null) => void;
  setTaskProgress: (taskId: number, progress: any) => void;
  setLoading: (loading: boolean) => void;
}

export const useTrainingStore = create<TrainingState>((set) => ({
  tasks: [],
  currentTask: null,
  taskProgress: {},
  loading: false,
  setTasks: (tasks) => set({ tasks }),
  setCurrentTask: (currentTask) => set({ currentTask }),
  setTaskProgress: (taskId, progress) =>
    set((state) => ({
      taskProgress: { ...state.taskProgress, [taskId]: progress },
    })),
  setLoading: (loading) => set({ loading }),
}));

// 回测状态
interface BacktestState {
  results: BacktestResult[];
  currentResult: BacktestResult | null;
  loading: boolean;
  setResults: (results: BacktestResult[]) => void;
  setCurrentResult: (result: BacktestResult | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useBacktestStore = create<BacktestState>((set) => ({
  results: [],
  currentResult: null,
  loading: false,
  setResults: (results) => set({ results }),
  setCurrentResult: (currentResult) => set({ currentResult }),
  setLoading: (loading) => set({ loading }),
}));

// 全局应用状态
interface AppState {
  collapsed: boolean;
  theme: 'light' | 'dark';
  setCollapsed: (collapsed: boolean) => void;
  setTheme: (theme: 'light' | 'dark') => void;
}

export const useAppStore = create<AppState>((set) => ({
  collapsed: false,
  theme: 'light',
  setCollapsed: (collapsed) => set({ collapsed }),
  setTheme: (theme) => set({ theme }),
}));
