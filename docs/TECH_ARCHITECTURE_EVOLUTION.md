# A股预测训练平台 - 技术架构演进文档

> 版本：1.0 | 更新日期：2026-05-21 | 状态：规划中

---

## 目录

1. [当前架构分析](#1-当前架构分析)
2. [前端状态管理重构方案](#2-前端状态管理重构方案)
3. [API层类型安全方案](#3-api层类型安全方案)
4. [微前端拆分方案](#4-微前端拆分方案)
5. [后端任务队列方案](#5-后端任务队列方案)
6. [数据库优化方案](#6-数据库优化方案)
7. [实时数据架构](#7-实时数据架构)
8. [监控与可观测性](#8-监控与可观测性)
9. [安全加固方案](#9-安全加固方案)
10. [CI/CD与部署架构](#10-cicd与部署架构)
11. [性能基准与优化目标](#11-性能基准与优化目标)
12. [技术选型对比表](#12-技术选型对比表)

---

## 1. 当前架构分析

### 1.1 架构总览

```
┌──────────────────────────────────────────────────────────────────┐
│                     当前生产架构                                   │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐        │
│  │  Nginx       │    │  FastAPI     │    │  SQLite      │        │
│  │  (前端静态    │───→│  (单进程)     │───→│  (单文件DB)  │        │
│  │   + 反向代理) │    │  :8000       │    │  本地文件     │        │
│  └──────────────┘    └──────┬───────┘    └──────────────┘        │
│                             │                                    │
│                    ┌────────┴────────┐                           │
│                    │  全局内存状态     │                           │
│                    │  training_progress│                          │
│                    │  ws_manager      │                           │
│                    └─────────────────┘                           │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐                            │
│  │  React SPA   │    │  文件存储     │                            │
│  │  (Vite构建)   │    │  模型文件     │                            │
│  │  Zustand ×6  │    │  日志文件     │                            │
│  └──────────────┘    └──────────────┘                            │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 技术栈清单

| 层级 | 当前技术 | 版本 |
|------|---------|------|
| 前端框架 | React + TypeScript | 18.2 / 5.2 |
| UI组件库 | Ant Design | 5.12 |
| 状态管理 | Zustand | 4.4.7 |
| 构建工具 | Vite | 5.0.8 |
| 移动端 | Capacitor (Android) | 8.3.4 |
| 后端框架 | FastAPI | 0.109.0 |
| ORM | SQLAlchemy | 2.0.25 |
| 数据库 | SQLite | 系统内置 |
| ML框架 | PyTorch / scikit-learn / XGBoost / LightGBM | 2.1+ / 1.3+ / 2.0+ / 4.2+ |
| 数据源 | akshare / baostock | 1.12+ / 0.8+ |
| 认证 | JWT (python-jose) | 3.3.0 |
| 缓存 | Redis (已引入未使用) | 5.0.1 |
| 部署 | Docker Compose | - |

### 1.3 优势

| 优势 | 说明 |
|------|------|
| 快速迭代 | 单体架构+SQLite，开发部署简单，适合MVP阶段 |
| 功能完整 | 已覆盖数据管理、特征工程、模型训练、回测、预测、社区、PK、积分等完整功能链 |
| 前端技术栈现代 | React 18 + TypeScript + Zustand + Vite，开发体验好 |
| 移动端覆盖 | Capacitor方案已实现Android App |
| ML能力丰富 | 支持6种模型类型（LSTM/GRU/MLP/XGBoost/LightGBM/RandomForest） |
| 社区生态雏形 | 模型分享、PK竞技、跟单订阅、积分成就等社交功能已实现 |

### 1.4 瓶颈

| 瓶颈 | 严重程度 | 说明 |
|------|---------|------|
| SQLite并发限制 | 🔴 严重 | SQLite单写锁，多用户同时训练时写入阻塞 |
| 训练任务无队列 | 🔴 严重 | 使用Python threading + 全局dict管理训练，无法跨进程/跨实例 |
| WebSocket单进程 | 🟡 中等 | ConnectionManager仅维护单进程内连接列表，无法水平扩展 |
| 无缓存层 | 🟡 中等 | Redis已在requirements中但未实际使用，重复数据查询无缓存 |
| API无类型校验 | 🟡 中等 | 前端大量`any`类型，后端响应无运行时校验，接口变更易引发运行时错误 |
| 无监控告警 | 🟡 中等 | 仅文件日志，无结构化日志、指标采集、链路追踪 |
| CORS全开放 | 🔴 严重 | `allow_origins=["*"]`，存在CSRF风险 |
| 密钥硬编码 | 🔴 严重 | SECRET_KEY默认值为硬编码字符串 |

### 1.5 技术债清单

| 编号 | 技术债 | 影响 | 优先级 |
|------|--------|------|-------|
| TD-01 | `training_progress`全局字典 | 多进程/重启丢失，无法分布式 | P0 |
| TD-02 | SQLite单文件数据库 | 并发写入阻塞，无主从复制 | P0 |
| TD-03 | CORS `allow_origins=["*"]` | 安全风险 | P0 |
| TD-04 | SECRET_KEY硬编码 | 安全风险 | P0 |
| TD-05 | 前端API层大量`any`类型 | 类型安全缺失，重构困难 | P1 |
| TD-06 | Zustand store碎片化(6个独立store) | 状态逻辑分散，跨store依赖隐式 | P1 |
| TD-07 | 无数据库迁移工具(Alembic未配置) | Schema变更风险高 | P1 |
| TD-08 | 无API限流 | 恶意调用风险 | P1 |
| TD-09 | WebSocket无认证 | 任何人可连接ws端点 | P2 |
| TD-10 | 无结构化日志 | 排查问题困难 | P2 |
| TD-11 | 模型文件本地存储 | 无法多实例共享 | P2 |
| TD-12 | 无自动化测试 | 回归风险高 | P2 |

---

## 2. 前端状态管理重构方案

### 2.1 现状问题

当前前端使用6个独立Zustand store：

```
useAuthStore    → 认证状态 (user, token, login/logout)
useStockStore   → 股票数据 (stocks, industries)
useModelStore   → 模型数据 (models, modelTypes, indicators)
useTrainingStore→ 训练任务 (tasks, currentTask, taskProgress)
useBacktestStore→ 回测结果 (results, currentResult)
useAppStore     → 全局UI   (collapsed)
useThemeStore   → 主题     (isDark)
usePredictionStore→ 预测   (historyRecords)
```

**问题**：
1. Store之间无依赖声明，`usePredictionStore.loadFromBackend`内部调用`predictionApi`，与auth token存在隐式依赖
2. 每个store独立管理loading状态，缺乏统一的异步操作模式
3. 部分store仅是"状态容器"（如StockStore、BacktestStore），数据获取逻辑散落在页面组件中
4. `usePredictionStore.loadFromBackend`中catch块为空，错误被吞掉

### 2.2 重构目标

1. 统一异步操作模式：loading/error/data三态管理
2. 消除跨store隐式依赖
3. 数据获取逻辑从组件下沉到store
4. 保持Zustand轻量优势，不引入Redux级别的复杂度

### 2.3 重构方案：Zustand Slice模式 + 异步中间件

**核心思路**：将多个碎片store合并为按业务域划分的slice，通过Zustand的`combine`API组合为单一全局store，同时引入统一的异步操作封装。

#### 2.3.1 Store结构重组

```
全局Store (useStore)
├── auth slice      → 认证与用户信息
├── stock slice     → 股票数据与行情
├── model slice     → 模型管理与配置
├── training slice  → 训练任务与进度
├── prediction slice→ 预测结果与历史
├── community slice → 社区模型与信号
├── ui slice        → 主题、侧边栏、通知
└── [按需扩展]
```

#### 2.3.2 异步操作封装

```typescript
// 统一的异步状态类型
interface AsyncState<T> {
  data: T;
  loading: boolean;
  error: string | null;
  fetchedAt: number | null; // 数据获取时间戳，用于缓存判断
}

// 统一的异步操作封装
function createAsyncAction<T, A extends unknown[]>(
  fetcher: (...args: A) => Promise<T>,
  onSetState: (partial: Partial<AsyncState<T>>) => void
) {
  return async (...args: A): Promise<T> => {
    onSetState({ loading: true, error: null });
    try {
      const data = await fetcher(...args);
      onSetState({ data, loading: false, fetchedAt: Date.now() });
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : '请求失败';
      onSetState({ loading: false, error: message });
      throw err; // 不吞掉错误，由调用方决定如何处理
    }
  };
}
```

#### 2.3.3 Slice示例（auth slice）

```typescript
// slices/authSlice.ts
interface AuthSlice {
  // 状态
  user: UserInfo | null;
  token: string | null;
  isAuthenticated: boolean;
  authLoading: boolean;
  authError: string | null;

  // 操作
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string | undefined, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

const createAuthSlice: StateCreator<StoreState, [], [], AuthSlice> = (set) => ({
  user: null,
  token: localStorage.getItem('token'),
  isAuthenticated: !!localStorage.getItem('token'),
  authLoading: false,
  authError: null,

  login: async (username, password) => {
    set({ authLoading: true, authError: null });
    try {
      const res = await authApi.login({ username, password });
      const token = res.access_token;
      localStorage.setItem('token', token);
      const userRes = await authApi.getMe();
      set({ user: userRes, token, isAuthenticated: true, authLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : '登录失败';
      set({ authLoading: false, authError: message });
      throw err;
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
      const userRes = await authApi.getMe();
      set({ user: userRes, token, isAuthenticated: true });
    } catch {
      localStorage.removeItem('token');
      set({ user: null, token: null, isAuthenticated: false });
    }
  },

  register: async (username, email, password) => {
    set({ authLoading: true, authError: null });
    try {
      await authApi.register({ username, email, password });
      // 注册成功后自动登录，复用login逻辑
      const res = await authApi.login({ username, password });
      const token = res.access_token;
      localStorage.setItem('token', token);
      const userRes = await authApi.getMe();
      set({ user: userRes, token, isAuthenticated: true, authLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : '注册失败';
      set({ authLoading: false, authError: message });
      throw err;
    }
  },
});
```

#### 2.3.4 Store组合

```typescript
// store/index.ts
import { create } from 'zustand';
import { combine } from 'zustand/middleware';
import { createAuthSlice, AuthSlice } from './slices/authSlice';
import { createStockSlice, StockSlice } from './slices/stockSlice';
import { createModelSlice, ModelSlice } from './slices/modelSlice';
import { createTrainingSlice, TrainingSlice } from './slices/trainingSlice';
import { createPredictionSlice, PredictionSlice } from './slices/predictionSlice';
import { createCommunitySlice, CommunitySlice } from './slices/communitySlice';
import { createUiSlice, UiSlice } from './slices/uiSlice';

type StoreState = AuthSlice & StockSlice & ModelSlice & TrainingSlice
  & PredictionSlice & CommunitySlice & UiSlice;

export const useStore = create<StoreState>()((...a) => ({
  ...createAuthSlice(...a),
  ...createStockSlice(...a),
  ...createModelSlice(...a),
  ...createTrainingSlice(...a),
  ...createPredictionSlice(...a),
  ...createCommunitySlice(...a),
  ...createUiSlice(...a),
}));
```

### 2.4 迁移计划

| 阶段 | 工作内容 | 预计工时 |
|------|---------|---------|
| Phase 1 | 创建slice目录结构，实现authSlice + uiSlice，替换对应旧store | 2天 |
| Phase 2 | 实现stockSlice + modelSlice，迁移数据获取逻辑到store | 3天 |
| Phase 3 | 实现trainingSlice + predictionSlice + communitySlice | 3天 |
| Phase 4 | 删除旧store文件，全局替换`useXxxStore`为`useStore`的slice选择器 | 2天 |
| Phase 5 | 端到端回归测试 | 2天 |

**关键原则**：
- 使用`useStore(state => state.auth.user)`选择器模式，避免不必要的重渲染
- 每个slice的异步操作必须处理loading/error/data三态
- 错误不得被吞掉，必须向上传播或设置到error状态
- 迁移期间新旧store可共存，逐slice替换

---

## 3. API层类型安全方案

### 3.1 现状问题

当前前端API层存在以下类型安全问题：

1. **大量`any`类型**：API响应几乎全部被标注为`any`（如`const res: any = await authApi.login(...)`）
2. **无运行时校验**：后端返回的数据结构变更，前端无法在运行时检测
3. **手动维护类型**：`types/index.ts`中的接口定义与后端Pydantic模型手动同步，容易不一致
4. **无API Schema管理**：缺乏OpenAPI规范驱动的类型生成流程

### 3.2 目标架构

```
后端 Pydantic Models
       │
       ▼ (FastAPI自动生成)
OpenAPI 3.0 JSON Schema (/openapi.json)
       │
       ├──→ (orval代码生成) ──→ TypeScript类型 + API Client
       │
       └──→ (Zod Schema生成) ──→ 运行时校验器
```

### 3.3 方案：Zod运行时校验 + OpenAPI代码生成

#### 3.3.1 第一层：OpenAPI代码生成（编译时类型安全）

使用 [orval](https://orval.dev/) 从FastAPI的`/openapi.json`自动生成TypeScript类型和API Client。

**配置示例** (`orval.config.js`)：

```javascript
module.exports = {
  a_stock_trainer: {
    input: {
      target: 'http://localhost:8000/openapi.json',
    },
    output: {
      target: './src/services/generated/api.ts',
      client: 'axios',
      override: {
        mutator: {
          path: './src/services/custom-instance.ts',
          name: 'customInstance',
        },
      },
    },
  },
};
```

**生成产物**：
- `src/services/generated/api.ts` — 所有API函数，带完整类型签名
- `src/services/generated/types.ts` — 所有请求/响应的TypeScript接口

**开发流程**：
1. 后端修改API → 本地启动后端 → 运行`orval`生成最新类型
2. 前端代码中使用生成的类型和函数，编译时即可发现接口不匹配

#### 3.3.2 第二层：Zod运行时校验（运行时安全）

对关键业务数据（预测结果、交易信号、支付订单等）使用Zod Schema进行运行时校验，防止后端返回异常数据导致前端崩溃。

**Schema定义示例**：

```typescript
// schemas/prediction.ts
import { z } from 'zod';

export const PredictionResultSchema = z.object({
  direction: z.enum(['up', 'down', 'flat']),
  confidence: z.number().min(0).max(1),
  predicted_change_pct: z.number(),
  prediction_date: z.string().date(),
  stock_code: z.string().regex(/^\d{6}$/),
});

export type PredictionResult = z.infer<typeof PredictionResultSchema>;

// 使用方式
function parsePrediction(data: unknown): PredictionResult {
  return PredictionResultSchema.parse(data); // 校验失败抛出ZodError
}
```

**校验策略**：
- 关键数据（预测、交易、支付）：严格校验，失败抛出错误
- 展示数据（股票列表、社区模型）：宽松校验（`safeParse`），失败时降级显示
- 分页数据：仅校验结构，不校验内容

#### 3.3.3 渐进式迁移计划

| 阶段 | 工作内容 | 预计工时 |
|------|---------|---------|
| Phase 1 | 引入orval，配置OpenAPI代码生成，生成类型文件 | 1天 |
| Phase 2 | 引入Zod，为关键API响应（预测、支付、训练状态）定义Schema | 2天 |
| Phase 3 | 逐步替换`api.ts`中的手写API函数为生成的类型安全版本 | 3天 |
| Phase 4 | 清除所有`any`类型，启用严格模式 | 2天 |
| Phase 5 | CI集成：后端API变更时自动运行orval，类型不匹配则构建失败 | 1天 |

---

## 4. 微前端拆分方案

### 4.1 拆分必要性评估

**当前状态**：前端为单体SPA，约25个页面，代码量中等。

**是否需要微前端**：
- 短期（6个月内）：❌ 不需要。当前规模单体SPA完全够用，微前端引入的复杂度远大于收益
- 中期（12个月内）：⚠️ 观察评估。若团队扩展至3+前端，可考虑按业务域拆分
- 长期（18个月+）：✅ 若企业版需要独立部署或第三方需要嵌入模块，则需要

**结论**：当前阶段不实施微前端，但架构设计需为未来拆分预留可能性。

### 4.2 未来拆分预案

若未来需要微前端，推荐按以下业务域拆分：

```
主应用 (Shell)
├── 数据中心模块     → 数据管理、股票池、自选股
├── 模型工坊模块     → 特征工程、模型构建、模型模板
├── 训练中心模块     → 训练任务、回测分析、预测
├── 社区广场模块     → 社区模型、PK竞技、排行榜、信号
└── 用户中心模块     → 个人设置、积分成就、会员、消息
```

### 4.3 技术方案对比

| 方案 | 优势 | 劣势 | 适用场景 |
|------|------|------|---------|
| **Module Federation** (Webpack 5) | 运行时动态加载，无需额外框架；共享依赖减少体积 | 需要Webpack（当前用Vite）；版本兼容性复杂 | 大型应用、团队独立部署 |
| **qiankun** (基于single-spa) | 成熟稳定、社区大、样式隔离完善 | 额外框架依赖、通信机制较重；子应用需改造 | 中大型应用、多技术栈 |
| **Vite Module Federation** | 与当前Vite技术栈一致 | 相对较新，生态不如Webpack版 | Vite项目首选 |
| **iframe方案** | 完全隔离、最简单 | 性能差、通信受限、UX差 | 极端隔离需求 |

**推荐方案**：若未来实施，选择 **Vite Module Federation**（[@originjs/vite-plugin-federation](https://github.com/originjs/vite-plugin-federation)），与当前Vite技术栈一致，迁移成本最低。

### 4.4 当前阶段的架构预留

虽不实施微前端，但需在架构上预留拆分可能性：

1. **页面组件自治**：每个页面组件自包含，不跨页面共享内部状态
2. **API层按域隔离**：API函数按业务域组织（已基本满足：dataApi/modelApi/trainingApi等）
3. **路由配置集中**：路由定义集中管理，便于未来拆分为子应用路由
4. **共享组件库独立**：通用UI组件（Layout、MascotBull等）保持无业务依赖
5. **Store按域划分**：Zustand slice按业务域组织（见第2章重构方案），便于未来拆分

---

## 5. 后端任务队列方案

### 5.1 现状问题

当前训练任务执行方式：

```python
# training_service.py 中的全局字典
training_progress = {}

# training API 中使用线程执行训练
thread = threading.Thread(target=service.run_training, args=(task.id,))
thread.start()
```

**问题**：
1. `training_progress`是进程内全局字典，进程重启后丢失所有训练进度
2. 多实例部署时，训练进度无法跨实例查询
3. 线程无法被可靠取消（Python GIL + 无取消机制）
4. 无法限制并发训练数量
5. 无法实现训练队列优先级

### 5.2 目标架构

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  FastAPI     │     │  Redis       │     │  Celery      │     │  GPU Worker  │
│  (Web层)     │────→│  (Broker +   │────→│  Worker ×N   │────→│  (可选)       │
│  提交任务     │     │   Backend)   │     │  执行训练     │     │  CUDA训练     │
│  查询进度     │     │  存储进度     │     │  上报进度     │     │              │
└─────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

### 5.3 Celery + Redis方案

#### 5.3.1 任务定义

```python
# tasks/training_tasks.py
from celery import Celery
from celery.signals import task_prerun, task_postrun, task_failure

celery_app = Celery(
    'a_stock_trainer',
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery_app.conf.update(
    task_serializer='json',
    result_serializer='json',
    accept_content=['json'],
    timezone='Asia/Shanghai',
    task_track_started=True,
    worker_prefetch_multiplier=1,  # 每次只取1个任务，避免GPU资源争抢
    task_acks_late=True,           # 任务完成后才确认，避免中途丢失
    worker_concurrency=2,          # 默认2个并发worker
)

@celery_app.task(bind=True, name='training.run')
def run_training_task(self, task_id: int):
    """Celery任务：执行模型训练"""
    db = SessionLocal()
    try:
        service = TrainingService(db)
        service.run_training(task_id, progress_callback=self._report_progress)
    finally:
        db.close()

def _report_progress(self, task_id: int, progress: dict):
    """通过Redis发布训练进度"""
    redis_client.publish(
        f'training:{task_id}:progress',
        json.dumps(progress)
    )
```

#### 5.3.2 进度查询与推送

```python
# 进度通过Redis Pub/Sub + WebSocket推送
async def training_progress_subscriber():
    """订阅Redis训练进度频道，通过WebSocket推送给前端"""
    pubsub = redis_client.pubsub()
    await pubsub.psubscribe('training:*:progress')
    async for message in pubsub.listen():
        if message['type'] == 'pmessage':
            task_id = message['channel'].decode().split(':')[1]
            progress = json.loads(message['data'])
            await ws_manager.broadcast_to_room(
                f'task_{task_id}',
                {'type': 'training_progress', 'data': progress}
            )
```

#### 5.3.3 队列优先级

```python
# 定义不同优先级的队列
celery_app.conf.task_routes = {
    'training.run': {
        'queue': 'training',
    },
}

# 付费用户任务路由到高优先级队列
def submit_training_task(task_id: int, user_tier: str):
    queue = {
        'free': 'training_free',      # 低优先级
        'pro': 'training_pro',        # 中优先级
        'max': 'training_max',        # 高优先级
        'enterprise': 'training_enterprise',  # 最高优先级
    }.get(user_tier, 'training_free')

    run_training_task.apply_async(
        args=[task_id],
        queue=queue,
    )
```

#### 5.3.4 Worker配置

| Worker类型 | 队列 | 并发数 | GPU | 适用场景 |
|-----------|------|-------|-----|---------|
| CPU Worker | training_free, training_pro | 4 | 无 | sklearn模型训练 |
| GPU Worker (T4) | training_pro, training_max | 1 | T4 | LSTM/GRU/MLP训练 |
| GPU Worker (A100) | training_max, training_enterprise | 1 | A100 | 大规模深度学习训练 |

### 5.4 迁移计划

| 阶段 | 工作内容 | 预计工时 |
|------|---------|---------|
| Phase 1 | 配置Redis连接，替换`training_progress`全局字典为Redis存储 | 2天 |
| Phase 2 | 引入Celery，将`run_training`迁移为Celery任务 | 3天 |
| Phase 3 | 实现多队列优先级调度，配置Worker | 2天 |
| Phase 4 | 实现训练进度Redis Pub/Sub + WebSocket推送 | 2天 |
| Phase 5 | Docker Compose添加Redis和Celery Worker服务 | 1天 |
| Phase 6 | 端到端测试与性能验证 | 2天 |

---

## 6. 数据库优化方案

### 6.1 现状问题

| 问题 | 影响 |
|------|------|
| SQLite单文件数据库 | 并发写入阻塞，无法水平扩展 |
| 无索引优化 | 部分高频查询未建立索引 |
| 无缓存层 | 重复查询（如股票列表、指标列表）每次都访问数据库 |
| 无读写分离 | 所有请求直接访问主库 |
| 无数据库迁移工具 | Schema变更依赖手动SQL或ORM自动创建 |

### 6.2 SQLite → PostgreSQL迁移

#### 6.2.1 迁移理由

| 维度 | SQLite | PostgreSQL |
|------|--------|-----------|
| 并发写入 | 单写锁，串行化 | MVCC，高并发 |
| 连接数 | 单连接 | 数百连接 |
| 全文搜索 | FTS5（有限） | GIN索引 + tsvector |
| JSON支持 | 基础 | JSONB（索引+查询） |
| 复制 | 不支持 | 流复制/逻辑复制 |
| 扩展 | 不支持 | PostGIS/pg_trgm等 |

#### 6.2.2 迁移步骤

1. **配置Alembic**：初始化Alembic迁移框架，从当前SQLAlchemy模型生成初始迁移脚本
2. **数据导出**：从SQLite导出全量数据（`sqlite3 .dump` → 转换为PostgreSQL兼容SQL）
3. **Schema迁移**：在PostgreSQL上执行Alembic迁移，创建表结构
4. **数据导入**：将SQLite数据导入PostgreSQL
5. **连接切换**：修改`DATABASE_URL`环境变量，从`sqlite:///`切换为`postgresql://`
6. **验证**：全量功能回归测试

**关键SQL兼容性处理**：
- SQLite的`AUTOINCREMENT` → PostgreSQL的`SERIAL`/`BIGSERIAL`
- SQLite的`INTEGER PRIMARY KEY` → PostgreSQL的`SERIAL PRIMARY KEY`
- 日期格式差异处理
- JSON列的兼容性检查

### 6.3 读写分离

```
┌──────────────┐     写操作
│  FastAPI      │──────────→ ┌──────────────┐
│  (写路由)     │            │  PostgreSQL   │
└──────────────┘            │  主库         │
                            └──────┬───────┘
┌──────────────┐     读操作         │ 流复制
│  FastAPI      │──────────→ ┌──────┴───────┐
│  (读路由)     │            │  PostgreSQL   │
└──────────────┘            │  从库         │
                            └──────────────┘
```

**实现方式**：
- SQLAlchemy配置两个Session工厂：`SessionLocalWriter`（主库）和`SessionLocalReader`（从库）
- 写操作（创建/更新/删除）使用Writer Session
- 读操作（查询/列表/详情）使用Reader Session
- 复制延迟处理：写后立即读的场景（如创建后查询）使用Writer Session

### 6.4 缓存层设计

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│  请求     │────→│  Redis   │────→│  PostgreSQL │
│          │     │  缓存     │     │  数据库     │
└──────────┘     └──────────┘     └──────────┘
                  命中 → 直接返回
                  未命中 → 查DB → 写入缓存
```

**缓存策略**：

| 数据类型 | 缓存Key | TTL | 更新策略 |
|---------|---------|-----|---------|
| 股票列表 | `stocks:list` | 24h | 股票池同步时主动失效 |
| 股票详情 | `stocks:{code}` | 1h | 价格更新时主动失效 |
| 行业列表 | `industries` | 24h | 股票池同步时主动失效 |
| 技术指标列表 | `features:indicators` | 24h | 系统配置变更时失效 |
| 模型类型列表 | `models:types` | 24h | 系统配置变更时失效 |
| 用户信息 | `users:{id}` | 30min | 用户信息更新时失效 |
| 排行榜 | `leaderboard:{type}` | 5min | 定时刷新 |
| 实时行情 | `quotes:{code}` | 30s | 行情推送时覆盖写入 |

**缓存一致性**：
- 采用"Cache-Aside"模式：读时填充，写时失效
- 关键数据使用"双写"：更新数据库后立即更新缓存
- 避免缓存雪崩：TTL添加随机偏移（±10%）

### 6.5 索引优化

**高频查询索引**：

```sql
-- 股票价格查询（按股票代码+日期范围）
CREATE INDEX idx_stock_prices_code_date ON stock_prices (stock_code, date DESC);

-- 用户模型查询（按用户ID）
CREATE INDEX idx_user_models_user_id ON user_models (user_id);

-- 训练任务查询（按模型ID+状态）
CREATE INDEX idx_training_tasks_model_status ON training_tasks (model_id, status);

-- 社区模型查询（按活跃度排序）
CREATE INDEX idx_community_models_active ON community_models (is_active, likes_count DESC);

-- 支付订单查询（按订单号）
CREATE INDEX idx_payment_orders_trade_no ON payment_orders (out_trade_no);

-- 预测分享查询（按股票代码+日期）
CREATE INDEX idx_prediction_shares_code_date ON prediction_shares (stock_code, created_at DESC);

-- 每日一猜查询（按日期）
CREATE INDEX idx_daily_guess_date ON daily_guess_stocks (challenge_date);
```

### 6.6 迁移时间线

| 阶段 | 工作内容 | 预计工时 |
|------|---------|---------|
| Phase 1 | 配置Alembic，生成初始迁移脚本 | 1天 |
| Phase 2 | 部署PostgreSQL，执行Schema迁移 | 1天 |
| Phase 3 | 数据导出导入，验证数据完整性 | 2天 |
| Phase 4 | 切换DATABASE_URL，全量回归测试 | 1天 |
| Phase 5 | 配置Redis缓存层，实现缓存策略 | 3天 |
| Phase 6 | 创建索引，性能基准测试 | 2天 |
| Phase 7 | 配置主从复制，实现读写分离 | 3天 |

---

## 7. 实时数据架构

### 7.1 现状问题

当前WebSocket实现：

```python
class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []

    async def broadcast(self, data: dict):
        for ws in self.active:
            await ws.send_json(data)

ws_manager = ConnectionManager()  # 全局单例，进程内
```

**问题**：
1. 连接列表仅存在于单进程内存，多实例部署时无法共享
2. 广播遍历所有连接，无法按房间/频道分组推送
3. WebSocket端点无认证，任何人可连接
4. 行情推送硬编码5只股票，无法按用户自选股定制

### 7.2 目标架构

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  客户端      │────→│  WebSocket   │────→│  Redis       │
│  (浏览器/App)│←────│  Gateway     │←────│  Pub/Sub     │
└─────────────┘     │  (多实例)     │     │  (消息总线)   │
                    └──────┬───────┘     └──────┬───────┘
                           │                    │
                    ┌──────┴───────┐     ┌──────┴───────┐
                    │  认证中间件    │     │  数据推送服务  │
                    │  (JWT校验)    │     │  (行情/训练)  │
                    └──────────────┘     └──────────────┘
```

### 7.3 WebSocket Gateway设计

#### 7.3.1 连接管理

```python
# 使用Redis维护连接注册表，支持多实例
class DistributedConnectionManager:
    """基于Redis的分布式WebSocket连接管理器"""

    def __init__(self, redis_client):
        self.redis = redis_client
        self.local_connections: dict[str, WebSocket] = {}  # 本实例连接

    async def connect(self, ws: WebSocket, user_id: int, instance_id: str):
        await ws.accept()
        conn_id = f"{instance_id}:{id(ws)}"
        self.local_connections[conn_id] = ws
        # 注册到Redis：用户→连接映射
        await self.redis.hset(
            f"ws:connections:user:{user_id}",
            mapping={conn_id: instance_id}
        )
        # 加入用户自选股频道
        watchlist = await self._get_user_watchlist(user_id)
        for code in watchlist:
            await self.redis.sadd(f"ws:channel:stock:{code}", conn_id)

    async def disconnect(self, conn_id: str, user_id: int):
        self.local_connections.pop(conn_id, None)
        await self.redis.hdel(f"ws:connections:user:{user_id}", conn_id)
        # 清理频道订阅
        async for key in self.redis.scan_iter("ws:channel:stock:*"):
            await self.redis.srem(key, conn_id)
```

#### 7.3.2 频道订阅

| 频道 | 订阅方式 | 推送内容 | 频率 |
|------|---------|---------|------|
| `market` | 所有连接 | 大盘指数概览 | 30s |
| `stock:{code}` | 持有该股票自选的用户 | 个股实时行情 | 5s (交易时段) |
| `training:{task_id}` | 任务所有者 | 训练进度 | 实时 |
| `signal:{user_id}` | 订阅该用户的用户 | 新预测信号 | 实时 |
| `pk:{challenge_id}` | PK参与者 | PK状态更新 | 实时 |

#### 7.3.3 认证中间件

```python
@app.websocket("/ws/market")
async def websocket_market(ws: WebSocket, token: str = Query(...)):
    """带认证的WebSocket端点"""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = int(payload.get("sub"))
    except (JWTError, ValueError):
        await ws.close(code=4001, reason="认证失败")
        return

    await connection_manager.connect(ws, user_id, INSTANCE_ID)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        await connection_manager.disconnect(...)
```

### 7.4 消息队列集成

```
数据源 (akshare/实时API)
       │
       ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  数据采集     │────→│  Redis       │────→│  WebSocket   │
│  服务         │     │  Pub/Sub     │     │  Gateway     │
│  (定时任务)   │     │  (消息总线)   │     │  (推送到客户端)│
└──────────────┘     └──────────────┘     └──────────────┘
```

- 数据采集服务作为独立Celery定时任务运行
- 采集到新数据后发布到Redis频道
- 所有WebSocket Gateway实例订阅Redis频道，收到消息后推送给本地连接的客户端

---

## 8. 监控与可观测性

### 8.1 现状

当前仅有文件日志（`app/core/logging.py`），无结构化日志、无指标采集、无链路追踪、无告警。

### 8.2 三大支柱

```
┌──────────────────────────────────────────────────────────────┐
│                    可观测性三大支柱                             │
├──────────────────┬──────────────────┬────────────────────────┤
│   日志 (Logs)     │  指标 (Metrics)  │  链路追踪 (Traces)     │
│                  │                  │                        │
│  结构化JSON日志   │  RED方法         │  OpenTelemetry         │
│  ELK/Loki存储    │  (Rate/Error/    │  Jaeger展示            │
│  全文检索        │   Duration)      │  请求级追踪             │
│                  │  Prometheus采集   │  跨服务调用链           │
│                  │  Grafana展示      │                        │
└──────────────────┴──────────────────┴────────────────────────┘
```

### 8.3 日志方案

**结构化日志格式**：

```json
{
  "timestamp": "2026-05-21T10:30:00.123Z",
  "level": "INFO",
  "service": "a_stock_backend",
  "trace_id": "abc123",
  "span_id": "def456",
  "user_id": 42,
  "method": "POST",
  "path": "/api/training/tasks",
  "status_code": 200,
  "duration_ms": 150,
  "message": "Training task created"
}
```

**日志采集链路**：

```
应用输出JSON日志 → Docker日志驱动 → Loki (日志存储) → Grafana (查询展示)
```

**日志分级策略**：

| 级别 | 使用场景 | 示例 |
|------|---------|------|
| ERROR | 需要立即处理的异常 | 数据库连接失败、支付回调异常 |
| WARN | 需要关注但不紧急 | 训练任务失败、API响应慢 |
| INFO | 关键业务事件 | 用户注册、模型训练完成、支付成功 |
| DEBUG | 开发调试信息 | SQL查询、请求参数（仅开发环境） |

### 8.4 指标方案

**核心业务指标**：

| 指标名 | 类型 | 说明 |
|--------|------|------|
| `api_request_total` | Counter | API请求总数（按路径/状态码分组） |
| `api_request_duration_seconds` | Histogram | API响应时间分布 |
| `training_task_created_total` | Counter | 训练任务创建数 |
| `training_task_duration_seconds` | Histogram | 训练任务执行时间 |
| `training_task_active_count` | Gauge | 当前活跃训练任务数 |
| `ws_connections_active` | Gauge | WebSocket活跃连接数 |
| `user_registration_total` | Counter | 用户注册数 |
| `payment_order_total` | Counter | 支付订单数（按状态分组） |
| `model_market_transaction_total` | Counter | 模型市场交易数 |

**技术指标**：

| 指标名 | 类型 | 说明 |
|--------|------|------|
| `db_connection_pool_size` | Gauge | 数据库连接池大小 |
| `db_query_duration_seconds` | Histogram | 数据库查询耗时 |
| `redis_cache_hit_rate` | Gauge | Redis缓存命中率 |
| `celery_task_queue_length` | Gauge | Celery任务队列长度 |
| `gpu_utilization_percent` | Gauge | GPU利用率 |
| `gpu_memory_used_bytes` | Gauge | GPU显存使用量 |

**指标采集链路**：

```
应用暴露/metrics → Prometheus (定时采集) → Grafana (仪表盘展示) → AlertManager (告警)
```

### 8.5 链路追踪方案

使用OpenTelemetry实现端到端请求追踪：

```python
# FastAPI中间件：自动为每个请求创建Span
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.instrumentation.redis import RedisInstrumentor

FastAPIInstrumentor.instrument_app(app)
SQLAlchemyInstrumentor().instrument(engine=engine)
RedisInstrumentor().instrument()
```

**追踪场景**：
- 用户发起训练请求 → API层 → 数据查询 → 特征计算 → 模型训练 → 结果存储
- 支付回调 → 订单查询 → 状态更新 → 用户通知
- WebSocket消息 → Redis Pub/Sub → 多实例广播

### 8.6 告警规则

| 告警名 | 条件 | 级别 | 通知方式 |
|--------|------|------|---------|
| API错误率过高 | 5xx比例 > 5% (5min) | P1 | 钉钉+短信 |
| API响应过慢 | P99 > 3s (5min) | P2 | 钉钉 |
| 训练队列积压 | 队列长度 > 50 (10min) | P2 | 钉钉 |
| GPU利用率低 | < 30% (30min) | P3 | 钉钉 |
| 数据库连接池耗尽 | 可用连接 < 2 | P1 | 钉钉+短信 |
| Redis不可用 | 连接失败 (1min) | P1 | 钉钉+短信 |
| 磁盘空间不足 | 使用率 > 85% | P2 | 钉钉 |

---

## 9. 安全加固方案

### 9.1 认证增强

#### 9.1.1 当前问题

| 问题 | 风险 |
|------|------|
| JWT Token有效期7天 | Token泄露后影响窗口大 |
| 无Token刷新机制 | 无法强制用户重新认证 |
| WebSocket无认证 | 任何人可连接ws端点 |
| 密码策略宽松 | 无复杂度要求 |

#### 9.1.2 加固措施

**Token策略**：
- Access Token有效期缩短为30分钟
- 引入Refresh Token，有效期7天，存储在HttpOnly Cookie中
- Refresh Token轮换：每次刷新时颁发新的Refresh Token，旧的立即失效
- Token黑名单：登出时将Token加入Redis黑名单

**密码策略**：
- 最小长度8位
- 必须包含大小写字母和数字
- 密码哈希使用bcrypt（当前已使用passlib[bcrypt]）
- 登录失败5次后锁定账号15分钟

**多因素认证（企业版）**：
- TOTP（基于时间的一次性密码）
- 可选：短信验证码

### 9.2 API限流

#### 9.2.1 限流策略

| 接口分类 | 免费版 | Pro版 | Max版 | 企业版 |
|---------|--------|-------|-------|-------|
| 认证接口 | 10次/分钟 | 10次/分钟 | 10次/分钟 | 20次/分钟 |
| 数据查询 | 30次/分钟 | 60次/分钟 | 300次/分钟 | 不限 |
| 训练提交 | 2次/小时 | 10次/小时 | 30次/小时 | 不限 |
| 预测接口 | 5次/天 | 50次/天 | 不限 | 不限 |
| 社区操作 | 20次/分钟 | 60次/分钟 | 120次/分钟 | 不限 |

#### 9.2.2 实现方案

```python
# 基于Redis的滑动窗口限流
from fastapi import Request, HTTPException

async def rate_limiter(request: Request, user_id: int, endpoint: str, limit: int, window: int):
    """滑动窗口限流中间件

    Args:
        user_id: 用户ID
        endpoint: 接口标识
        limit: 窗口内最大请求数
        window: 窗口大小（秒）
    """
    key = f"ratelimit:{user_id}:{endpoint}"
    now = time.time()
    pipe = redis_client.pipeline()
    pipe.zremrangebyscore(key, 0, now - window)
    pipe.zadd(key, {str(now): now})
    pipe.zcard(key)
    pipe.expire(key, window)
    results = await pipe.execute()
    count = results[2]
    if count > limit:
        raise HTTPException(status_code=429, detail="请求过于频繁，请稍后再试")
```

### 9.3 数据加密

| 数据类型 | 加密方式 | 说明 |
|---------|---------|------|
| 传输层 | TLS 1.3 | Nginx配置SSL证书 |
| 密码存储 | bcrypt | 已实现 |
| 支付密钥 | AES-256-GCM | 数据库中的敏感配置加密存储 |
| JWT签名 | HS256 → RS256 | 升级为非对称签名，私钥仅认证服务持有 |
| 数据库连接 | SSL | PostgreSQL连接启用SSL |
| 备份文件 | AES-256 | 数据库备份文件加密存储 |

### 9.4 CORS加固

```python
# 替换当前的 allow_origins=["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://astock.example.com",  # 生产域名
        "http://localhost:5173",        # 本地开发
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
```

### 9.5 安全检查清单

| 检查项 | 当前状态 | 目标状态 | 优先级 |
|--------|---------|---------|-------|
| SECRET_KEY环境变量化 | ❌ 硬编码 | ✅ 从环境变量读取 | P0 |
| CORS域名白名单 | ❌ 全开放 | ✅ 按环境配置 | P0 |
| WebSocket认证 | ❌ 无认证 | ✅ JWT校验 | P0 |
| API限流 | ❌ 无限流 | ✅ 按用户等级限流 | P1 |
| JWT签名算法升级 | HS256 | RS256 | P1 |
| Refresh Token轮换 | ❌ 无 | ✅ 轮换+黑名单 | P1 |
| 密码复杂度策略 | ❌ 无 | ✅ 强制策略 | P2 |
| 数据库敏感字段加密 | ❌ 明文 | ✅ AES-256 | P2 |
| 安全响应头 | ❌ 缺失 | ✅ CSP/HSTS/X-Frame | P2 |
| 定期安全扫描 | ❌ 无 | ✅ 季度扫描 | P3 |

---

## 10. CI/CD与部署架构

### 10.1 当前部署方式

- Docker Compose单机部署
- 手动构建镜像
- 无自动化测试
- 无CI/CD流水线

### 10.2 目标CI/CD流水线

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  代码提交  │───→│  CI阶段   │───→│  构建阶段  │───→│  部署阶段  │───→│  验证阶段  │
│  (Git Push)│    │  代码检查  │    │  镜像构建  │    │  灰度发布  │    │  冒烟测试  │
│           │    │  单元测试  │    │  镜像推送  │    │  蓝绿部署  │    │  监控验证  │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
```

### 10.3 CI阶段

```yaml
# .github/workflows/ci.yml (示例)
name: CI Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  backend-test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_DB: test_db
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
      redis:
        image: redis:7-alpine
    steps:
      - uses: actions/checkout@v4
      - name: Set up Python 3.11
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - name: Install dependencies
        run: pip install -r backend/requirements.txt
      - name: Lint (ruff)
        run: ruff check backend/
      - name: Type check (mypy)
        run: mypy backend/app/
      - name: Unit tests
        run: pytest backend/tests/ -v --cov=app
      - name: Integration tests
        run: pytest backend/tests/integration/ -v

  frontend-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Set up Node 20
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install dependencies
        run: cd frontend && npm ci
      - name: Lint
        run: cd frontend && npm run lint
      - name: Type check
        run: cd frontend && npx tsc --noEmit
      - name: Unit tests
        run: cd frontend && npm run test
      - name: Build
        run: cd frontend && npm run build
```

### 10.4 容器化架构

```
┌──────────────────────────────────────────────────────────────────┐
│                      Kubernetes 集群                              │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  Ingress     │  │  Frontend   │  │  Backend    │              │
│  │  Controller  │──→│  Pods ×2    │──→│  Pods ×3    │              │
│  │  (Nginx/TLS) │  │  (React SPA)│  │  (FastAPI)  │              │
│  └─────────────┘  └─────────────┘  └──────┬──────┘              │
│                                            │                     │
│                    ┌─────────────┐  ┌──────┴──────┐              │
│                    │  Celery     │  │  Redis      │              │
│                    │  Workers ×2 │  │  Sentinel   │              │
│                    └─────────────┘  └──────┬──────┘              │
│                                            │                     │
│                    ┌─────────────┐  ┌──────┴──────┐              │
│                    │  Prometheus │  │  PostgreSQL │              │
│                    │  + Grafana  │  │  主从复制    │              │
│                    └─────────────┘  └─────────────┘              │
└──────────────────────────────────────────────────────────────────┘
```

### 10.5 部署策略

#### 10.5.1 蓝绿部署

```
                    ┌──────────────┐
                    │   Ingress     │
                    └──────┬───────┘
                           │
              ┌────────────┴────────────┐
              │                         │
     ┌────────┴───────┐      ┌─────────┴──────┐
     │  Blue (当前版本) │      │  Green (新版本)  │
     │  v1.2.0        │      │  v1.3.0        │
     │  接收100%流量   │      │  接收0%流量     │
     └────────────────┘      └────────────────┘

步骤：
1. 部署Green版本，不切流量
2. 对Green版本执行冒烟测试
3. 逐步将流量从Blue切到Green（10% → 50% → 100%）
4. 确认Green稳定后，下线Blue版本
5. 如有问题，一键切回Blue
```

#### 10.5.2 灰度发布（Canary）

```yaml
# Kubernetes Canary Deployment 示例
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  annotations:
    nginx.ingress.kubernetes.io/canary: "true"
    nginx.ingress.kubernetes.io/canary-weight: "10"  # 10%流量到新版本
spec:
  rules:
    - http:
        paths:
          - path: /
            backend:
              service:
                name: backend-canary
                port:
                  number: 8000
```

### 10.6 环境管理

| 环境 | 用途 | 部署方式 | 数据 |
|------|------|---------|------|
| 开发环境 (dev) | 开发调试 | 本地Docker Compose | 脱敏样本数据 |
| 测试环境 (staging) | 集成测试、QA | K8s（小规格） | 脱敏样本数据 |
| 预发环境 (pre-prod) | 发布前验证 | K8s（生产同规格） | 生产数据镜像 |
| 生产环境 (prod) | 线上服务 | K8s（多副本+HPA） | 生产数据 |

---

## 11. 性能基准与优化目标

### 11.1 当前性能基线（估算）

| 指标 | 当前值 | 测量方式 |
|------|-------|---------|
| 首屏加载时间 (FCP) | ~3s | 估算（SPA + Ant Design全量引入） |
| API平均响应时间 | ~200ms | 估算（SQLite + 无缓存） |
| API P99响应时间 | ~2s | 估算（大数据量查询） |
| 训练速度 (LSTM, 1000样本) | ~60s | CPU训练 |
| 训练速度 (XGBoost, 10000样本) | ~5s | CPU训练 |
| WebSocket消息延迟 | ~500ms | 估算（30s轮询间隔） |
| 数据库查询 (股票列表) | ~50ms | 估算（无索引优化） |

### 11.2 优化目标

| 指标 | 当前值 | 目标值 | 优化手段 |
|------|-------|-------|---------|
| 首屏加载时间 (FCP) | ~3s | < 1.5s | 路由懒加载 + Ant Design按需引入 + CDN |
| 首次内容绘制 (LCP) | ~4s | < 2.5s | 关键CSS内联 + 图片优化 + 预加载 |
| 累积布局偏移 (CLS) | 未知 | < 0.1 | 骨架屏 + 固定尺寸容器 |
| API平均响应时间 | ~200ms | < 100ms | Redis缓存 + 索引优化 + 连接池 |
| API P99响应时间 | ~2s | < 500ms | 慢查询优化 + 分页 + 缓存 |
| LSTM训练 (1000样本) | ~60s | ~10s | GPU训练 (T4) |
| XGBoost训练 (10000样本) | ~5s | ~2s | 并行化 + 参数优化 |
| WebSocket消息延迟 | ~500ms | < 100ms | Redis Pub/Sub + 频道订阅 |
| 数据库查询 (股票列表) | ~50ms | < 10ms | Redis缓存 + 索引 |
| 前端Bundle大小 | ~2MB (估算) | < 500KB (gzip) | 代码分割 + Tree Shaking |

### 11.3 前端优化方案

**路由懒加载**：

```typescript
// 当前：静态导入所有页面
import Dashboard from './pages/Dashboard';
import ModelBuilder from './pages/ModelBuilder';

// 优化后：路由级代码分割
const Dashboard = lazy(() => import('./pages/Dashboard'));
const ModelBuilder = lazy(() => import('./pages/ModelBuilder'));
```

**Ant Design按需引入**：

```typescript
// vite.config.ts 配置
export default defineConfig({
  plugins: [
    react(),
    // Ant Design 按需加载（Vite已原生支持tree-shaking）
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'antd': ['antd'],
          'charts': ['@ant-design/charts'],
          'vendor': ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});
```

**资源优化**：
- 图片：WebP格式 + 懒加载
- 字体：子集化（仅包含中文常用字+英文）
- SVG：内联关键图标，非关键图标懒加载

### 11.4 后端优化方案

**数据库查询优化**：
- N+1查询检测与消除（SQLAlchemy的`joinedload`/`selectinload`）
- 大列表查询强制分页
- 热点查询结果缓存

**异步IO优化**：
- 数据获取（akshare/baostock）使用`aiohttp`异步请求
- 批量操作使用`asyncio.gather`并发执行

**训练优化**：
- GPU训练：PyTorch CUDA加速
- sklearn模型：`n_jobs=-1`利用多核
- 数据预处理：pandas向量化操作替代循环

---

## 12. 技术选型对比表

### 12.1 数据库

| 候选 | 优势 | 劣势 | 结论 |
|------|------|------|------|
| **PostgreSQL** | MVCC高并发、JSONB、丰富扩展、成熟生态 | 运维复杂度高于SQLite | ✅ 推荐 |
| MySQL | 社区大、运维工具丰富 | JSON支持弱于PG、扩展性差 | 备选 |
| TiDB | 分布式、兼容MySQL | 运维复杂、资源消耗大 | 过度设计 |

### 12.2 缓存

| 候选 | 优势 | 劣势 | 结论 |
|------|------|------|------|
| **Redis** | 丰富数据结构、Pub/Sub、成熟稳定 | 内存成本 | ✅ 推荐（已在requirements中） |
| Memcached | 简单高效 | 无数据结构、无持久化 | 不适合 |
| DragonflyDB | Redis兼容、多线程性能高 | 较新、社区小 | 观察 |

### 12.3 任务队列

| 候选 | 优势 | 劣势 | 结论 |
|------|------|------|------|
| **Celery + Redis** | Python生态标准、功能完善、社区大 | 配置复杂、监控需额外工具 | ✅ 推荐 |
| Dramatiq | API简洁、文档好 | 社区小、功能不如Celery | 备选 |
| Huey | 轻量级、简单 | 功能有限、不适合大规模 | 不适合 |
| RQ (Redis Queue) | 极简 | 无定时任务、无任务优先级 | 不适合 |

### 12.4 前端状态管理

| 候选 | 优势 | 劣势 | 结论 |
|------|------|------|------|
| **Zustand (Slice模式)** | 轻量、灵活、已在用 | 需自行组织架构 | ✅ 推荐（优化现有方案） |
| Redux Toolkit | 成熟、中间件丰富 | 模板代码多、学习曲线陡 | 过重 |
| Jotai | 原子化、极简 | 大型项目组织困难 | 不适合当前规模 |
| MobX | 响应式、自动化 | 魔法多、调试困难 | 不适合 |

### 12.5 API类型安全

| 候选 | 优势 | 劣势 | 结论 |
|------|------|------|------|
| **orval + Zod** | OpenAPI驱动生成 + 运行时校验 | 需维护OpenAPI规范 | ✅ 推荐 |
| openapi-typescript | 仅生成类型，轻量 | 无运行时校验、无Client生成 | 不够 |
| tRPC | 端到端类型安全 | 需后端改用TypeScript | 不适合（后端Python） |
| hand-written types | 零依赖 | 手动维护、易出错 | 当前方案，需升级 |

### 12.6 微前端

| 候选 | 优势 | 劣势 | 结论 |
|------|------|------|------|
| **Vite Module Federation** | 与Vite一致、运行时加载 | 较新、文档少 | ✅ 未来推荐 |
| qiankun | 成熟稳定、样式隔离 | 通信重、需改造子应用 | 备选 |
| single-spa | 底层灵活 | 配置复杂、需自行实现隔离 | 过于底层 |
| iframe | 完全隔离 | UX差、性能差 | 不推荐 |

### 12.7 监控

| 候选 | 优势 | 劣势 | 结论 |
|------|------|------|------|
| **Prometheus + Grafana + Loki** | 云原生标准、社区大、功能完善 | 组件多、学习曲线 | ✅ 推荐 |
| Datadog | 一体化、开箱即用 | 商业产品、成本高 | 企业版可选 |
| Elastic Stack (ELK) | 全文搜索强 | 资源消耗大 | 备选 |
| SkyWalking | APM专业 | Java生态为主 | 不适合 |

### 12.8 容器编排

| 候选 | 优势 | 劣势 | 结论 |
|------|------|------|------|
| **Kubernetes** | 行业标准、弹性伸缩、生态丰富 | 学习曲线陡、运维复杂 | ✅ 长期推荐 |
| Docker Swarm | 简单、与Compose兼容 | 功能有限、社区萎缩 | 短期过渡 |
| Docker Compose | 最简单 | 单机、无弹性 | 当前方案 |

### 12.9 CI/CD

| 候选 | 优势 | 劣势 | 结论 |
|------|------|------|------|
| **GitHub Actions** | 与GitHub深度集成、免费额度充足 | 绑定GitHub | ✅ 推荐 |
| GitLab CI | 功能强大、自托管 | 需自建GitLab | 备选 |
| Jenkins | 插件丰富、灵活 | 维护成本高、UI老旧 | 不推荐 |

---

## 附录

### A. 架构演进全景图

```
Phase 1 (M1-M3): 基础加固
┌──────────────────────────────────────────────────────────────┐
│  ✅ SQLite → PostgreSQL                                      │
│  ✅ SECRET_KEY环境变量化                                      │
│  ✅ CORS白名单                                                │
│  ✅ Alembic数据库迁移                                         │
│  ✅ Redis缓存层                                               │
└──────────────────────────────────────────────────────────────┘

Phase 2 (M4-M6): 核心重构
┌──────────────────────────────────────────────────────────────┐
│  ✅ Celery + Redis任务队列                                    │
│  ✅ WebSocket分布式改造                                        │
│  ✅ 前端Zustand Slice重构                                     │
│  ✅ API类型安全 (orval + Zod)                                 │
│  ✅ API限流                                                   │
└──────────────────────────────────────────────────────────────┘

Phase 3 (M7-M12): 生产级提升
┌──────────────────────────────────────────────────────────────┐
│  ✅ 监控体系 (Prometheus + Grafana + Loki)                    │
│  ✅ 链路追踪 (OpenTelemetry + Jaeger)                         │
│  ✅ CI/CD流水线 (GitHub Actions)                              │
│  ✅ Kubernetes部署                                            │
│  ✅ 蓝绿/灰度发布                                             │
│  ✅ 安全加固 (JWT升级、数据加密、MFA)                           │
└──────────────────────────────────────────────────────────────┘
```

### B. 技术债清偿优先级

| 优先级 | 技术债 | 对应章节 | 预计工时 |
|--------|--------|---------|---------|
| P0 | TD-01: training_progress全局字典 | §5 任务队列 | 5天 |
| P0 | TD-02: SQLite并发限制 | §6 数据库优化 | 5天 |
| P0 | TD-03: CORS全开放 | §9 安全加固 | 0.5天 |
| P0 | TD-04: SECRET_KEY硬编码 | §9 安全加固 | 0.5天 |
| P1 | TD-05: 前端API层any类型 | §3 类型安全 | 5天 |
| P1 | TD-06: Zustand store碎片化 | §2 状态管理 | 8天 |
| P1 | TD-07: 无数据库迁移 | §6 数据库优化 | 1天 |
| P1 | TD-08: 无API限流 | §9 安全加固 | 2天 |
| P2 | TD-09: WebSocket无认证 | §7 实时架构 | 1天 |
| P2 | TD-10: 无结构化日志 | §8 监控 | 3天 |
| P2 | TD-11: 模型文件本地存储 | §10 部署架构 | 2天 |
| P2 | TD-12: 无自动化测试 | §10 CI/CD | 5天 |

### C. 依赖版本规划

| 依赖 | 当前版本 | 目标版本 | 升级理由 |
|------|---------|---------|---------|
| Python | 3.11+ | 3.12 | 性能提升、新语法特性 |
| FastAPI | 0.109 | 0.115+ | 安全修复、新功能 |
| SQLAlchemy | 2.0.25 | 2.0.x最新 | Bug修复 |
| React | 18.2 | 19.x | 新特性（Server Components等） |
| Node.js | 20 | 22 LTS | 长期支持 |
| PostgreSQL | - | 16 | 最新稳定版 |
| Redis | 7 | 7.x最新 | 稳定版 |
