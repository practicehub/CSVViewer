#!/bin/bash

echo "========================================"
echo "CSV Data Management System"
echo "========================================"
echo

# 检查Node.js
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed or not in PATH"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

echo "[INFO] Node.js version:"
node --version
echo

# 检查构建产物
if [ ! -f "server/dist/index.js" ]; then
    echo "[ERROR] Server build files not found"
    echo "Please run 'npm run build' first"
    exit 1
fi

if [ ! -f "client/dist/index.html" ]; then
    echo "[ERROR] Client build files not found"
    echo "Please run 'npm run build' first"
    exit 1
fi

# 创建必要的目录
if [ ! -d "server/uploads" ]; then
    echo "[INFO] Creating uploads directory..."
    mkdir -p server/uploads
fi

if [ ! -d "server/data" ]; then
    echo "[INFO] Creating data directory..."
    mkdir -p server/data
fi

# 设置环境变量
export NODE_ENV=production

# 获取本机IP地址
echo "[INFO] Getting network information..."
LOCAL_IP=$(hostname -I | awk '{print $1}')

# 从根目录启动（重要：依赖在根node_modules）
echo "[INFO] Starting server from root directory..."
echo
echo "========================================"
echo "Access URLs:"
echo "========================================"
echo "Local:            http://localhost:8089"
if [ -n "$LOCAL_IP" ]; then
    echo "Network:          http://$LOCAL_IP:8089"
    echo
    echo "Share this URL with devices on the same network!"
fi
echo "========================================"
echo "Press Ctrl+C to stop the server"
echo "========================================"
echo

node server/dist/index.js

if [ $? -ne 0 ]; then
    echo
    echo "[ERROR] Server failed to start"
    exit 1
fi
