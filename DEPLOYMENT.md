# 部署指南

## 环境要求

### 基础环境
- Python 3.8+
- Node.js 16+
- npm 或 yarn
- Git

### 可选环境
- Docker & Docker Compose (推荐)
- PostgreSQL (生产环境)
- Redis (缓存)

## 本地开发部署

### 方式一：使用启动脚本（Windows）

1. 双击运行 `启动平台.bat` 或 `启动平台.ps1`

2. 脚本会自动：
   - 检查Python和Node.js环境
   - 安装后端依赖
   - 安装前端依赖
   - 启动后端服务 (http://localhost:8000)
   - 启动前端服务 (http://localhost:3000)

### 方式二：手动部署

#### 1. 克隆项目
```bash
git clone <repository-url>
cd a_stock_trainer
```

#### 2. 安装后端依赖
```bash
cd backend
pip install -r requirements.txt
```

#### 3. 安装前端依赖
```bash
cd ../frontend
npm install
```

#### 4. 启动后端
```bash
cd backend
python run.py
```

#### 5. 启动前端（新终端）
```bash
cd frontend
npm run dev
```

#### 6. 访问应用
- 前端界面: http://localhost:3000
- 后端API: http://localhost:8000
- API文档: http://localhost:8000/docs

## Docker部署（推荐）

### 前提条件
- Docker 20.10+
- Docker Compose 2.0+

### 部署步骤

#### 1. 配置环境变量
```bash
cp .env.example .env
# 编辑 .env 文件，修改 SECRET_KEY 等配置
```

#### 2. 启动服务
```bash
# 启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f
```

#### 3. 访问应用
- 前端界面: http://localhost:3000
- 后端API: http://localhost:8000

### Docker常用命令

```bash
# 停止服务
docker-compose down

# 重新构建并启动
docker-compose up -d --build

# 查看后端日志
docker-compose logs -f backend

# 进入后端容器
docker exec -it a_stock_backend bash

# 数据持久化
docker-compose down -v  # 会删除数据卷
docker-compose down     # 保留数据卷
```

## 生产环境部署

### 1. 服务器准备

#### 使用Ubuntu 20.04+
```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 安装Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.0.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### 2. 域名配置
```bash
# 安装Nginx
sudo apt install nginx -y

# 配置Nginx反向代理
sudo nano /etc/nginx/sites-available/a_stock
```

配置文件示例：
```nginx
server {
    listen 80;
    server_name your-domain.com;

    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
# 启用站点
sudo ln -s /etc/nginx/sites-available/a_stock /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 3. SSL证书（Let's Encrypt）
```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d your-domain.com
```

### 4. 配置防火墙
```bash
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

### 5. 使用Systemd管理服务

创建后端服务文件：
```bash
sudo nano /etc/systemd/system/a-stock-backend.service
```

内容：
```ini
[Unit]
Description=A股预测训练平台后端服务
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/var/www/a_stock_trainer/backend
ExecStart=/usr/bin/python3 /var/www/a_stock_trainer/backend/run.py
Restart=always
Environment="PATH=/usr/local/bin:/usr/bin:/bin"
Environment="PYTHONUNBUFFERED=1"

[Install]
WantedBy=multi-user.target
```

启动服务：
```bash
sudo systemctl daemon-reload
sudo systemctl start a-stock-backend
sudo systemctl enable a-stock-backend
```

## 初始配置

### 创建管理员账号

启动服务后，通过API创建管理员：

```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123", "email": "admin@example.com"}'
```

### 配置数据源

1. 访问 http://localhost:3000
2. 登录后进入"数据管理"
3. 点击"同步股票列表"
4. 选择要同步的股票

## 备份与恢复

### 备份数据
```bash
# 备份数据库
cp a_stock_trainer.db a_stock_trainer_backup_$(date +%Y%m%d).db

# 备份模型文件
tar -czf models_backup_$(date +%Y%m%d).tar.gz models/

# 备份Docker数据卷
docker run --rm -v a_stock_trainer_data:/data -v $(pwd):/backup alpine tar czf /backup/data_backup.tar.gz /data
```

### 恢复数据
```bash
# 恢复数据库
cp a_stock_trainer_backup_20240101.db a_stock_trainer.db

# 恢复模型文件
tar -xzf models_backup_20240101.tar.gz

# 恢复Docker数据卷
docker run --rm -v a_stock_trainer_data:/data -v $(pwd):/backup alpine tar xzf /backup/data_backup.tar.gz -C /
```

## 监控与日志

### 查看日志
```bash
# Docker日志
docker-compose logs -f backend

# 系统日志
tail -f logs/app.log
tail -f logs/error.log
```

### 性能监控
建议使用：
- Prometheus + Grafana (Docker监控)
- New Relic / Sentry (应用性能监控)

## 故障排除

### 常见问题

#### 1. 后端启动失败
```bash
# 检查Python依赖
pip install -r requirements.txt

# 检查端口占用
netstat -an | grep 8000

# 查看错误日志
python run.py 2>&1
```

#### 2. 前端构建失败
```bash
# 清理缓存
rm -rf node_modules package-lock.json
npm install
```

#### 3. 数据库连接失败
```bash
# 检查数据库文件
ls -la *.db

# 重新初始化
rm a_stock_trainer.db
python -c "from app.core.database import init_db; init_db()"
```

#### 4. Docker容器无法启动
```bash
# 清理Docker
docker system prune -a
docker volume prune

# 重新构建
docker-compose down
docker-compose up -d --build
```

## 安全建议

### 生产环境必做

1. **修改SECRET_KEY**
   ```bash
   # 生成强密钥
   python -c "import secrets; print(secrets.token_hex(32))"
   ```

2. **启用HTTPS**
   - 使用Let's Encrypt自动续期
   - 强制HTTP重定向到HTTPS

3. **配置防火墙**
   - 仅开放80/443端口
   - 使用VPN管理服务器

4. **定期备份**
   - 每日自动备份
   - 异地存储备份

5. **监控告警**
   - 设置资源使用告警
   - 设置错误率告警

## 技术支持

如遇问题，请检查：
1. 日志文件 (`logs/app.log`)
2. API文档 (`/docs`)
3. GitHub Issues
