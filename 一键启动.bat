@echo off
chcp 65001 >nul
echo ========================================
echo    A股预测训练平台 - 一键启动
echo ========================================
echo.

REM 获取脚本所在目录
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

REM 检查Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到Python
    echo 请先安装Python 3.8+
    echo 下载地址: https://www.python.org/downloads/
    pause
    exit /b 1
)

REM 检查Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到Node.js
    echo 请先安装Node.js 16+
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

echo [检查] Python和Node.js已就绪
echo.

REM 启动后端（在当前窗口）
echo [1/3] 启动后端服务...
cd /d "%SCRIPT_DIR%backend"
start "后端服务-不要关闭" cmd /k "title 后端服务 && python run.py && pause"

REM 等待后端启动
echo       等待3秒...
timeout /t 3 /nobreak >nul

REM 启动前端（在当前窗口）
echo [2/3] 启动前端服务...
cd /d "%SCRIPT_DIR%frontend"
start "前端服务-不要关闭" cmd /k "title 前端服务 && npm run dev && pause"

echo [3/3] 完成
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
echo 请打开浏览器访问 http://localhost:3000
echo.
echo 提示: 两个服务窗口不要关闭
echo ========================================
echo.
pause
