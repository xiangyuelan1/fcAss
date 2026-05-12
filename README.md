# A股预测训练平台

一个面向A股市场的机器学习模型训练平台，允许用户DIY构建、训练和回测自己的预测模型。

## 功能特性

### 核心功能
- **数据管理**: 自动同步A股历史数据，支持多股票数据管理
- **特征工程**: 提供丰富的技术指标（MA、MACD、RSI、KDJ、BOLL等），支持自定义参数
- **模型构建**: 可视化模型构建器，支持多种模型类型
  - 深度学习: LSTM、GRU、MLP
  - 集成学习: XGBoost、LightGBM、RandomForest
- **模型训练**: 异步训练任务，实时进度监控
- **回测分析**: 完整的回测框架，支持多种评估指标

### 支持的模型类型
| 模型类型 | 说明 | 适用场景 |
|---------|------|---------|
| LSTM | 长短期记忆网络 | 时序预测 |
| GRU | 门控循环单元 | 时序预测 |
| XGBoost | 极端梯度提升 | 分类/回归 |
| LightGBM | 轻量级梯度提升 | 分类/回归 |
| RandomForest | 随机森林 | 分类/回归 |
| MLP | 多层感知机 | 通用预测 |

### 技术指标
- **趋势指标**: SMA、EMA、MACD
- **震荡指标**: RSI、KDJ、CCI
- **波动指标**: BOLL、ATR
- **成交量指标**: Volume_SMA、OBV
- **价格特征**: Returns、Volatility

## 技术栈

### 后端
- **框架**: FastAPI (Python)
- **数据库**: SQLite (开发) / PostgreSQL (生产)
- **机器学习**: PyTorch、scikit-learn、XGBoost、LightGBM
- **数据获取**: akshare (A股数据)

### 前端
- **框架**: React 18 + TypeScript
- **UI组件**: Ant Design 5
- **状态管理**: Zustand
- **图表**: @ant-design/charts
- **构建工具**: Vite

## 项目结构

```
a_stock_trainer/
├── backend/                 # 后端代码
│   ├── app/
│   │   ├── api/            # API路由
│   │   ├── core/           # 核心配置
│   │   ├── models/         # 数据模型
│   │   ├── services/       # 业务逻辑
│   │   └── main.py         # 应用入口
│   ├── requirements.txt
│   └── run.py
├── frontend/               # 前端代码
│   ├── src/
│   │   ├── components/     # 组件
│   │   ├── pages/          # 页面
│   │   ├── services/       # API服务
│   │   ├── store/          # 状态管理
│   │   └── types/          # 类型定义
│   ├── package.json
│   └── vite.config.ts
└── docs/                   # 文档
```

## 快速开始

### 环境要求
- Python 3.8+
- Node.js 16+
- SQLite (内置)

### 安装依赖

1. **克隆项目**
```bash
git clone <repository-url>
cd a_stock_trainer
```

2. **安装后端依赖**
```bash
cd backend
pip install -r requirements.txt
```

3. **安装前端依赖**
```bash
cd ../frontend
npm install
```

### 启动服务

1. **启动后端服务**
```bash
cd backend
python run.py
```
后端服务将在 http://localhost:8000 启动
API文档: http://localhost:8000/docs

2. **启动前端服务**
```bash
cd frontend
npm run dev
```
前端服务将在 http://localhost:3000 启动

### 使用流程

1. **数据准备**
   - 进入"数据管理"页面
   - 点击"同步股票列表"获取A股列表
   - 选择股票同步历史价格数据

2. **特征工程**
   - 进入"特征工程"页面
   - 选择股票和技术指标
   - 配置指标参数并预览

3. **构建模型**
   - 进入"模型管理"页面
   - 点击"创建模型"
   - 按向导配置模型参数、特征、训练数据

4. **训练模型**
   - 在模型列表点击"训练"
   - 或在"训练任务"页面创建训练任务
   - 监控训练进度

5. **回测分析**
   - 训练完成后进入"回测分析"
   - 执行回测验证策略效果
   - 查看收益曲线和交易记录

## API文档

启动后端服务后访问: http://localhost:8000/docs

### 主要API端点

#### 数据管理
- `GET /api/data/stocks` - 获取股票列表
- `POST /api/data/stocks/sync` - 同步股票列表
- `GET /api/data/stocks/{code}/prices` - 获取历史价格

#### 特征工程
- `GET /api/features/indicators` - 获取可用指标
- `POST /api/features/calculate` - 计算特征
- `POST /api/features/preview` - 预览特征

#### 模型管理
- `GET /api/models` - 获取模型列表
- `POST /api/models` - 创建模型
- `GET /api/models/{id}` - 获取模型详情
- `PUT /api/models/{id}` - 更新模型

#### 训练任务
- `GET /api/training/tasks` - 获取任务列表
- `POST /api/training/tasks` - 创建训练任务
- `GET /api/training/tasks/{id}/progress` - 获取训练进度

#### 回测分析
- `POST /api/backtest/run` - 执行回测
- `GET /api/backtest/results` - 获取回测结果

## 配置说明

### 后端配置
编辑 `backend/app/core/config.py`:

```python
# 数据库配置
DATABASE_URL = "sqlite:///./a_stock_trainer.db"

# 数据存储路径
DATA_DIR = "./data"
MODEL_DIR = "./models"

# 服务器配置
HOST = "0.0.0.0"
PORT = 8000
```

### 前端配置
编辑 `frontend/vite.config.ts`:

```typescript
server: {
  port: 3000,
  proxy: {
    '/api': {
      target: 'http://localhost:8000',
      changeOrigin: true,
    },
  },
}
```

## 开发计划

### 已实现 (MVP)
- [x] 基础架构搭建
- [x] 数据获取和管理
- [x] 特征工程工具
- [x] 模型构建器
- [x] 模型训练引擎
- [x] 回测框架
- [x] Web界面

### 待实现
- [ ] 用户认证系统
- [ ] 模型部署和实时预测
- [ ] 高级回测策略
- [ ] 模型性能对比
- [ ] 数据可视化增强
- [ ] 分布式训练支持

## 注意事项

1. **数据安全**: 本项目仅供学习和研究使用，投资有风险，入市需谨慎
2. **数据更新**: A股数据需要定期同步更新
3. **模型风险**: 历史表现不代表未来收益，模型预测仅供参考
4. **性能优化**: 大规模数据训练建议使用更高配置的服务器

## 许可证

MIT License

## 贡献

欢迎提交Issue和Pull Request

## 联系方式

如有问题或建议，欢迎联系项目维护者
