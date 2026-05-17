#!/bin/bash
set -e

echo "========================================="
echo "  A股预测平台 - 一键部署脚本"
echo "========================================="

# 检查 Docker
if ! command -v docker &> /dev/null; then
    echo "错误: 未安装 Docker，请先安装"
    exit 1
fi

if ! docker compose version &> /dev/null && ! docker-compose version &> /dev/null; then
    echo "错误: 未安装 Docker Compose，请先安装"
    exit 1
fi

# 确定 compose 命令
if docker compose version &> /dev/null; then
    COMPOSE="docker compose"
else
    COMPOSE="docker-compose"
fi

# 生成随机 SECRET_KEY（如果 .env 不存在）
if [ ! -f .env ]; then
    SECRET_KEY=$(openssl rand -hex 32 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(32))" 2>/dev/null || echo "change-me-$(date +%s)")
    echo "SECRET_KEY=${SECRET_KEY}" > .env
    echo "已生成 SECRET_KEY 并保存到 .env"
else
    echo "检测到已有 .env 文件，跳过 SECRET_KEY 生成"
fi

# 构建镜像
echo ""
echo "[1/3] 构建 Docker 镜像..."
$COMPOSE build --no-cache

# 启动服务
echo ""
echo "[2/3] 启动服务..."
$COMPOSE up -d

# 等待后端健康检查
echo ""
echo "[3/3] 等待后端服务就绪..."
for i in $(seq 1 30); do
    if curl -sf http://localhost:8000/health > /dev/null 2>&1; then
        echo "后端服务已就绪!"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "警告: 后端服务未在预期时间内就绪，请检查日志: $COMPOSE logs backend"
    fi
    sleep 2
done

# 创建管理员
echo ""
echo "========================================="
echo "  部署完成!"
echo "========================================="
echo ""
echo "  访问地址: http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo '服务器IP')"
echo "  API文档:  http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo '服务器IP')/docs"
echo ""
echo "  创建管理员账户:"
echo "    $COMPOSE exec backend python create_admin.py"
echo ""
echo "  查看日志:"
echo "    $COMPOSE logs -f"
echo ""
