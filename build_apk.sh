#!/bin/bash
set -e

echo "========================================"
echo "  A股预测训练平台 - Android APK 构建"
echo "========================================"
echo ""

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -z "$JAVA_HOME" ]; then
    echo "[错误] JAVA_HOME 环境变量未设置"
    echo "请安装 JDK 17 并设置 JAVA_HOME"
    exit 1
fi
echo "[OK] JAVA_HOME: $JAVA_HOME"

if [ -z "$ANDROID_HOME" ]; then
    echo "[错误] ANDROID_HOME 环境变量未设置"
    exit 1
fi
echo "[OK] ANDROID_HOME: $ANDROID_HOME"

echo ""
echo "[步骤1/4] 构建前端..."
cd "$SCRIPT_DIR/frontend"
npm run build
echo "[OK] 前端构建完成"

echo ""
echo "[步骤2/4] 同步到Android..."
npx cap sync android
echo "[OK] 同步完成"

echo ""
echo "[步骤3/4] 构建APK..."
cd android
chmod +x gradlew
./gradlew assembleDebug
echo "[OK] APK构建完成"

echo ""
echo "[步骤4/4] 复制APK到下载目录..."
cd "$SCRIPT_DIR"
mkdir -p app_downloads
cp frontend/android/app/build/outputs/apk/debug/app-debug.apk app_downloads/app-debug.apk

echo ""
echo "========================================"
echo "  构建完成！"
echo "========================================"
echo ""
echo "APK 文件: $SCRIPT_DIR/app_downloads/app-debug.apk"
echo ""
echo "后续步骤:"
echo "  1. git add app_downloads/app-debug.apk"
echo "  2. git commit -m '更新 Android APK'"
echo "  3. git push"
echo "  4. 在服务器上: git pull && docker-compose up -d --build backend"
