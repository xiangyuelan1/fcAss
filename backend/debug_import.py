"""
详细错误检查
"""
import sys
import os
import traceback

os.chdir(r"d:\桌面\TRAESOLO\A股预测平台\开发A股预测训练平台\a_stock_trainer\backend")
sys.path.insert(0, os.getcwd())

print("检查API模块...")

modules = [
    "app.api.auth",
    "app.api.models", 
    "app.api.training",
    "app.api.backtest",
    "app.api.payment"
]

for module in modules:
    print(f"\n检查 {module}:")
    try:
        __import__(module)
        print(f"  ✓ 成功")
    except Exception as e:
        print(f"  ✗ 失败")
        print(f"  错误: {e}")
        traceback.print_exc()
