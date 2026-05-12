#!/usr/bin/env python3
"""
一键启动脚本 - 同时启动前后端服务
"""
import subprocess
import sys
import io
import os
import time
import threading
import webbrowser
import signal
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

PROJECT_ROOT = Path(__file__).parent
BACKEND_DIR = PROJECT_ROOT / "backend"
FRONTEND_DIR = PROJECT_ROOT / "frontend"

processes = []


def check_python():
    """检查Python"""
    try:
        result = subprocess.run(
            [sys.executable, "--version"],
            capture_output=True,
            text=True
        )
        print(f"[OK] Python: {result.stdout.strip()}")
        return True
    except Exception as e:
        print(f"[FAIL] Python检查失败: {e}")
        return False


def check_node():
    """检查Node.js"""
    try:
        result = subprocess.run(
            ["node", "--version"],
            capture_output=True,
            text=True,
            shell=True
        )
        if result.returncode == 0:
            print(f"[OK] Node.js: {result.stdout.strip()}")
            return True
        else:
            print("[FAIL] Node.js未安装")
            return False
    except Exception:
        print("[FAIL] Node.js未安装，前端将无法启动")
        return False


def install_backend_deps():
    """安装后端依赖"""
    print("\n检查后端依赖...")
    requirements = BACKEND_DIR / "requirements.txt"
    if requirements.exists():
        try:
            subprocess.run(
                [sys.executable, "-m", "pip", "install", "-r", str(requirements)],
                cwd=str(BACKEND_DIR),
                check=True,
                capture_output=True
            )
            print("[OK] 后端依赖已安装")
            return True
        except subprocess.CalledProcessError as e:
            print(f"[FAIL] 后端依赖安装失败: {e}")
            return False
    return True


def install_frontend_deps():
    """安装前端依赖"""
    print("\n检查前端依赖...")
    package_json = FRONTEND_DIR / "package.json"
    if not package_json.exists():
        print("[FAIL] 前端目录不存在package.json")
        return False

    node_modules = FRONTEND_DIR / "node_modules"
    if not node_modules.exists():
        print("正在安装前端依赖（首次运行需要几分钟）...")
        try:
            subprocess.run(
                ["npm", "install"],
                cwd=str(FRONTEND_DIR),
                shell=True,
                check=True
            )
            print("[OK] 前端依赖已安装")
            return True
        except subprocess.CalledProcessError as e:
            print(f"[FAIL] 前端依赖安装失败: {e}")
            return False
    else:
        print("[OK] 前端依赖已存在")
        return True


def start_backend():
    """启动后端服务"""
    print("\n启动后端服务...")

    process = subprocess.Popen(
        [sys.executable, "run.py"],
        cwd=str(BACKEND_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        encoding='utf-8',
        errors='replace',
        bufsize=1
    )

    processes.append(("后端", process))

    def read_output():
        try:
            for line in iter(process.stdout.readline, ''):
                if line:
                    print(f"[后端] {line.rstrip()}")
        except Exception:
            pass

    thread = threading.Thread(target=read_output, daemon=True)
    thread.start()

    return process


def start_frontend():
    """启动前端服务"""
    print("\n启动前端服务...")

    process = subprocess.Popen(
        ["npm", "run", "dev"],
        cwd=str(FRONTEND_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        encoding='utf-8',
        errors='replace',
        bufsize=1,
        shell=True
    )

    processes.append(("前端", process))

    def read_output():
        try:
            for line in iter(process.stdout.readline, ''):
                if line:
                    print(f"[前端] {line.rstrip()}")
        except Exception:
            pass

    thread = threading.Thread(target=read_output, daemon=True)
    thread.start()

    return process


def open_browser():
    """打开浏览器"""
    time.sleep(5)
    print("\n正在打开浏览器...")
    webbrowser.open("http://localhost:3000")


def kill_old_processes():
    """杀掉占用端口的旧进程"""
    print("\n检查并清理旧进程...")
    ports = [8000, 3000]
    killed = False
    
    if os.name == 'nt':  # Windows
        for port in ports:
            try:
                # 查找占用端口的进程
                result = subprocess.run(
                    ['netstat', '-ano', '-p', 'tcp'],
                    capture_output=True,
                    text=True,
                    shell=True
                )
                for line in result.stdout.split('\n'):
                    if f':{port}' in line and ('LISTENING' in line or 'LISTEN' in line):
                        parts = line.split()
                        if parts:
                            pid = parts[-1]
                            try:
                                # 获取进程名
                                tasklist_result = subprocess.run(
                                    ['tasklist', '/FI', f'PID eq {pid}', '/FO', 'CSV'],
                                    capture_output=True,
                                    text=True,
                                    shell=True
                                )
                                process_name = ''
                                if len(tasklist_result.stdout.split('\n')) > 1:
                                    line2 = tasklist_result.stdout.split('\n')[1]
                                    if line2:
                                        process_name = line2.split('"')[1]
                                
                                print(f"  发现占用端口 {port} 的进程: PID {pid} ({process_name})")
                                # 杀掉进程
                                subprocess.run(['taskkill', '/F', '/PID', pid], capture_output=True, shell=True)
                                print(f"  [OK] 已杀掉进程 PID {pid}")
                                killed = True
                            except Exception as e:
                                print(f"  [WARN] 杀掉进程 PID {pid} 失败: {e}")
            except Exception as e:
                print(f"  [WARN] 检查端口 {port} 失败: {e}")
    else:  # Linux/Mac
        for port in ports:
            try:
                result = subprocess.run(
                    ['lsof', '-ti', f':{port}'],
                    capture_output=True,
                    text=True
                )
                pids = result.stdout.strip().split()
                for pid in pids:
                    if pid:
                        try:
                            print(f"  发现占用端口 {port} 的进程: PID {pid}")
                            os.kill(int(pid), signal.SIGKILL)
                            print(f"  [OK] 已杀掉进程 PID {pid}")
                            killed = True
                        except Exception as e:
                            print(f"  [WARN] 杀掉进程 PID {pid} 失败: {e}")
            except Exception as e:
                print(f"  [WARN] 检查端口 {port} 失败: {e}")
    
    if killed:
        print("  等待旧进程完全退出...")
        time.sleep(2)
    else:
        print("  [OK] 无旧进程需要清理")


def cleanup():
    """清理进程"""
    print("\n正在停止服务...")
    for name, process in processes:
        try:
            process.terminate()
            process.wait(timeout=5)
            print(f"[OK] {name}服务已停止")
        except Exception:
            process.kill()
            print(f"[OK] {name}服务已强制停止")


def main():
    """主函数"""
    print("=" * 60)
    print("A股预测训练平台 - 一键启动")
    print("=" * 60)
    
    # 清理旧进程
    kill_old_processes()

    print("\n检查运行环境...")
    if not check_python():
        input("按回车键退出...")
        return 1

    node_available = check_node()

    if not install_backend_deps():
        input("按回车键退出...")
        return 1

    if node_available:
        if not install_frontend_deps():
            print("[WARN] 前端依赖安装失败，将只启动后端")

    backend_process = start_backend()

    if node_available:
        time.sleep(2)
        frontend_process = start_frontend()

    if node_available:
        threading.Thread(target=open_browser, daemon=True).start()

    print("\n" + "=" * 60)
    print("启动完成！")
    print("=" * 60)
    print("\n访问地址:")
    print("  后端API:  http://localhost:8000")
    print("  API文档:  http://localhost:8000/docs")
    if node_available:
        print("  前端界面: http://localhost:3000")
    print("\n按 Ctrl+C 停止所有服务")
    print("=" * 60)

    try:
        while True:
            time.sleep(1)
            for name, process in processes:
                if process.poll() is not None:
                    print(f"\n[WARN] {name}服务已停止，退出码: {process.returncode}")
    except KeyboardInterrupt:
        print("\n\n收到停止信号...")
    finally:
        cleanup()

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print(f"\n启动失败: {e}")
        input("按回车键退出...")
        sys.exit(1)
