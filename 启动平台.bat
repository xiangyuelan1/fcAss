@echo off
chcp 65001 >nul
echo ========================================
echo    A股预测训练平台 - 启动脚本
echo ========================================
echo.

REM 检查Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到Python，请先安装Python 3.8+
    echo 下载地址: https://www.python.org/downloads/
    pause
    exit /b 1
)

REM 检查Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到Node.js，请先安装Node.js 16+
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

echo [1/4] 安装后端依赖...
cd /d "%~dp0backend"
pip install -r requirements.txt -q
if errorlevel 1 (
    echo [错误] 后端依赖安装失败
    pause
    exit /b 1
)
echo      完成

echo [2/4] 安装前端依赖...
cd /d "%~dp0frontend"
call npm install >nul 2>&1
if errorlevel 1 (
    echo [错误] 前端依赖安装失败
    pause
    exit /b 1
)
echo      完成

echo [3/4] 启动后端服务...
cd /d "%~dp0backend"
start "后端服务" cmd /k "python run.py"

echo [4/4] 启动前端服务...
cd /d "%~dp0frontend"
start "前端服务" cmd /k "npm run dev"

echo.
echo ========================================
echo    启动成功！
echo ========================================
echo.
echo 访问地址:
echo   前端界面: http://localhost:3000
echo   后端API:  http://localhost:8000
echo   API文档:  http://localhost:8000/docs
echo.
echo 初始账号: admin / admin123
echo.
echo 关闭窗口即可停止服务
echo ========================================
echo.

pause
