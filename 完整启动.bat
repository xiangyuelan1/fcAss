@echo off
chcp 65001 >nul
echo ========================================
echo    A股预测训练平台 - 完整启动
echo ========================================
echo.

set "PYTHON_CMD="
set "NODE_CMD="

REM 检查Python（尝试多个可能的位置）
where python >nul 2>&1
if %errorlevel% equ 0 (
    set "PYTHON_CMD=python"
) else (
    if exist "C:\Program Files\Python311\python.exe" set "PYTHON_CMD=C:\Program Files\Python311\python.exe"
    if exist "C:\Program Files\Python310\python.exe" set "PYTHON_CMD=C:\Program Files\Python310\python.exe"
    if exist "C:\Program Files\Python39\python.exe" set "PYTHON_CMD=C:\Program Files\Python39\python.exe"
)

REM 检查Node.js
where node >nul 2>&1
if %errorlevel% equ 0 set "NODE_CMD=node"

REM 如果找不到Python
if "%PYTHON_CMD%"=="" (
    echo [错误] 未找到Python
    echo 请确保已安装Python 3.8+
    pause
    exit /b 1
)

echo [检查] Python: %PYTHON_CMD%
if "%NODE_CMD%"=="" (
    echo [警告] 未找到Node.js，前端将无法启动
) else (
    echo [检查] Node.js: %NODE_CMD%
)

echo.

REM 获取脚本所在目录
set "SCRIPT_DIR=%~dp0"

REM 启动后端
echo [1/3] 启动后端服务...
cd /d "%SCRIPT_DIR%backend"
start "后端服务-请勿关闭此窗口" cmd /k "title 后端服务 && "%PYTHON_CMD%" run.py && pause"

REM 等待
timeout /t 2 /nobreak >nul

REM 启动前端
if not "%NODE_CMD%"=="" (
    echo [2/3] 启动前端服务...
    cd /d "%SCRIPT_DIR%frontend"
    start "前端服务-请勿关闭此窗口" cmd /k "title 前端服务 && npm run dev && pause"
) else (
    echo [2/3] 跳过前端（Node.js未安装）
)

echo [3/3] 完成
echo.
echo ========================================
echo    启动完成！
echo ========================================
echo.
echo 访问地址:
echo   后端API:  http://localhost:8000
echo   API文档:  http://localhost:8000/docs
if not "%NODE_CMD%"=="" (
    echo   前端界面: http://localhost:3000
)
echo.
echo ========================================
echo.
pause
