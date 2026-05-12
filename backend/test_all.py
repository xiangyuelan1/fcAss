"""
全面测试脚本 - 测试所有功能
"""
import requests
import json
import time
from datetime import datetime, timedelta

BASE_URL = "http://localhost:8000/api"


class SystemTester:
    """系统测试器"""
    
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({'Content-Type': 'application/json'})
        self.results = {
            "passed": [],
            "failed": [],
            "warnings": []
        }
        self.token = None
    
    def log_pass(self, test_name):
        print(f"  ✓ {test_name}")
        self.results["passed"].append(test_name)
    
    def log_fail(self, test_name, error):
        print(f"  ✗ {test_name}: {error}")
        self.results["failed"].append({"test": test_name, "error": str(error)})
    
    def log_warning(self, message):
        print(f"  ⚠ {message}")
        self.results["warnings"].append(message)
    
    def run_all_tests(self):
        """运行所有测试"""
        print("\n" + "="*70)
        print("A股预测训练平台 - 全面功能测试")
        print("="*70)
        
        print("\n【1. 后端服务测试】")
        self.test_backend_health()
        
        print("\n【2. 用户认证系统测试】")
        self.test_auth_system()
        
        print("\n【3. 数据管理测试】")
        self.test_data_management()
        
        print("\n【4. 特征工程测试】")
        self.test_feature_engineering()
        
        print("\n【5. 模型管理测试】")
        self.test_model_management()
        
        print("\n【6. 训练任务测试】")
        self.test_training()
        
        print("\n【7. 回测功能测试】")
        self.test_backtest()
        
        print("\n" + "="*70)
        self.print_summary()
    
    def test_backend_health(self):
        """测试后端健康状态"""
        try:
            resp = requests.get("http://localhost:8000/health", timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                self.log_pass(f"后端健康检查 - 版本 {data.get('version')}")
            else:
                self.log_fail("后端健康检查", f"HTTP {resp.status_code}")
        except Exception as e:
            self.log_fail("后端健康检查", f"无法连接: {e}")
    
    def test_auth_system(self):
        """测试认证系统"""
        # 测试注册
        username = f"test_{int(time.time())}"
        password = "test123456"
        
        try:
            resp = self.session.post(f"{BASE_URL}/auth/register", json={
                "username": username,
                "email": f"{username}@test.com",
                "password": password
            })
            if resp.status_code == 200:
                self.log_pass("用户注册")
                user_data = resp.json()
            else:
                self.log_fail("用户注册", f"HTTP {resp.status_code}: {resp.text[:100]}")
                return
        except Exception as e:
            self.log_fail("用户注册", str(e))
            return
        
        # 测试登录
        try:
            resp = self.session.post(f"{BASE_URL}/auth/token", data={
                "username": username,
                "password": password
            })
            if resp.status_code == 200:
                data = resp.json()
                self.token = data.get("access_token")
                self.session.headers.update({"Authorization": f"Bearer {self.token}"})
                self.log_pass("用户登录获取Token")
            else:
                self.log_fail("用户登录", f"HTTP {resp.status_code}")
        except Exception as e:
            self.log_fail("用户登录", str(e))
        
        # 测试获取当前用户
        if self.token:
            try:
                resp = self.session.get(f"{BASE_URL}/auth/me")
                if resp.status_code == 200:
                    self.log_pass("获取当前用户信息")
                else:
                    self.log_fail("获取当前用户", f"HTTP {resp.status_code}")
            except Exception as e:
                self.log_fail("获取当前用户", str(e))
    
    def test_data_management(self):
        """测试数据管理"""
        # 测试同步股票列表
        try:
            resp = self.session.post(f"{BASE_URL}/data/stocks/sync")
            if resp.status_code == 200:
                data = resp.json()
                count = data.get("synced_count", 0)
                self.log_pass(f"同步股票列表 - 获取 {count} 只股票")
            else:
                self.log_fail("同步股票列表", f"HTTP {resp.status_code}")
        except Exception as e:
            self.log_fail("同步股票列表", str(e))
        
        # 测试获取股票列表
        try:
            resp = self.session.get(f"{BASE_URL}/data/stocks")
            if resp.status_code == 200:
                stocks = resp.json()
                if len(stocks) > 0:
                    self.log_pass(f"获取股票列表 - 共 {len(stocks)} 只")
                else:
                    self.log_warning("股票列表为空，可能需要先同步")
            else:
                self.log_fail("获取股票列表", f"HTTP {resp.status_code}")
        except Exception as e:
            self.log_fail("获取股票列表", str(e))
        
        # 测试同步单只股票
        try:
            resp = self.session.post(f"{BASE_URL}/data/stocks/000001/sync")
            if resp.status_code == 200:
                data = resp.json()
                self.log_pass(f"同步股票000001 - {data.get('synced_count', 0)} 条数据")
            else:
                self.log_fail("同步股票000001", f"HTTP {resp.status_code}: {resp.text[:100]}")
        except Exception as e:
            self.log_fail("同步股票000001", str(e))
        
        # 测试获取股票价格
        try:
            resp = self.session.get(f"{BASE_URL}/data/stocks/000001/prices?limit=100")
            if resp.status_code == 200:
                prices = resp.json()
                self.log_pass(f"获取股票价格 - {len(prices)} 条记录")
            else:
                self.log_fail("获取股票价格", f"HTTP {resp.status_code}")
        except Exception as e:
            self.log_fail("获取股票价格", str(e))
    
    def test_feature_engineering(self):
        """测试特征工程"""
        # 获取指标列表
        try:
            resp = self.session.get(f"{BASE_URL}/features/indicators")
            if resp.status_code == 200:
                indicators = resp.json()
                self.log_pass(f"获取技术指标 - {len(indicators)} 个指标")
                
                # 检查常用指标
                common = ["sma_5", "sma_20", "macd", "rsi_14", "boll"]
                found = [i for i in indicators if i.get("key") in common]
                if found:
                    self.log_pass(f"常用指标验证 - 找到 {len(found)} 个常用指标")
                else:
                    self.log_warning("常用指标未找到")
            else:
                self.log_fail("获取技术指标", f"HTTP {resp.status_code}")
        except Exception as e:
            self.log_fail("获取技术指标", str(e))
        
        # 测试特征预览
        try:
            resp = self.session.post(f"{BASE_URL}/features/preview", json={
                "stock_code": "000001",
                "indicators": ["sma_5", "sma_20"],
                "limit": 10
            })
            if resp.status_code == 200:
                self.log_pass("特征预览计算")
            else:
                self.log_fail("特征预览", f"HTTP {resp.status_code}: {resp.text[:100]}")
        except Exception as e:
            self.log_fail("特征预览", str(e))
    
    def test_model_management(self):
        """测试模型管理"""
        # 获取模型类型
        try:
            resp = self.session.get(f"{BASE_URL}/models/types/available")
            if resp.status_code == 200:
                data = resp.json()
                types = data.get("types", [])
                self.log_pass(f"获取模型类型 - {len(types)} 种模型")
            else:
                self.log_fail("获取模型类型", f"HTTP {resp.status_code}")
        except Exception as e:
            self.log_fail("获取模型类型", str(e))
        
        # 创建模型
        try:
            resp = self.session.post(f"{BASE_URL}/models", json={
                "name": f"测试模型_{int(time.time())}",
                "description": "自动化测试创建的模型",
                "config": {
                    "model_type": "randomforest",
                    "model_config": {
                        "n_estimators": 50,
                        "max_depth": 5
                    },
                    "features": ["sma_5", "sma_20"],
                    "target": "next_day_return",
                    "stock_codes": ["000001"]
                }
            })
            if resp.status_code == 200:
                self.current_model_id = resp.json().get("id")
                self.log_pass(f"创建模型 - ID: {self.current_model_id}")
            else:
                self.current_model_id = None
                self.log_fail("创建模型", f"HTTP {resp.status_code}: {resp.text[:100]}")
        except Exception as e:
            self.current_model_id = None
            self.log_fail("创建模型", str(e))
        
        # 获取模型列表
        try:
            resp = self.session.get(f"{BASE_URL}/models")
            if resp.status_code == 200:
                models = resp.json()
                self.log_pass(f"获取模型列表 - {len(models)} 个模型")
            else:
                self.log_fail("获取模型列表", f"HTTP {resp.status_code}")
        except Exception as e:
            self.log_fail("获取模型列表", str(e))
    
    def test_training(self):
        """测试训练功能"""
        if not self.current_model_id:
            self.log_warning("跳过训练测试（无有效模型ID）")
            return
        
        # 创建训练任务
        try:
            resp = self.session.post(f"{BASE_URL}/training/tasks", json={
                "model_id": self.current_model_id,
                "config": {
                    "epochs": 10
                }
            })
            if resp.status_code == 200:
                task = resp.json()
                self.current_task_id = task.get("id")
                self.log_pass(f"创建训练任务 - ID: {self.current_task_id}")
                
                # 等待训练完成（简短轮次）
                print("    等待训练完成...")
                for i in range(30):  # 最多等待30秒
                    time.sleep(1)
                    resp = self.session.get(f"{BASE_URL}/training/tasks/{self.current_task_id}")
                    if resp.status_code == 200:
                        task = resp.json()
                        if task.get("status") == "completed":
                            self.log_pass("训练任务完成")
                            break
                        elif task.get("status") == "failed":
                            self.log_fail("训练任务", f"失败: {task.get('error_message', '未知错误')}")
                            break
                else:
                    self.log_warning("训练任务超时（30秒）")
                
            else:
                self.current_task_id = None
                self.log_fail("创建训练任务", f"HTTP {resp.status_code}: {resp.text[:100]}")
        except Exception as e:
            self.current_task_id = None
            self.log_fail("创建训练任务", str(e))
    
    def test_backtest(self):
        """测试回测功能"""
        if not self.current_task_id:
            self.log_warning("跳过回测测试（无有效训练任务ID）")
            return
        
        # 执行回测
        try:
            resp = self.session.post(f"{BASE_URL}/backtest/run", json={
                "task_id": self.current_task_id,
                "start_date": (datetime.now() - timedelta(days=90)).strftime("%Y-%m-%d"),
                "end_date": (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d"),
                "initial_capital": 100000
            })
            if resp.status_code == 200:
                backtest = resp.json()
                self.current_backtest_id = backtest.get("id")
                self.log_pass(f"执行回测 - ID: {self.current_backtest_id}")
                
                # 等待回测完成
                time.sleep(2)
                
                # 获取回测结果
                resp = self.session.get(f"{BASE_URL}/backtest/results/{self.current_backtest_id}")
                if resp.status_code == 200:
                    result = resp.json()
                    total_return = result.get("total_return", 0)
                    if total_return is not None:
                        self.log_pass(f"回测结果 - 收益率: {total_return*100:.2f}%")
                    else:
                        self.log_warning("回测结果为空（可能数据不足）")
                else:
                    self.log_fail("获取回测结果", f"HTTP {resp.status_code}")
            else:
                self.current_backtest_id = None
                self.log_fail("执行回测", f"HTTP {resp.status_code}: {resp.text[:100]}")
        except Exception as e:
            self.current_backtest_id = None
            self.log_fail("执行回测", str(e))
    
    def print_summary(self):
        """打印测试摘要"""
        print("\n" + "="*70)
        print("测试结果摘要")
        print("="*70)
        
        print(f"\n✓ 通过: {len(self.results['passed'])} 项")
        print(f"✗ 失败: {len(self.results['failed'])} 项")
        print(f"⚠ 警告: {len(self.results['warnings'])} 项")
        
        if self.results["failed"]:
            print("\n失败详情:")
            for item in self.results["failed"]:
                print(f"  - {item['test']}: {item['error']}")
        
        if self.results["warnings"]:
            print("\n警告详情:")
            for warning in self.results["warnings"]:
                print(f"  - {warning}")
        
        success_rate = len(self.results["passed"]) / max(len(self.results["passed"]) + len(self.results["failed"]), 1) * 100
        print(f"\n成功率: {success_rate:.1f}%")
        
        if success_rate >= 80:
            print("\n🎉 系统测试通过！可以正常使用。")
        elif success_rate >= 60:
            print("\n⚠ 系统部分功能正常，但有一些问题需要修复。")
        else:
            print("\n❌ 系统存在较多问题，建议修复后再使用。")


def main():
    tester = SystemTester()
    tester.run_all_tests()


if __name__ == "__main__":
    main()
