# CSV Viewer

基于 React + Express 的百万行 CSV 数据查看系统，支持内网离线部署。

## 🎯 功能特点

### 核心功能
- ✅ **用户认证** - JWT token 安全认证
- ✅ **CSV 文件上传** - 支持 100MB+ 大文件
- ✅ **百万行数据处理** - Papa Parse 正确解析，JSON 存储完整保留内容
- ✅ **服务端分页** - 50/100/200/500 行可选，秒级响应
- ✅ **高级筛选**
  - 时间范围筛选（秒级精度）
  - 关键字搜索
  - 列选择过滤
- ✅ **批量操作** - 文件勾选和批量删除
- ✅ **详情查看** - 点击行查看完整详情，多行内容完美显示
- ✅ **时区转换** - UTC 自动转换为本地时区

### 技术亮点
- 📦 npm workspaces 单仓库管理
- 🚀 Papa Parse RFC 4180 标准 CSV 解析
- 💾 SQLite 数据库，JSON 格式存储（保留所有换行符）
- 🔒 向后兼容旧数据格式
- 🌐 完整离线部署支持

## 📋 技术栈

### 前端
- React 18 + TypeScript
- Material-UI (MUI)
- Vite
- React Router v6
- Axios

### 后端
- Node.js + Express
- TypeScript
- SQLite3 (better-sqlite3)
- JWT 认证
- Papa Parse
- Multer (文件上传)

## 🚀 快速开始

### 系统要求
- Node.js >= 16.x
- npm >= 8.x

### 开发环境

#### 1. 安装依赖
```bash
npm install
```

#### 2. 启动开发服务器
```bash
# 同时启动前后端
npm run dev

# 或分别启动
cd client && npm run dev  # http://localhost:5173
cd server && npm run dev  # http://localhost:4000
```

### 生产环境

#### 1. 构建项目
```bash
# 自动构建脚本（推荐）
# Windows
.\build-for-deploy.bat

# Linux/Mac
chmod +x build-for-deploy.sh
./build-for-deploy.sh
```

或手动构建：
```bash
npm run build
```

#### 2. 启动服务
```bash
# Windows
.\start.bat

# Linux/Mac
chmod +x start.sh
./start.sh
```

#### 3. 访问应用

**本地访问**：
```
http://localhost:4000
```

**局域网访问**（同一网络内的其他设备）：
```
http://<your-ip>:4000
例如: http://192.168.31.65:4000
```

> 💡 启动脚本会自动显示可用的访问地址和本机IP

**局域网访问说明**：
- ✅ 服务器监听在 `0.0.0.0`，支持所有网络接口
- ✅ 同一局域网内的设备都可以访问
- ✅ 启动时会自动显示本机IP地址
- ✅ 适合团队内部共享使用
- ✅ 手机、平板等移动设备也可访问

## 📦 项目结构

```
webapp/
├── node_modules/              # 所有依赖（npm workspaces 提升）
├── client/                    # 前端应用
│   ├── dist/                  # 构建产物
│   ├── src/                   # 源代码
│   │   ├── components/
│   │   ├── contexts/
│   │   ├── pages/
│   │   └── App.tsx
│   ├── package.json
│   └── vite.config.ts
├── server/                    # 后端应用
│   ├── dist/                  # 构建产物
│   ├── src/                   # 源代码
│   │   ├── routes/
│   │   ├── middleware/
│   │   ├── db.ts
│   │   └── index.ts
│   ├── data/                  # SQLite 数据库
│   ├── uploads/               # 上传文件
│   ├── package.json
│   └── tsconfig.json
├── package.json               # 根配置（workspaces）
├── start.bat                  # Windows 启动脚本
├── start.sh                   # Linux 启动脚本
├── build-for-deploy.bat       # Windows 构建脚本
├── build-for-deploy.sh        # Linux 构建脚本
├── DEPLOYMENT-OFFLINE.md      # 内网部署指南
└── README.md
```

## 🔑 重要说明

### npm workspaces 架构
本项目使用 npm workspaces，**所有依赖都提升到根目录的 node_modules/**：

```
✅ 正确理解：
webapp/node_modules/  ← 所有依赖都在这里（约200MB）
├── express/          (server 依赖)
├── react/            (client 依赖)
├── @mui/material/    (client 依赖)
└── ...

❌ 不存在：
client/node_modules/  ← 空（依赖已提升）
server/node_modules/  ← 空（依赖已提升）
```

### 启动方式
**必须从根目录启动**，因为依赖在根 node_modules：

```bash
# ✅ 正确
node server/dist/index.js  # 从根目录

# ❌ 错误
cd server
node dist/index.js  # 找不到 node_modules
```

## 🌐 内网部署

详细部署指南请参考：[DEPLOYMENT-OFFLINE.md](DEPLOYMENT-OFFLINE.md)

### 快速部署流程

#### 1. 开发环境准备
```bash
# 运行自动构建脚本
.\build-for-deploy.bat  # Windows
./build-for-deploy.sh   # Linux
```

#### 2. 打包传输
压缩以下内容（约 205MB）：
```
webapp/
├── node_modules/     ✅ 必需！所有运行时依赖
├── client/dist/      ✅ 必需！前端静态文件
├── server/dist/      ✅ 必需！后端代码
├── server/data/      (数据库，可选)
├── package.json      ✅ 必需！workspaces 配置
└── start.bat/sh      ✅ 必需！启动脚本
```

#### 3. 内网环境
```bash
# 1. 解压
# 2. 确保 Node.js >= 16.x
# 3. 启动
.\start.bat  # 或 ./start.sh
```

## 🔧 环境配置

### 服务端环境变量
创建 `server/.env.production`:
```env
PORT=4000
JWT_SECRET=your_secure_secret_key_here
DATABASE_PATH=./data/db.sqlite
NODE_ENV=production
```

## 📖 API 文档

### 认证 API
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `GET /api/auth/profile` - 获取用户信息

### CSV API
- `POST /api/csv/upload` - 上传 CSV 文件
- `GET /api/csv/list` - 获取文件列表
- `GET /api/csv/:id` - 获取文件数据（分页）
- `GET /api/csv/:id/row/:rowNumber` - 获取单行详情
- `DELETE /api/csv/:id` - 删除单个文件
- `POST /api/csv/batch-delete` - 批量删除文件

## 🐛 故障排除

### 端口被占用
```bash
# 修改 server/.env 中的 PORT
PORT=5000
```

### 构建失败
```bash
# 清理并重新安装
rm -rf node_modules package-lock.json
npm install
npm run build
```

### 启动失败
```bash
# 检查构建产物
ls server/dist/index.js
ls client/dist/index.html

# 如果不存在，重新构建
npm run build
```

## 📝 开发指南

### 添加新功能
```bash
# 1. 修改代码
# 2. 重新构建
npm run build

# 3. 测试
.\start.bat
```

### 修改前端
```bash
cd client
npm run dev  # 热重载开发
```

### 修改后端
```bash
cd server
npm run dev  # 热重载开发
```

## 📄 许可证

GNU General Public License v3.0

本项目采用 GPL-3.0 开源许可证。详情请查看 [LICENSE](LICENSE) 文件。

## 🙋 支持

遇到问题？
1. 查看 [DEPLOYMENT-OFFLINE.md](DEPLOYMENT-OFFLINE.md)
2. 检查故障排除部分
3. 提交 Issue

---

**项目完成度**: 100% ✅

**主要功能**:
- ✅ 百万行 POD 日志处理
- ✅ 完整的用户认证系统
- ✅ 高级筛选和搜索
- ✅ 批量文件管理
- ✅ 详情查看（多行支持）
- ✅ 时区自动转换
- ✅ 完整离线部署方案
