"""
端到端全流程测试：选股 → 获取数据 → 选指标 → 搭建模型 → 训练 → 回测 → 预测
"""
import requests
import time
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

BASE = 'http://localhost:8000/api'

def step(num, title):
    print(f"\n{'='*60}")
    print(f"  步骤 {num}: {title}")
    print(f"{'='*60}")

def get_token():
    """登录获取token"""
    r = requests.post(f'{BASE}/auth/token', data={
        'username': 'admin',
        'password': 'admin123'
    })
    if r.status_code == 200:
        return r.json().get('access_token')
    # 尝试注册
    requests.post(f'{BASE}/auth/register', json={
        'username': 'admin',
        'password': 'admin123'
    })
    r = requests.post(f'{BASE}/auth/token', data={
        'username': 'admin',
        'password': 'admin123'
    })
    return r.json().get('access_token')

token = get_token()
if not token:
    print("登录失败，退出")
    sys.exit(1)

headers = {'Authorization': f'Bearer {token}'}
print(f"登录成功，token: {token[:20]}...")

# 步骤1: 获取股票数据
step(1, "获取股票数据（600519 贵州茅台）")
r = requests.post(f'{BASE}/data/stocks/fetch', json={'code': '600519'}, headers=headers)
result = r.json()
print(f"状态码: {r.status_code}")
stock = result.get('stock', {})
print(f"股票: {stock.get('code')} {stock.get('name')} {stock.get('exchange')}")
print(f"价格数据条数: {result.get('price_count', 0)}")

# 步骤2: 查看可用特征指标
step(2, "查看可用特征指标")
r = requests.get(f'{BASE}/features/indicators', headers=headers)
indicators = r.json()
print(f"指标数量: {len(indicators) if isinstance(indicators, list) else 'N/A'}")
if isinstance(indicators, list):
    for ind in indicators[:5]:
        print(f"  {ind.get('key')}: {ind.get('name')} ({ind.get('category')})")
    if len(indicators) > 5:
        print(f"  ... 共 {len(indicators)} 个指标")

# 步骤3: 查看可用模型类型
step(3, "查看可用模型类型")
r = requests.get(f'{BASE}/models/types/available', headers=headers)
result = r.json()
types = result.get('types', [])
print(f"模型类型数量: {len(types)}")
for t in types:
    print(f"  {t.get('key')}: {t.get('name')} - {t.get('description')}")

# 步骤4: 创建模型（使用RandomForest，训练最快）
step(4, "创建预测模型（RandomForest - 训练速度快）")
model_data = {
    'name': '茅台随机森林预测模型',
    'description': '基于RandomForest的贵州茅台股价预测模型',
    'config': {
        'model_type': 'randomforest',
        'model_params': {
            'n_estimators': 100,
            'max_depth': 10,
        },
        'features': ['sma', 'rsi', 'macd', 'boll'],
        'feature_config': {
            'sma': {'period': 5},
            'rsi': {'period': 14},
            'macd': {'fast': 12, 'slow': 26, 'signal': 9},
            'boll': {'period': 20, 'std_dev': 2.0},
        },
        'target': 'next_day_direction',
        'target_config': {},
        'stock_codes': ['600519'],
        'train_date_range': {
            'start': '2023-01-01',
            'end': '2025-12-31',
        },
    },
}
r = requests.post(f'{BASE}/models', json=model_data, headers=headers)
print(f"状态码: {r.status_code}")
if r.status_code == 200:
    model = r.json()
    model_id = model.get('id')
    print(f"模型ID: {model_id}")
    print(f"模型名称: {model.get('name')}")
    print(f"模型类型: {model.get('model_type')}")
    print(f"状态: {model.get('status')}")
else:
    print(f"创建失败: {r.text[:500]}")
    sys.exit(1)

# 步骤5: 创建训练任务
step(5, "创建训练任务")
r = requests.post(f'{BASE}/training/tasks', json={
    'model_id': model_id,
    'config': {},
}, headers=headers)
print(f"状态码: {r.status_code}")
if r.status_code == 200:
    task = r.json()
    task_id = task.get('id')
    print(f"任务ID: {task_id}")
    print(f"状态: {task.get('status')}")
else:
    print(f"创建失败: {r.text[:500]}")
    sys.exit(1)

# 步骤6: 等待训练完成
step(6, "等待训练完成（轮询进度）")
max_wait = 120  # 最多等2分钟
start_time = time.time()
while time.time() - start_time < max_wait:
    r = requests.get(f'{BASE}/training/tasks/{task_id}', headers=headers)
    task = r.json()
    status = task.get('status')
    
    # 获取进度
    r2 = requests.get(f'{BASE}/training/tasks/{task_id}/progress', headers=headers)
    progress = r2.json()
    stage = progress.get('stage', '')
    pct = progress.get('progress', 0)
    
    print(f"  状态: {status}, 阶段: {stage}, 进度: {pct}%")
    
    if status == 'completed':
        print(f"\n  训练完成！")
        metrics = task.get('metrics', {})
        for k, v in metrics.items():
            if isinstance(v, (int, float)):
                print(f"  {k}: {v:.6f}")
        break
    elif status == 'failed':
        print(f"\n  训练失败: {task.get('error_message')}")
        sys.exit(1)
    
    time.sleep(3)
else:
    print("训练超时，退出")
    sys.exit(1)

# 步骤7: 执行回测
step(7, "执行回测")
r = requests.post(f'{BASE}/backtest/run', json={
    'task_id': task_id,
    'start_date': '2024-01-01',
    'end_date': '2025-12-31',
    'initial_capital': 100000,
}, headers=headers)
print(f"状态码: {r.status_code}")
if r.status_code == 200:
    backtest = r.json()
    backtest_id = backtest.get('id')
    print(f"回测ID: {backtest_id}")
    
    # 等待回测完成
    print("  等待回测执行...")
    time.sleep(5)
    
    r = requests.get(f'{BASE}/backtest/results/{backtest_id}', headers=headers)
    result = r.json()
    print(f"  总收益率: {(result.get('total_return') or 0) * 100:.2f}%")
    print(f"  年化收益: {(result.get('annual_return') or 0) * 100:.2f}%")
    print(f"  最大回撤: {(result.get('max_drawdown') or 0) * 100:.2f}%")
    print(f"  夏普比率: {result.get('sharpe_ratio') or 0:.2f}")
    print(f"  交易次数: {result.get('trades_count', 0) or 0}")
    print(f"  胜率: {(result.get('win_rate') or 0) * 100:.1f}%")
else:
    print(f"回测创建失败: {r.text[:500]}")

# 步骤8: 智能预测
step(8, "智能预测")
r = requests.post(f'{BASE}/prediction/predict', json={
    'task_id': task_id,
    'stock_code': '600519',
}, headers=headers)
print(f"状态码: {r.status_code}")
if r.status_code == 200:
    pred = r.json()
    print(f"  股票: {pred.get('stock_code')}")
    print(f"  预测值: {pred.get('prediction')}")
    print(f"  预测方向: {pred.get('prediction_label')}")
    print(f"  最新收盘价: {pred.get('latest_data', {}).get('close')}")
else:
    print(f"预测失败: {r.text[:500]}")

# 步骤9: 批量预测
step(9, "批量预测")
r = requests.post(f'{BASE}/prediction/batch-predict', json={
    'task_id': task_id,
    'stock_codes': ['600519'],
}, headers=headers)
print(f"状态码: {r.status_code}")
if r.status_code == 200:
    result = r.json()
    predictions = result.get('predictions', [])
    for p in predictions:
        if 'error' in p:
            print(f"  {p.get('stock_code')}: 错误 - {p.get('error')}")
        else:
            print(f"  {p.get('stock_code')}: 预测={p.get('prediction')}, 方向={p.get('prediction_label')}")
else:
    print(f"批量预测失败: {r.text[:500]}")

print(f"\n{'='*60}")
print("  全流程测试完成！")
print(f"{'='*60}")
