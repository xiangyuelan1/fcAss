# Windows 环境配置指南 - 构建 Android APK

本指南将帮助你在 Windows 电脑上配置好构建 Android APK 所需的完整环境。

---

## 🌱 环境需求

| 组件 | 推荐版本 | 说明 |
|------|----------|------|
| JDK | 17 | Gradle 8.x 要求 JDK 17+ |
| Android SDK | 34 | 项目配置的编译目标 |
| Node.js | 16+ | 前端构建 |

---

## 📦 步骤 1: 安装 JDK 17

### 下载
访问 [Adoptium](https://adoptium.net/) 下载 **Temurin 17 (LTS)** - Windows x64 MSI 安装包

### 安装
1. 运行下载的 MSI 安装包
2. 一路点击"下一步"，使用默认选项安装
3. 安装完成后，验证安装：
```powershell
java -version
```
应该显示类似 `openjdk version "17.0.x"`

---

## 📦 步骤 2: 安装 Android Studio

### 下载
访问 [Android Studio 官网](https://developer.android.com/studio) 下载 Windows 版本

### 安装
1. 运行下载的 exe 安装包
2. 一路点击"下一步"，使用默认选项安装
3. 首次启动 Android Studio，**欢迎页 → Next → Standard → Next → Next → Finish**
4. Android Studio 会自动下载 SDK 组件（约 1-2 GB，需要等待）

### 设置环境变量

1. 打开 **系统属性 → 环境变量**
2. 在"用户变量"中添加：

| 变量名 | 值 |
|--------|-----|
| `ANDROID_HOME` | `C:\Users\你的用户名\AppData\Local\Android\Sdk` |
| `JAVA_HOME` | `C:\Program Files\Eclipse Adoptium\jdk-17.0.x-hotspot` (根据实际安装路径) |

3. 编辑 `Path` 变量，追加：
```
%ANDROID_HOME%\platform-tools
%ANDROID_HOME%\build-tools\34.0.0
%ANDROID_HOME%\cmdline-tools\latest\bin
%JAVA_HOME%\bin
```

### 验证环境变量
打开新的 PowerShell 窗口，运行：
```powershell
echo $env:ANDROID_HOME
echo $env:JAVA_HOME
java -version
adb version
sdkmanager --version
```

---

## 📦 步骤 3: 安装 Android SDK 组件

在 Android Studio 中：

1. **File → Settings → Appearance & Behavior → System Settings → Android SDK**
2. 点击 "SDK Tools" 标签页
3. 勾选以下组件：
   - ✅ Android SDK Build-Tools 34
   - ✅ Android SDK Platform-Tools
   - ✅ Android SDK Tools (Obsolete)
   - ✅ Google USB Driver (可选)
4. 点击 "OK" 安装

或者使用命令行（已配置好环境变量的前提下）：
```powershell
sdkmanager "platforms;android-34"
sdkmanager "build-tools;34.0.0"
sdkmanager "platform-tools"
```

---

## 🚀 步骤 4: 构建 APK

环境配置完成后，在项目根目录运行：

```powershell
# Windows 批处理（推荐）
.\build_apk.bat

# 或者 npm 命令（前端目录）
cd frontend
npm run build:apk
```

构建成功后，APK 文件位于：
```
app_downloads\app-debug.apk
```

---

## 📝 步骤 5: 部署到服务器

```powershell
# 1. 提交 APK
git add app_downloads\app-debug.apk
git commit -m "更新 Android APK"
git push

# 2. 在服务器上
git pull
docker-compose up -d --build backend
```

---

## ⚠️ 常见问题

### 问题 1: `java` 命令找不到
→ 重新检查 `JAVA_HOME` 环境变量和 `Path` 配置，确保指向正确的 JDK 安装路径

### 问题 2: Gradle 构建慢
→ 配置国内镜像：编辑 `android/gradle.properties`，添加：
```properties
systemProp.https.proxyHost=mirrors.aliyun.com
systemProp.https.proxyPort=443
```

### 问题 3: SDK 许可证不接受
→ 运行：
```powershell
sdkmanager --licenses
```
一路按 `y` 接受所有许可证

---

## 📖 参考资料

- [Android Studio 官方文档](https://developer.android.com/studio/install)
- [Capacitor Android 文档](https://capacitorjs.com/docs/android)

---

如有问题，请查看 `frontend/ANDROID_BUILD.md` 获取更多详细信息！
