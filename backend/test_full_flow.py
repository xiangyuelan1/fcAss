"""
全流程端到端测试
选股 → 获取数据 → 选择指标 → 搭建模型 → 训练 → 回测 → 预测
"""
import requests
import json

BASE = 'http://localhost:8000/api'

def step(num, title):
    print(f"\n{'='*60}")
    print(f"步骤{num}: {title}")
    print(f"{'='*60}")

# 先登录获取token
step(0, "登录获取Token")
r = requests.post(f'{BASE}/auth/token', data={'username': 'testuser2', 'password': 'test123456'})
if r.status_code != 200:
    print(f"登录失败: {r.text}")
    exit(1)
token = r.json().get('access_token')
headers = {'Authorization': f'Bearer {token}'}
print(f"Token: {token[:20]}...")

# 步骤1: 获取股票数据
step(1, "获取股票数据（600519 贵州茅台）")
r = requests.post(f'{BASE}/data/stocks/fetch', json={'code': '600519'}, headers=headers)
result = r.json()
print(f"成功: {result.get('success')}")
print(f"消息: {result.get('message')}")
stock = result.get('stock', {})
print(f"股票: {stock.get('code')} {stock.get('name')} {stock.get('exchange')}")

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

# 步骤4: 创建模型
step(4, "创建预测模型")
model_data = {
    'name': '茅台LSTM预测模型',
    'description': '基于LSTM的贵州茅台股价预测模型',
    'config': {
        'model_type': 'lstm',
        'model_params': {
            'sequence_length': 20,
            'hidden_size': 64,
            'num_layers': 2,
            'dropout': 0.2,
            'learning_rate': 0.001,
            'epochs': 50,
            'batch_size': 32,
        },
        'features': ['close', 'volume', 'ma_5', 'ma_20', 'rsi_14', 'macd'],
        'feature_config': {
            'ma_5': {'period': 5},
            'ma_20': {'period': 20},
            'rsi_14': {'period': 14},
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
    model_id = None

# 步骤5: 查看模型列表
step(5, "查看模型列表")
r = requests.get(f'{BASE}/models', headers=headers)
models = r.json()
print(f"模型数量: {len(models)}")
for m in models:
    print(f"  ID={m.get('id')} {m.get('name')} type={m.get('model_type')} status={m.get('status')}")

# 步骤6: 创建训练任务
step(6, "创建训练任务")
if model_id:
    r = requests.post(f'{BASE}/training/tasks', json={
        'model_id': model_id,
        'config': {},
    }, headers=headers)
    print(f"状态码: {r.status_code}")
    if r.status_code == 200:
        task = r.json()
        task_id = task.get('id')
        print(f"任务ID: {task_id}")
        print(f"任务状态: {task.get('status')}")
    else:
        print(f"创建失败: {r.text[:500]}")
        task_id = None
else:
    task_id = None
    print("跳过（模型未创建）")

# 步骤7: 查看训练任务
step(7, "查看训练任务列表")
r = requests.get(f'{BASE}/training/tasks', headers=headers)
tasks = r.json()
if isinstance(tasks, list):
    print(f"任务数量: {len(tasks)}")
    for t in tasks:
        print(f"  ID={t.get('id')} model={t.get('model_id')} status={t.get('status')}")
elif isinstance(tasks, dict):
    print(f"响应: {json.dumps(tasks, indent=2, ensure_ascii=False)[:500]}")

# 步骤8: 查看回测结果
step(8, "查看回测结果")
r = requests.get(f'{BASE}/backtest/results', headers=headers)
results = r.json()
print(f"回测结果: {json.dumps(results, indent=2, ensure_ascii=False)[:500] if isinstance(results, (dict, list)) else results}")

print(f"\n{'='*60}")
print("全流程测试完成")
print(f"{'='*60}")
