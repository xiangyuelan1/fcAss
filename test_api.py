"""
完整API测试脚本
"""
import requests
import json
import time

BASE_URL = "http://localhost:8000/api"

def print_section(title):
    print(f"\n{'='*60}")
    print(f" {title}")
    print(f"{'='*60}")

def print_result(success, message):
    symbol = "✓" if success else "✗"
    print(f"  {symbol} {message}")

def test_health():
    """测试健康检查"""
    print_section("1. 健康检查")
    try:
        r = requests.get("http://localhost:8000/health", timeout=5)
        if r.status_code == 200:
            print_result(True, f"后端运行中: {r.json()}")
            return True
        else:
            print_result(False, f"HTTP {r.status_code}")
            return False
    except Exception as e:
        print_result(False, f"无法连接: {e}")
        return False

def test_auth():
    """测试认证功能"""
    print_section("2. 用户认证")
    
    # 注册
    username = f"test_{int(time.time())}"
    print(f"\n  测试账号: {username}")
    
    try:
        r = requests.post(f"{BASE_URL}/auth/register", json={
            "username": username,
            "email": f"{username}@test.com",
            "password": "test123456"
        })
        if r.status_code == 200:
            print_result(True, "用户注册成功")
        else:
            print_result(False, f"注册失败: {r.text[:100]}")
            return False, None, None
    except Exception as e:
        print_result(False, f"注册异常: {e}")
        return False, None, None
    
    # 登录
    try:
        r = requests.post(f"{BASE_URL}/auth/token", data={
            "username": username,
            "password": "test123456"
        })
        if r.status_code == 200:
            token = r.json()["access_token"]
            print_result(True, "用户登录成功")
        else:
            print_result(False, f"登录失败: {r.text[:100]}")
            return False, None, None
    except Exception as e:
        print_result(False, f"登录异常: {e}")
        return False, None, None
    
    # 获取用户信息
    headers = {"Authorization": f"Bearer {token}"}
    try:
        r = requests.get(f"{BASE_URL}/auth/me", headers=headers)
        if r.status_code == 200:
            print_result(True, f"获取用户信息: {r.json()['username']}")
        else:
            print_result(False, f"获取用户信息失败")
    except Exception as e:
        print_result(False, f"获取用户信息异常: {e}")
    
    # 修改密码
    try:
        r = requests.post(f"{BASE_URL}/auth/change-password", 
            headers=headers,
            json={"old_password": "test123456", "new_password": "newpass123"}
        )
        if r.status_code == 200:
            print_result(True, "修改密码成功")
        else:
            print_result(False, f"修改密码失败: {r.text[:100]}")
    except Exception as e:
        print_result(False, f"修改密码异常: {e}")
    
    return True, token, username

def test_payment(token):
    """测试支付功能"""
    print_section("3. 支付功能")
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    
    # 获取注册费用
    try:
        r = requests.get(f"{BASE_URL}/payment/register_fee")
        if r.status_code == 200:
            fee = r.json()
            print_result(True, f"注册费用: {fee['fee']} {fee['currency']}")
        else:
            print_result(False, "获取注册费用失败")
    except Exception as e:
        print_result(False, f"获取注册费用异常: {e}")

def test_data():
    """测试数据功能"""
    print_section("4. 数据管理")
    
    # 同步股票列表
    print("\n  同步股票列表（可能需要几秒）...")
    try:
        r = requests.post(f"{BASE_URL}/data/stocks/sync", timeout=30)
        if r.status_code == 200:
            count = r.json().get("synced_count", 0)
            print_result(True, f"同步股票列表: {count} 只")
        else:
            print_result(False, f"同步失败: {r.text[:100]}")
    except Exception as e:
        print_result(False, f"同步异常: {e}")
    
    # 获取股票列表
    try:
        r = requests.get(f"{BASE_URL}/data/stocks?search=000001")
        if r.status_code == 200:
            stocks = r.json()
            print_result(True, f"获取股票列表: {len(stocks)} 只")
        else:
            print_result(False, "获取股票列表失败")
    except Exception as e:
        print_result(False, f"获取股票列表异常: {e}")
    
    # 同步股票价格
    print("\n  同步股票价格（可能需要几秒）...")
    try:
        r = requests.post(f"{BASE_URL}/data/stocks/000001/sync", timeout=60)
        if r.status_code == 200:
            count = r.json().get("synced_count", 0)
            print_result(True, f"同步000001价格: {count} 条")
        else:
            print_result(False, f"同步价格失败: {r.text[:100]}")
    except Exception as e:
        print_result(False, f"同步价格异常: {e}")
    
    # 获取股票价格
    try:
        r = requests.get(f"{BASE_URL}/data/stocks/000001/prices?limit=10")
        if r.status_code == 200:
            prices = r.json()
            print_result(True, f"获取股票价格: {len(prices)} 条")
        else:
            print_result(False, "获取股票价格失败")
    except Exception as e:
        print_result(False, f"获取股票价格异常: {e}")

def test_features():
    """测试特征工程"""
    print_section("5. 特征工程")
    
    # 获取指标列表
    try:
        r = requests.get(f"{BASE_URL}/features/indicators")
        if r.status_code == 200:
            indicators = r.json()
            print_result(True, f"获取技术指标: {len(indicators)} 个")
        else:
            print_result(False, "获取技术指标失败")
    except Exception as e:
        print_result(False, f"获取技术指标异常: {e}")

def test_models(token):
    """测试模型管理"""
    print_section("6. 模型管理")
    if not token:
        print_result(False, "需要登录Token")
        return
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # 获取可用模型类型
    try:
        r = requests.get(f"{BASE_URL}/models/types/available")
        if r.status_code == 200:
            types = r.json().get("types", [])
            print_result(True, f"可用模型类型: {', '.join(types)}")
        else:
            print_result(False, "获取模型类型失败")
    except Exception as e:
        print_result(False, f"获取模型类型异常: {e}")
    
    # 创建模型
    try:
        r = requests.post(f"{BASE_URL}/models", 
            headers=headers,
            json={
                "name": f"测试模型_{int(time.time())}",
                "description": "API测试创建",
                "model_settings": {
                    "model_type": "randomforest",
                    "hyperparameters": {"n_estimators": 50},
                    "features": ["sma_5", "sma_20"],
                    "target": "next_day_return",
                    "stock_codes": ["000001"]
                }
            }
        )
        if r.status_code == 200:
            model_id = r.json().get("id")
            print_result(True, f"创建模型成功: ID={model_id}")
        else:
            print_result(False, f"创建模型失败: {r.text[:100]}")
    except Exception as e:
        print_result(False, f"创建模型异常: {e}")

def main():
    """主函数"""
    print("\n" + "="*60)
    print(" A股预测训练平台 - 完整API测试")
    print("="*60)
    
    # 测试健康检查
    if not test_health():
        print("\n❌ 后端未运行，请先启动后端服务")
        print("   运行: python backend/run.py")
        return
    
    # 测试认证
    success, token, username = test_auth()
    
    # 测试支付
    if token:
        test_payment(token)
    
    # 测试数据
    test_data()
    
    # 测试特征
    test_features()
    
    # 测试模型
    if token:
        test_models(token)
    
    # 总结
    print("\n" + "="*60)
    print(" 测试完成")
    print("="*60)
    print(f"\nAPI文档: http://localhost:8000/docs")
    print(f"前端界面: http://localhost:3000")

if __name__ == "__main__":
    main()
