#!/bin/bash

# A股预测训练平台启动脚本

echo "🚀 A股预测训练平台启动脚本"
echo "================================"

# 检查Python环境
if ! command -v python3 &> /dev/null; then
    echo "❌ 未找到Python3，请先安装Python 3.8+"
    exit 1
fi

# 检查Node.js环境
if ! command -v node &> /dev/null; then
    echo "❌ 未找到Node.js，请先安装Node.js 16+"
    exit 1
fi

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 启动后端
echo ""
echo "📦 启动后端服务..."
cd backend

# 检查虚拟环境
if [ ! -d "venv" ]; then
    echo "创建Python虚拟环境..."
    python3 -m venv venv
fi

# 激活虚拟环境
source venv/bin/activate

# 安装依赖
echo "安装后端依赖..."
pip install -q -r requirements.txt

# 启动后端（后台运行）
echo "启动后端服务..."
python run.py &
BACKEND_PID=$!
echo "后端服务PID: $BACKEND_PID"

cd ..

# 等待后端启动
sleep 3

# 启动前端
echo ""
echo "🎨 启动前端服务..."
cd frontend

# 安装依赖
echo "安装前端依赖..."
npm install -q

# 启动前端（后台运行）
echo "启动前端服务..."
npm run dev &
FRONTEND_PID=$!
echo "前端服务PID: $FRONTEND_PID"

cd ..

echo ""
echo "================================"
echo "✅ 服务启动成功！"
echo ""
echo "📍 访问地址:"
echo "   前端界面: http://localhost:3000"
echo "   后端API:  http://localhost:8000"
echo "   API文档:  http://localhost:8000/docs"
echo ""
echo "📝 使用说明:"
echo "   1. 打开 http://localhost:3000 访问平台"
echo "   2. 进入'数据管理'同步股票数据"
echo "   3. 使用'特征工程'选择技术指标"
echo "   4. 在'模型管理'创建和训练模型"
echo "   5. 查看'回测分析'验证策略效果"
echo ""
echo "⚠️  按 Ctrl+C 停止所有服务"
echo "================================"

# 捕获中断信号
trap "echo ''; echo '🛑 正在停止服务...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT

# 等待
wait
