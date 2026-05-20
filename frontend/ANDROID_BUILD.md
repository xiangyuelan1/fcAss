# Android App 构建指南

## 前置条件

1. 安装 Android Studio: https://developer.android.com/studio
2. 安装 JDK 17+
3. 设置 ANDROID_HOME 环境变量

## 本地构建 APK 并部署到服务器

### 步骤 1：构建前端并同步到 Android

```bash
cd frontend
npm run build:android
```

### 步骤 2：用 Android Studio 打开项目

```bash
npx cap open android
```

### 步骤 3：在 Android Studio 中构建 APK

1. 菜单: Build → Build Bundle(s) / APK(s) → Build APK(s)
2. 等待构建完成
3. APK 输出路径: `android/app/build/outputs/apk/debug/app-debug.apk`

### 步骤 4：复制 APK 到 app_downloads 目录

```bash
# 从项目根目录
copy frontend\android\app\build\outputs\apk\debug\app-debug.apk app_downloads\
# 或者 Linux/Mac
cp frontend/android/app/build/outputs/apk/debug/app-debug.apk app_downloads/
```

### 步骤 5：提交到 git 并推送到服务器

```bash
git add app_downloads/app-debug.apk
git commit -m "更新 Android APK"
git push
```

### 步骤 6：在服务器上拉取并重启 Docker

```bash
git pull
docker-compose up -d --build backend
```

现在，用户可以通过网站的"下载安卓App"按钮下载了！

---

## 发布版本（签名）

1. 生成签名密钥:
```bash
keytool -genkey -v -keystore astock-release.keystore -alias astock -keyalg RSA -keysize 2048 -validity 10000
```

2. 将 keystore 文件放到 `android/app/` 目录

3. 在 `android/gradle.properties` 中添加:
```
APP_RELEASE_STORE_FILE=astock-release.keystore
APP_RELEASE_KEY_ALIAS=astock
APP_RELEASE_STORE_PASSWORD=你的密码
APP_RELEASE_KEY_PASSWORD=你的密码
```

4. 构建发布版:
```bash
cd android
./gradlew assembleRelease
```

5. 将 `app-release.apk` 复制到 `app_downloads/` 并重命名为 `app-debug.apk`（或者改后端代码支持 release 版本）

---

## 验证 APK 下载

1. 访问 `/api/app/download` 接口查看状态
2. 前端的"下载安卓App"按钮应该可用
3. 点击按钮应该能正常下载

---

## 常见问题

### Gradle 下载慢
编辑 `android/gradle/wrapper/gradle-wrapper.properties`，将 distributionUrl 改为国内镜像。

### SDK 版本问题
编辑 `android/variables.gradle`，调整 compileSdkVersion、minSdkVersion、targetSdkVersion。

### APK 文件名问题
后端默认下载 `app-debug.apk`，如果是 release 版本，需要：
- 重命名文件为 `app-debug.apk`，或者
- 修改 [backend/app/main.py](file:///d:/桌面/TRAESOLO/A股预测平台/开发A股预测训练平台/a_stock_trainer/backend/app/main.py#L143) 中的文件名
