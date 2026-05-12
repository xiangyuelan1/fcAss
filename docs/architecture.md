# A股预测训练平台 - 系统架构设计

## 1. 系统概述

本平台是一个面向A股市场的机器学习模型训练平台，允许用户DIY构建、训练和回测自己的预测模型。

## 2. 技术栈

- **后端**: Python + FastAPI
- **前端**: React + TypeScript + Ant Design
- **数据库**: SQLite (MVP版本) / PostgreSQL (生产环境)
- **机器学习**: PyTorch / scikit-learn
- **数据处理**: pandas, numpy, akshare (A股数据)

## 3. 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                        前端层 (React)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ 数据管理  │  │ 特征工程  │  │ 模型构建  │  │ 训练回测  │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      API层 (FastAPI)                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ 数据API   │  │ 特征API   │  │ 模型API   │  │ 训练API   │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      服务层 (Services)                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ 数据服务  │  │ 特征服务  │  │ 模型服务  │  │ 训练服务  │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      数据层 (Data Layer)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │  SQLite  │  │  缓存    │  │ 文件存储  │                  │
│  └──────────┘  └──────────┘  └──────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

## 4. 核心模块

### 4.1 数据管理模块
- A股历史数据获取 (使用akshare)
- 数据缓存和存储
- 股票列表管理
- 数据更新任务

### 4.2 特征工程模块
- 技术指标计算 (MA, MACD, RSI, KDJ等)
- 自定义特征公式
- 特征选择和降维
- 数据标准化/归一化

### 4.3 模型构建模块
- 可视化模型构建器
- 支持多种模型类型:
  - LSTM/GRU (时序预测)
  - XGBoost/LightGBM (梯度提升)
  - RandomForest (随机森林)
  - MLP (多层感知机)
- 超参数配置
- 模型结构可视化

### 4.4 训练与回测模块
- 模型训练引擎
- 回测框架
- 性能评估指标
- 结果可视化

## 5. 数据库设计

### 5.1 数据表结构

```sql
-- 股票基础信息表
CREATE TABLE stocks (
    id INTEGER PRIMARY KEY,
    code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    exchange VARCHAR(10),
    industry VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 历史数据表
CREATE TABLE stock_prices (
    id INTEGER PRIMARY KEY,
    stock_code VARCHAR(20) NOT NULL,
    date DATE NOT NULL,
    open DECIMAL(10,4),
    high DECIMAL(10,4),
    low DECIMAL(10,4),
    close DECIMAL(10,4),
    volume BIGINT,
    amount DECIMAL(15,2),
    UNIQUE(stock_code, date)
);

-- 用户模型表
CREATE TABLE user_models (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    model_type VARCHAR(50) NOT NULL,
    model_config JSON NOT NULL,
    features JSON NOT NULL,
    target VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 训练任务表
CREATE TABLE training_tasks (
    id INTEGER PRIMARY KEY,
    model_id INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL,
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    config JSON NOT NULL,
    metrics JSON,
    model_path VARCHAR(255),
    error_message TEXT
);

-- 回测结果表
CREATE TABLE backtest_results (
    id INTEGER PRIMARY KEY,
    task_id INTEGER NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    initial_capital DECIMAL(15,2),
    final_capital DECIMAL(15,2),
    total_return DECIMAL(10,4),
    annual_return DECIMAL(10,4),
    max_drawdown DECIMAL(10,4),
    sharpe_ratio DECIMAL(10,4),
    trades_count INTEGER,
    results_data JSON
);
```

## 6. API设计

### 6.1 数据API
- `GET /api/stocks` - 获取股票列表
- `GET /api/stocks/{code}/prices` - 获取股票历史价格
- `POST /api/stocks/sync` - 同步股票数据

### 6.2 特征API
- `GET /api/features/indicators` - 获取可用技术指标列表
- `POST /api/features/calculate` - 计算特征
- `GET /api/features/preview` - 预览特征数据

### 6.3 模型API
- `GET /api/models` - 获取用户模型列表
- `POST /api/models` - 创建新模型
- `GET /api/models/{id}` - 获取模型详情
- `PUT /api/models/{id}` - 更新模型
- `DELETE /api/models/{id}` - 删除模型

### 6.4 训练API
- `POST /api/training/tasks` - 创建训练任务
- `GET /api/training/tasks` - 获取训练任务列表
- `GET /api/training/tasks/{id}` - 获取任务详情
- `POST /api/training/tasks/{id}/cancel` - 取消训练任务

### 6.5 回测API
- `POST /api/backtest` - 执行回测
- `GET /api/backtest/{id}` - 获取回测结果
- `GET /api/backtest/{id}/trades` - 获取交易记录
- `GET /api/backtest/{id}/equity` - 获取权益曲线

## 7. 项目目录结构

```
a_stock_trainer/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   ├── data.py
│   │   │   ├── features.py
│   │   │   ├── models.py
│   │   │   ├── training.py
│   │   │   └── backtest.py
│   │   ├── core/
│   │   │   ├── __init__.py
│   │   │   ├── config.py
│   │   │   └── database.py
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   ├── stock.py
│   │   │   ├── user_model.py
│   │   │   └── training.py
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── data_service.py
│   │   │   ├── feature_service.py
│   │   │   ├── model_service.py
│   │   │   ├── training_service.py
│   │   │   └── backtest_service.py
│   │   └── utils/
│   │       ├── __init__.py
│   │       ├── indicators.py
│   │       └── data_fetcher.py
│   ├── requirements.txt
│   └── run.py
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── store/
│   │   ├── types/
│   │   └── utils/
│   ├── package.json
│   └── tsconfig.json
├── docs/
└── README.md
```
