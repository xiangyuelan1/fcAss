@echo off
chcp 65001 >nul
echo ========================================
echo    清理前端依赖
echo ========================================
echo.

cd /d "%~dp0frontend"

if exist "node_modules" (
    echo [1/3] 删除 node_modules...
    rmdir /s /q node_modules
    echo      完成
) else (
    echo [1/3] node_modules 不存在，跳过
)

if exist "package-lock.json" (
    echo [2/3] 删除 package-lock.json...
    del /q package-lock.json
    echo      完成
) else (
    echo [2/3] package-lock.json 不存在，跳过
)

echo [3/3] 重新安装依赖...
call npm install

if errorlevel 1 (
    echo.
    echo [错误] npm install 失败
    pause
    exit /b 1
)

echo.
echo ========================================
echo    清理完成！
echo ========================================
echo.
echo 下一步：运行 npm run dev 启动前端
echo.
pause
