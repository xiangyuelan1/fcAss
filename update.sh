#!/bin/bash
set -e

echo "========================================="
echo "  A股预测平台 - 更新部署脚本"
echo "========================================="

if docker compose version &> /dev/null; then
    COMPOSE="docker compose"
else
    COMPOSE="docker-compose"
fi

echo ""
echo "[1/4] 拉取最新代码..."
git pull origin main 2>/dev/null || echo "提示: 非 Git 仓库或拉取失败，使用当前代码继续"

echo ""
echo "[2/4] 重新构建镜像..."
$COMPOSE build

echo ""
echo "[3/4] 重启服务（数据不会丢失）..."
$COMPOSE up -d

echo ""
echo "[4/4] 等待后端就绪..."
for i in $(seq 1 30); do
    if curl -sf http://localhost:8000/health > /dev/null 2>&1; then
        echo "服务已就绪!"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "警告: 服务未在预期时间内就绪"
    fi
    sleep 2
done

echo ""
echo "更新完成! 如需回滚: $COMPOSE down && $COMPOSE up -d"
echo "查看日志: $COMPOSE logs -f"
