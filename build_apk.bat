@echo off
chcp 65001 >nul 2>&1
echo ========================================
echo   A股预测训练平台 - Android APK 构建
echo ========================================
echo.

:: 检查 JAVA_HOME
if not defined JAVA_HOME (
    echo [错误] JAVA_HOME 环境变量未设置
    echo 请安装 JDK 17 并设置 JAVA_HOME
    echo 下载地址: https://adoptium.net/
    pause
    exit /b 1
)
echo [OK] JAVA_HOME: %JAVA_HOME%

:: 检查 ANDROID_HOME
if not defined ANDROID_HOME (
    echo [错误] ANDROID_HOME 环境变量未设置
    echo 请安装 Android SDK 并设置 ANDROID_HOME
    echo 可通过 Android Studio 安装，或下载命令行工具:
    echo https://developer.android.com/studio#command-line-tools-only
    pause
    exit /b 1
)
echo [OK] ANDROID_HOME: %ANDROID_HOME%

:: 步骤1: 构建前端
echo.
echo [步骤1/4] 构建前端...
cd /d "%~dp0frontend"
call npm run build
if errorlevel 1 (
    echo [错误] 前端构建失败
    pause
    exit /b 1
)
echo [OK] 前端构建完成

:: 步骤2: 同步到Android
echo.
echo [步骤2/4] 同步到Android...
call npx cap sync android
if errorlevel 1 (
    echo [错误] 同步失败
    pause
    exit /b 1
)
echo [OK] 同步完成

:: 步骤3: 构建APK
echo.
echo [步骤3/4] 构建APK...
cd android
call gradlew.bat assembleDebug
if errorlevel 1 (
    echo [错误] APK构建失败
    pause
    exit /b 1
)
echo [OK] APK构建完成

:: 步骤4: 复制到app_downloads
echo.
echo [步骤4/4] 复制APK到下载目录...
cd /d "%~dp0"
if not exist "app_downloads" mkdir "app_downloads"
copy /Y "frontend\android\app\build\outputs\apk\debug\app-debug.apk" "app_downloads\app-debug.apk"
if errorlevel 1 (
    echo [错误] 复制失败
    pause
    exit /b 1
)

echo.
echo ========================================
echo   构建完成！
echo ========================================
echo.
echo APK 文件: %~dp0app_downloads\app-debug.apk
echo.
echo 后续步骤:
echo   1. git add app_downloads\app-debug.apk
echo   2. git commit -m "更新 Android APK"
echo   3. git push
echo   4. 在服务器上: git pull ^&^& docker-compose up -d --build backend
echo.
pause
