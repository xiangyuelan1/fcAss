"""
演示脚本 - 展示完整的训练和回测流程
"""
import requests
import json
import time
from datetime import datetime, timedelta

BASE_URL = "http://localhost:8000/api"


def print_step(step, message):
    print(f"\n{'='*60}")
    print(f"步骤 {step}: {message}")
    print(f"{'='*60}")


def print_result(data, title="结果"):
    print(f"\n{title}:")
    print(json.dumps(data, indent=2, ensure_ascii=False))


class AStockDemo:
    """演示类"""
    
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({'Content-Type': 'application/json'})
    
    def run_demo(self):
        """运行完整演示流程"""
        print("\n" + "="*70)
        print("A股预测训练平台 - 完整流程演示")
        print("="*70)
        
        try:
            # 1. 注册登录
            self.step1_register_and_login()
            
            # 2. 同步股票数据
            self.step2_sync_stock_data()
            
            # 3. 获取特征指标
            self.step3_get_indicators()
            
            # 4. 创建模型
            self.step4_create_model()
            
            # 5. 创建训练任务
            self.step5_create_training_task()
            
            # 6. 等待训练完成
            self.step6_wait_for_training()
            
            # 7. 执行回测
            self.step7_run_backtest()
            
            # 8. 获取回测结果
            self.step8_get_backtest_results()
            
            print("\n" + "="*70)
            print("演示完成！")
            print("="*70)
            print("\n完整API文档: http://localhost:8000/docs")
            print("前端界面: http://localhost:3000")
            
        except Exception as e:
            print(f"\n演示过程中出错: {str(e)}")
            print("请确保后端服务正在运行 (python run.py)")
    
    def step1_register_and_login(self):
        """注册和登录"""
        print_step(1, "用户注册和登录")
        
        # 尝试注册
        register_data = {
            "username": f"demo_{int(time.time())}",
            "email": f"demo_{int(time.time())}@example.com",
            "password": "demo123456"
        }
        
        try:
            resp = self.session.post(f"{BASE_URL}/auth/register", json=register_data)
            if resp.status_code == 200:
                print("✓ 用户注册成功")
            else:
                print(f"注册响应: {resp.text}")
        except Exception as e:
            print(f"注册失败（可能已存在）: {e}")
        
        # 登录
        login_data = {
            "username": register_data["username"],
            "password": register_data["password"]
        }
        
        try:
            resp = self.session.post(f"{BASE_URL}/auth/token", data=login_data)
            if resp.status_code == 200:
                token = resp.json()["access_token"]
                self.session.headers.update({'Authorization': f'Bearer {token}'})
                print("✓ 登录成功")
                print_result({"token": token[:20] + "...", "username": register_data["username"]})
            else:
                print(f"登录失败: {resp.text}")
        except Exception as e:
            print(f"登录出错: {e}")
    
    def step2_sync_stock_data(self):
        """同步股票数据"""
        print_step(2, "同步股票数据")
        
        # 同步几只典型股票
        test_codes = ["000001", "000002", "600519", "600036"]
        
        for code in test_codes:
            print(f"\n同步股票 {code}...")
            try:
                resp = self.session.post(f"{BASE_URL}/data/stocks/{code}/sync")
                if resp.status_code == 200:
                    result = resp.json()
                    print(f"  ✓ 成功同步 {result.get('synced_count', 0)} 条数据")
                else:
                    print(f"  ✗ 同步失败: {resp.text[:100]}")
            except Exception as e:
                print(f"  ✗ 请求失败: {e}")
        
        # 获取股票列表
        try:
            resp = self.session.get(f"{BASE_URL}/data/stocks")
            if resp.status_code == 200:
                stocks = resp.json()
                print(f"\n✓ 股票列表获取成功，共 {len(stocks)} 只股票")
                if stocks:
                    print_result({"示例": f"{stocks[0]['code']} - {stocks[0]['name']}"})
        except Exception as e:
            print(f"获取股票列表失败: {e}")
    
    def step3_get_indicators(self):
        """获取特征指标"""
        print_step(3, "获取特征指标")
        
        try:
            resp = self.session.get(f"{BASE_URL}/features/indicators")
            if resp.status_code == 200:
                indicators = resp.json()
                print(f"✓ 获取到 {len(indicators)} 个技术指标")
                
                # 显示几个常用指标
                common = ["sma_5", "sma_20", "macd", "rsi_14", "boll"]
                print("\n常用指标:")
                for ind in indicators:
                    if ind.get("key") in common:
                        print(f"  - {ind.get('name')}: {ind.get('key')}")
                
                self.indicators = indicators
        except Exception as e:
            print(f"获取指标失败: {e}")
            self.indicators = []
    
    def step4_create_model(self):
        """创建模型"""
        print_step(4, "创建预测模型")
        
        model_config = {
            "name": f"演示模型_{datetime.now().strftime('%H%M%S')}",
            "description": "这是一个演示模型，用于展示完整流程",
            "config": {
                "model_type": "lightgbm",  # 使用lightgbm，训练速度快
                "model_config": {
                    "n_estimators": 100,
                    "max_depth": 6,
                    "learning_rate": 0.1
                },
                "features": ["sma_5", "sma_20", "rsi_14", "volume_change"],
                "target": "next_day_return",
                "stock_codes": ["000001", "000002"],
                "train_date_range": {
                    "start": (datetime.now() - timedelta(days=365)).strftime("%Y-%m-%d"),
                    "end": (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
                }
            }
        }
        
        try:
            resp = self.session.post(f"{BASE_URL}/models", json=model_config)
            if resp.status_code == 200:
                model = resp.json()
                self.model_id = model.get("id")
                print("✓ 模型创建成功")
                print_result({
                    "model_id": self.model_id,
                    "name": model.get("name"),
                    "type": model.get("model_type")
                })
            else:
                print(f"创建模型失败: {resp.text}")
                self.model_id = None
        except Exception as e:
            print(f"创建模型出错: {e}")
            self.model_id = None
    
    def step5_create_training_task(self):
        """创建训练任务"""
        print_step(5, "创建训练任务")
        
        if not self.model_id:
            print("✗ 没有模型ID，跳过训练")
            return
        
        task_config = {
            "model_id": self.model_id,
            "config": {
                "epochs": 50,
                "batch_size": 32,
                "learning_rate": 0.001
            }
        }
        
        try:
            resp = self.session.post(f"{BASE_URL}/training/tasks", json=task_config)
            if resp.status_code == 200:
                task = resp.json()
                self.task_id = task.get("id")
                print("✓ 训练任务创建成功")
                print_result({
                    "task_id": self.task_id,
                    "status": task.get("status")
                })
            else:
                print(f"创建训练任务失败: {resp.text}")
                self.task_id = None
        except Exception as e:
            print(f"创建训练任务出错: {e}")
            self.task_id = None
    
    def step6_wait_for_training(self):
        """等待训练完成"""
        print_step(6, "等待训练完成")
        
        if not self.task_id:
            print("✗ 没有训练任务ID")
            return
        
        print("训练中，请稍候...", end="", flush=True)
        
        max_wait = 60  # 最多等待60秒
        waited = 0
        
        while waited < max_wait:
            try:
                resp = self.session.get(f"{BASE_URL}/training/tasks/{self.task_id}")
                if resp.status_code == 200:
                    task = resp.json()
                    status = task.get("status")
                    
                    if status == "completed":
                        print(f"\n✓ 训练完成！")
                        print_result({
                            "status": status,
                            "metrics": task.get("metrics", {})
                        })
                        return
                    elif status == "failed":
                        print(f"\n✗ 训练失败")
                        print_result({"error": task.get("error_message", "未知错误")})
                        return
                    else:
                        print(".", end="", flush=True)
                        time.sleep(2)
                        waited += 2
                else:
                    print(f"\n获取训练状态失败: {resp.text[:100]}")
                    return
            except Exception as e:
                print(f"\n检查训练状态出错: {e}")
                return
        
        print(f"\n⚠ 等待超时（{max_wait}秒），训练可能仍在进行")
        print(f"  可以稍后在 http://localhost:8000/docs 查看任务状态")
    
    def step7_run_backtest(self):
        """执行回测"""
        print_step(7, "执行回测")
        
        if not self.task_id:
            print("✗ 没有训练任务ID，跳过回测")
            return
        
        backtest_config = {
            "task_id": self.task_id,
            "start_date": (datetime.now() - timedelta(days=180)).strftime("%Y-%m-%d"),
            "end_date": (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d"),
            "initial_capital": 100000,
            "commission_rate": 0.0003
        }
        
        try:
            resp = self.session.post(f"{BASE_URL}/backtest/run", json=backtest_config)
            if resp.status_code == 200:
                backtest = resp.json()
                self.backtest_id = backtest.get("id")
                print("✓ 回测任务已创建")
                print_result({
                    "backtest_id": self.backtest_id,
                    "initial_capital": backtest.get("initial_capital")
                })
                
                # 等待回测完成
                print("\n执行回测中...", end="", flush=True)
                time.sleep(3)
                print("完成")
                
            else:
                print(f"创建回测失败: {resp.text}")
                self.backtest_id = None
        except Exception as e:
            print(f"执行回测出错: {e}")
            self.backtest_id = None
    
    def step8_get_backtest_results(self):
        """获取回测结果"""
        print_step(8, "获取回测结果")
        
        if not self.backtest_id:
            print("✗ 没有回测ID")
            return
        
        try:
            resp = self.session.get(f"{BASE_URL}/backtest/results/{self.backtest_id}")
            if resp.status_code == 200:
                result = resp.json()
                print("✓ 回测结果获取成功")
                
                # 显示关键指标
                key_metrics = {
                    "总收益率": f"{result.get('total_return', 0)*100:.2f}%" if result.get('total_return') else "N/A",
                    "年化收益率": f"{result.get('annual_return', 0)*100:.2f}%" if result.get('annual_return') else "N/A",
                    "最大回撤": f"{result.get('max_drawdown', 0)*100:.2f}%" if result.get('max_drawdown') else "N/A",
                    "夏普比率": f"{result.get('sharpe_ratio', 0):.2f}" if result.get('sharpe_ratio') else "N/A",
                    "交易次数": result.get('trades_count', 0),
                    "胜率": f"{result.get('win_rate', 0)*100:.1f}%" if result.get('win_rate') else "N/A"
                }
                
                print_result(key_metrics, title="关键指标")
            else:
                print(f"获取回测结果失败: {resp.text}")
        except Exception as e:
            print(f"获取回测结果出错: {e}")


def main():
    """主函数"""
    print("\n检查后端服务状态...")
    
    try:
        resp = requests.get("http://localhost:8000/health", timeout=2)
        if resp.status_code == 200:
            print("✓ 后端服务正常运行")
        else:
            print("✗ 后端服务响应异常")
            return
    except Exception as e:
        print("✗ 无法连接到后端服务")
        print(f"  错误: {e}")
        print("\n请先启动后端服务:")
        print("  cd backend")
        print("  python run.py")
        return
    
    # 运行演示
    demo = AStockDemo()
    demo.run_demo()


if __name__ == "__main__":
    main()
