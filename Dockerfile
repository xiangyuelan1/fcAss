# A股预测训练平台 Dockerfile

FROM python:3.10-slim

WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖文件
COPY backend/requirements.txt .

# 安装Python依赖
RUN pip install --no-cache-dir -r requirements.txt

# 复制应用代码
COPY backend/ .

# 创建数据目录
RUN mkdir -p /app/data /app/models /app/logs

# 暴露端口
EXPOSE 8000

# 环境变量
ENV PYTHONUNBUFFERED=1
ENV DEBUG=False

# 启动命令
CMD ["python", "run.py"]
