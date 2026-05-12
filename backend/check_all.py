"""
全面代码检查脚本
"""
import sys
import os

def check_imports():
    """检查所有导入"""
    print("\n" + "="*60)
    print("检查模块导入...")
    print("="*60)
    
    errors = []
    
    # 检查核心模块
    modules = [
        ("app.core.config", "配置模块"),
        ("app.core.database", "数据库模块"),
        ("app.auth", "认证模块"),
        ("app.models.user", "用户模型"),
        ("app.models.stock", "股票模型"),
        ("app.models.payment_order", "支付订单模型"),
        ("app.services.data_service", "数据服务"),
        ("app.services.feature_service", "特征服务"),
        ("app.services.model_service", "模型服务"),
        ("app.services.training_service", "训练服务"),
        ("app.services.backtest_service", "回测服务"),
        ("app.services.payment_service", "支付服务"),
        ("app.api.auth", "认证API"),
        ("app.api.data", "数据API"),
        ("app.api.features", "特征API"),
        ("app.api.models", "模型API"),
        ("app.api.training", "训练API"),
        ("app.api.backtest", "回测API"),
        ("app.api.payment", "支付API"),
    ]
    
    for module_path, name in modules:
        try:
            __import__(module_path)
            print(f"  ✓ {name} ({module_path})")
        except Exception as e:
            print(f"  ✗ {name} ({module_path}): {e}")
            errors.append((module_path, str(e)))
    
    return errors

def check_models():
    """检查模型定义"""
    print("\n" + "="*60)
    print("检查数据模型...")
    print("="*60)
    
    errors = []
    
    try:
        from app.models.user import User
        print("  ✓ User模型")
        
        # 检查必需字段
        required_attrs = ['id', 'username', 'email', 'hashed_password', 'is_active']
        for attr in required_attrs:
            if hasattr(User, attr):
                print(f"    ✓ 字段: {attr}")
            else:
                print(f"    ✗ 缺少字段: {attr}")
                errors.append(f"User缺少字段: {attr}")
    except Exception as e:
        print(f"  ✗ User模型加载失败: {e}")
        errors.append(f"User模型: {e}")
    
    try:
        from app.models.payment_order import PaymentOrder
        print("  ✓ PaymentOrder模型")
    except Exception as e:
        print(f"  ✗ PaymentOrder模型加载失败: {e}")
        errors.append(f"PaymentOrder模型: {e}")
    
    try:
        from app.models.stock import Stock, StockPrice
        print("  ✓ Stock模型")
        print("  ✓ StockPrice模型")
    except Exception as e:
        print(f"  ✗ Stock模型加载失败: {e}")
        errors.append(f"Stock模型: {e}")
    
    return errors

def check_api_routes():
    """检查API路由"""
    print("\n" + "="*60)
    print("检查API路由...")
    print("="*60)
    
    errors = []
    
    try:
        from app.api import api_router
        print("  ✓ API路由器加载成功")
        
        # 检查路由
        routes = api_router.routes
        print(f"    共 {len(routes)} 个路由")
        
        # 检查各模块路由
        route_paths = [r.path for r in routes]
        expected_prefixes = ['/auth', '/data', '/features', '/models', '/training', '/backtest', '/payment']
        
        for prefix in expected_prefixes:
            found = any(prefix in str(p) for p in route_paths)
            if found:
                print(f"    ✓ {prefix} 路由已注册")
            else:
                print(f"    ⚠ {prefix} 路由未找到")
                
    except Exception as e:
        print(f"  ✗ API路由加载失败: {e}")
        errors.append(f"API路由: {e}")
    
    return errors

def check_services():
    """检查服务类"""
    print("\n" + "="*60)
    print("检查服务类...")
    print("="*60)
    
    errors = []
    
    services = [
        ("app.services.data_service", "DataService"),
        ("app.services.feature_service", "FeatureService"),
        ("app.services.model_service", "ModelService"),
        ("app.services.training_service", "TrainingService"),
        ("app.services.backtest_service", "BacktestService"),
        ("app.services.payment_service", "PaymentService"),
    ]
    
    for module_path, class_name in services:
        try:
            module = __import__(module_path, fromlist=[class_name])
            service_class = getattr(module, class_name)
            print(f"  ✓ {class_name}")
        except Exception as e:
            print(f"  ✗ {class_name}: {e}")
            errors.append(f"{class_name}: {e}")
    
    return errors

def main():
    """主函数"""
    print("\n" + "="*70)
    print("A股预测训练平台 - 全面代码检查")
    print("="*70)
    
    all_errors = []
    
    # 切换到backend目录
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(backend_dir)
    sys.path.insert(0, backend_dir)
    
    # 运行检查
    all_errors.extend(check_imports())
    all_errors.extend(check_models())
    all_errors.extend(check_api_routes())
    all_errors.extend(check_services())
    
    # 打印总结
    print("\n" + "="*70)
    print("检查结果总结")
    print("="*70)
    
    if all_errors:
        print(f"\n发现 {len(all_errors)} 个错误:")
        for error in all_errors:
            print(f"  - {error}")
        print("\n❌ 代码检查未通过，请修复上述错误")
        return 1
    else:
        print("\n✅ 所有检查通过！代码可以正常运行")
        return 0

if __name__ == "__main__":
    sys.exit(main())
