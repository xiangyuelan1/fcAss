# A股预测训练平台启动脚本
# 需要以管理员权限运行

param(
    [switch]$SkipInstall,
    [switch]$BackendOnly,
    [switch]$FrontendOnly
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot

function Write-Status {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "   A股预测训练平台 - 启动脚本" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host ""

# 检查Python
Write-Status "检查Python环境..."
try {
    $pythonVersion = python --version 2>&1
    if ($pythonVersion -match "Python (\d+)\.(\d+)") {
        $major = [int]$matches[1]
        $minor = [int]$matches[2]
        if ($major -ge 3 -and $minor -ge 8) {
            Write-Success "Python版本: $pythonVersion"
        } else {
            Write-Error "Python版本过低，需要Python 3.8+"
            exit 1
        }
    }
} catch {
    Write-Error "未找到Python，请先安装Python 3.8+"
    Write-Host "下载地址: https://www.python.org/downloads/" -ForegroundColor Yellow
    exit 1
}

# 检查Node.js
if (-not $BackendOnly) {
    Write-Status "检查Node.js环境..."
    try {
        $nodeVersion = node --version 2>&1
        if ($nodeVersion -match "v(\d+)") {
            $major = [int]$matches[1]
            if ($major -ge 16) {
                Write-Success "Node.js版本: $nodeVersion"
            } else {
                Write-Error "Node.js版本过低，需要Node.js 16+"
                exit 1
            }
        }
    } catch {
        Write-Error "未找到Node.js，请先安装Node.js 16+"
        Write-Host "下载地址: https://nodejs.org/" -ForegroundColor Yellow
        exit 1
    }
}

# 安装后端依赖
if (-not $FrontendOnly) {
    Write-Status "安装后端依赖..."
    $backendPath = Join-Path $projectRoot "backend"
    Set-Location $backendPath
    
    if (-not $SkipInstall) {
        python -m pip install --upgrade pip -q
        pip install -r requirements.txt -q
        if ($LASTEXITCODE -ne 0) {
            Write-Error "后端依赖安装失败"
            exit 1
        }
    }
    Write-Success "后端依赖安装完成"
}

# 安装前端依赖
if (-not $BackendOnly) {
    Write-Status "安装前端依赖..."
    $frontendPath = Join-Path $projectRoot "frontend"
    Set-Location $frontendPath
    
    if (-not $SkipInstall) {
        npm install
        if ($LASTEXITCODE -ne 0) {
            Write-Error "前端依赖安装失败"
            exit 1
        }
    }
    Write-Success "前端依赖安装完成"
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "   启动服务" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host ""

# 启动后端
if (-not $FrontendOnly) {
    Write-Status "启动后端服务..."
    $backendPath = Join-Path $projectRoot "backend"
    Set-Location $backendPath
    
    Start-Process -FilePath "python" -ArgumentList "run.py" `
        -WorkingDirectory $backendPath `
        -NoNewWindow `
        -RedirectStandardOutput "backend_output.log" `
        -RedirectStandardError "backend_error.log"
    
    Start-Sleep -Seconds 2
    
    if (Test-Path "backend_output.log") {
        Write-Success "后端服务已启动 (PID: $((Get-Process | Where-Object {$_.CommandLine -like '*run.py*'}).Id))"
    }
}

# 启动前端
if (-not $BackendOnly) {
    Write-Status "启动前端服务..."
    $frontendPath = Join-Path $projectRoot "frontend"
    Set-Location $frontendPath
    
    Start-Process -FilePath "npm" -ArgumentList "run dev" `
        -WorkingDirectory $frontendPath `
        -NoNewWindow `
        -RedirectStandardOutput "frontend_output.log" `
        -RedirectStandardError "frontend_error.log"
    
    Start-Sleep -Seconds 3
    Write-Success "前端服务已启动"
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "   启动成功！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "访问地址:" -ForegroundColor Yellow
Write-Host "  前端界面: http://localhost:3000" -ForegroundColor White
Write-Host "  后端API:  http://localhost:8000" -ForegroundColor White
Write-Host "  API文档:  http://localhost:8000/docs" -ForegroundColor White
Write-Host ""
Write-Host "初始账号: admin / admin123" -ForegroundColor Yellow
Write-Host ""
Write-Host "按任意键打开浏览器..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

Start-Process "http://localhost:3000"
