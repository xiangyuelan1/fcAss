"""
快速测试脚本 - 测试核心功能
"""
import requests
import sys

BASE_URL = "http://localhost:8000/api"

def test():
    print("测试系统...")
    
    # 1. 健康检查
    try:
        r = requests.get("http://localhost:8000/health", timeout=5)
        print(f"✓ 后端运行中 (v{r.json()['version']})")
    except:
        print("✗ 后端未运行，请先启动: python run.py")
        return
    
    # 2. 测试认证
    try:
        r = requests.post(f"{BASE_URL}/auth/register", json={
            "username": "test",
            "password": "test123",
            "email": "test@test.com"
        })
        if r.status_code == 200:
            print("✓ 用户注册成功")
        else:
            print(f"  注册响应: {r.status_code}")
    except Exception as e:
        print(f"✗ 注册失败: {e}")
    
    # 3. 测试数据
    try:
        r = requests.post(f"{BASE_URL}/data/stocks/sync")
        print(f"✓ 股票同步: {r.json().get('synced_count', 0)} 只")
    except Exception as e:
        print(f"✗ 同步失败: {e}")
    
    # 4. 测试特征
    try:
        r = requests.get(f"{BASE_URL}/features/indicators")
        print(f"✓ 技术指标: {len(r.json())} 个")
    except Exception as e:
        print(f"✗ 指标获取失败: {e}")
    
    print("\n基本测试完成！")
    print("完整测试请访问: http://localhost:8000/docs")

if __name__ == "__main__":
    test()
