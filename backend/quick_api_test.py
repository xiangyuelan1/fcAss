"""
快速API测试
"""
import requests
import json

BASE_URL = "http://localhost:8000"

def test():
    print("测试API...")
    
    # 1. 健康检查
    try:
        r = requests.get(f"{BASE_URL}/health", timeout=5)
        if r.status_code == 200:
            print(f"✓ 后端运行中: {r.json()}")
        else:
            print(f"✗ 健康检查失败: {r.status_code}")
            return
    except Exception as e:
        print(f"✗ 无法连接后端: {e}")
        return
    
    # 2. 获取注册费用
    try:
        r = requests.get(f"{BASE_URL}/api/payment/register_fee")
        if r.status_code == 200:
            print(f"✓ 注册费用: {r.json()}")
    except Exception as e:
        print(f"✗ 获取注册费用失败: {e}")
    
    # 3. 获取API信息
    try:
        r = requests.get(f"{BASE_URL}/")
        if r.status_code == 200:
            print(f"✓ API信息: {r.json()}")
    except Exception as e:
        print(f"✗ 获取API信息失败: {e}")
    
    print("\n✅ 测试完成！后端服务正常运行。")
    print(f"\nAPI文档: {BASE_URL}/docs")

if __name__ == "__main__":
    test()
