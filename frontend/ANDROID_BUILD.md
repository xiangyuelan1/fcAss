# Android App 构建指南

## 前置条件

1. 安装 Android Studio: https://developer.android.com/studio
2. 安装 JDK 17+
3. 设置 ANDROID_HOME 环境变量

## 构建步骤

### 1. 构建前端并同步到 Android

```bash
cd frontend
npm run build:android
```

### 2. 用 Android Studio 打开项目

```bash
npx cap open android
```

### 3. 在 Android Studio 中构建 APK

1. 菜单: Build → Build Bundle(s) / APK(s) → Build APK(s)
2. 等待构建完成
3. APK 输出路径: `android/app/build/outputs/apk/debug/app-debug.apk`

### 4. 或者用命令行构建

```bash
cd android
./gradlew assembleDebug
```

APK 输出路径: `android/app/build/outputs/apk/debug/app-debug.apk`

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

## 网站提供下载

构建完成后，将 APK 文件放到后端可访问的位置：
- 开发版: `frontend/android/app/build/outputs/apk/debug/app-debug.apk`
- 用户可通过 `/api/app/download` 接口检查和下载

## 常见问题

### Gradle 下载慢
编辑 `android/gradle/wrapper/gradle-wrapper.properties`，将 distributionUrl 改为国内镜像。

### SDK 版本问题
编辑 `android/variables.gradle`，调整 compileSdkVersion、minSdkVersion、targetSdkVersion。
