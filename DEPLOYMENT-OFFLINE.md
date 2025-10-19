# 内网离线部署指南

## 概述
本指南适用于**无法访问外网npm的内网环境**部署。需要在有网络的开发环境先构建完整的部署包。

## 准备工作（在开发环境执行）

### 1. 安装所有依赖
```bash
# 在项目根目录
cd d:\DevWorkspace\VibeCoding\webapp

# 安装根目录依赖
npm install

# 安装客户端依赖
cd client
npm install

# 安装服务端依赖
cd ../server
npm install

# 返回根目录
cd ..
```

### 2. 构建生产版本

#### 2.1 构建前端
```bash
cd client
npm run build
```

这将在 `client/dist` 目录生成静态文件

#### 2.2 构建后端
```bash
cd ../server
npm run build
```

这将在 `server/dist` 目录生成编译后的JS文件

### 3. 创建生产环境配置

#### 3.1 创建服务端环境变量
在 `server` 目录创建 `.env.production`:

```bash
PORT=4000
JWT_SECRET=your_production_jwt_secret_key_change_this
DATABASE_PATH=./data/db.sqlite
NODE_ENV=production
```

#### 3.2 修改服务端配置（可选）
如果需要修改服务端serve前端的逻辑，编辑 `server/src/index.ts`

## 打包部署

### 方案A：完整打包（推荐）

打包以下内容到 `webapp-deploy.zip`：

```
webapp/
├── node_modules/          # 根目录依赖（如果有）
├── client/
│   ├── dist/              # 前端构建产物（必需）
│   ├── node_modules/      # 客户端依赖（开发时需要）
│   ├── package.json
│   └── vite.config.ts
├── server/
│   ├── dist/              # 后端构建产物（必需）
│   ├── node_modules/      # 服务端依赖（必需！）
│   ├── package.json
│   ├── .env.production    # 生产环境配置
│   └── uploads/           # 上传目录（自动创建）
├── package.json
├── README.md
├── DEPLOYMENT-OFFLINE.md
└── start.bat              # Windows启动脚本
```

### 方案B：最小化打包

仅打包运行所需文件：

```
webapp-prod/
├── server/
│   ├── dist/              # 后端构建产物
│   ├── node_modules/      # 服务端依赖
│   ├── package.json
│   ├── .env.production
│   ├── uploads/
│   └── data/              # 数据库目录
├── client/
│   └── dist/              # 前端静态文件
└── start.bat
```

## 创建启动脚本

### Windows: `start.bat`

```batch
@echo off
echo Starting CSV Data Management System...
echo.

cd server

:: 检查Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Error: Node.js is not installed or not in PATH
    pause
    exit /b 1
)

:: 检查构建产物
if not exist "dist\index.js" (
    echo Error: Server build files not found. Please run 'npm run build' first.
    pause
    exit /b 1
)

:: 创建必要的目录
if not exist "uploads" mkdir uploads
if not exist "data" mkdir data

:: 设置环境变量
set NODE_ENV=production

:: 启动服务器
echo Server starting at http://localhost:4000
echo.
node dist/index.js

pause
```

### Linux/Mac: `start.sh`

```bash
#!/bin/bash

echo "Starting CSV Data Management System..."
echo

cd server

# 检查Node.js
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed or not in PATH"
    exit 1
fi

# 检查构建产物
if [ ! -f "dist/index.js" ]; then
    echo "Error: Server build files not found. Please run 'npm run build' first."
    exit 1
fi

# 创建必要的目录
mkdir -p uploads
mkdir -p data

# 设置环境变量
export NODE_ENV=production

# 启动服务器
echo "Server starting at http://localhost:4000"
echo
node dist/index.js
```

## 部署到内网环境

### 1. 传输部署包
```bash
# 压缩
tar -czf webapp-deploy.tar.gz webapp/
# 或
zip -r webapp-deploy.zip webapp/

# 传输到内网服务器
# 使用U盘、内网共享或其他方式
```

### 2. 解压
```bash
# Linux/Mac
tar -xzf webapp-deploy.tar.gz

# Windows
# 使用7-Zip或WinRAR解压
```

### 3. 配置环境变量
编辑 `server/.env.production`:
```bash
PORT=4000
JWT_SECRET=生产环境的密钥（请修改）
DATABASE_PATH=./data/db.sqlite
NODE_ENV=production
```

### 4. 启动服务

#### Windows
```batch
双击 start.bat
```

#### Linux/Mac
```bash
chmod +x start.sh
./start.sh
```

### 5. 访问应用
打开浏览器访问：`http://localhost:4000`

## 生产环境注意事项

### 1. 端口配置
如果4000端口被占用，修改 `.env.production` 中的 `PORT`

### 2. 反向代理（可选）
使用Nginx作为反向代理：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件
    location / {
        root /path/to/webapp/client/dist;
        try_files $uri $uri/ /index.html;
    }

    # API代理
    location /api {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 3. 进程管理（推荐）
使用PM2管理Node.js进程：

```bash
# 在内网环境需要提前安装PM2
# 或将PM2也包含在node_modules中

pm2 start server/dist/index.js --name csv-app
pm2 save
pm2 startup
```

### 4. 数据备份
定期备份以下目录：
- `server/data/` - 数据库文件
- `server/uploads/` - 上传的CSV文件

## 故障排除

### 1. 端口被占用
```bash
# Windows
netstat -ano | findstr :4000
taskkill /PID [PID号] /F

# Linux
lsof -i :4000
kill -9 [PID]
```

### 2. 权限问题（Linux）
```bash
chmod +x start.sh
chmod -R 755 server/uploads
chmod -R 755 server/data
```

### 3. Node.js版本
确保内网服务器Node.js版本 >= 16.x

```bash
node --version
```

### 4. 依赖缺失
如果某些原生模块在内网服务器无法运行，需要：
1. 在相同操作系统的开发环境重新安装依赖
2. 或使用Docker容器部署

## 系统要求

### 最低要求
- Node.js >= 16.x
- RAM >= 2GB
- 磁盘空间 >= 10GB（取决于CSV文件大小）

### 推荐配置
- Node.js >= 18.x
- RAM >= 4GB
- 磁盘空间 >= 50GB
- SSD存储

## 目录结构说明

```
生产环境目录结构：

webapp/
├── server/
│   ├── dist/                    # 编译后的后端代码
│   │   ├── index.js
│   │   ├── db.js
│   │   └── routes/
│   ├── node_modules/            # 后端依赖（必需）
│   ├── data/                    # SQLite数据库
│   │   └── db.sqlite
│   ├── uploads/                 # CSV文件上传目录
│   ├── package.json
│   └── .env.production
├── client/
│   └── dist/                    # 前端静态文件
│       ├── index.html
│       ├── assets/
│       └── ...
└── start.bat / start.sh         # 启动脚本
```

## 性能优化建议

1. **数据库优化**
   - 定期清理旧数据
   - 创建适当索引（已实现）

2. **文件存储**
   - 定期归档旧CSV文件
   - 考虑使用外部存储

3. **内存管理**
   - 设置Node.js内存限制：`node --max-old-space-size=4096 dist/index.js`

4. **并发处理**
   - 根据服务器配置调整并发上传限制

## 安全建议

1. **更改默认密钥**
   - 修改 `.env.production` 中的 `JWT_SECRET`

2. **网络隔离**
   - 在内网中配置防火墙规则
   - 仅允许特定IP访问

3. **定期更新**
   - 定期检查安全更新
   - 在开发环境测试后部署

4. **用户权限**
   - 实施严格的用户权限管理
   - 定期审计用户活动

## 联系支持

如有问题，请参考：
- README.md - 项目说明
- DEPLOYMENT.md - 常规部署指南
- 项目Issues - 问题跟踪

祝部署顺利！🚀
