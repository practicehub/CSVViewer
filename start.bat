@echo off
echo ========================================
echo CSV Data Management System
echo ========================================
echo.

:: 检查Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo [INFO] Node.js version:
node --version
echo.

:: 检查构建产物
if not exist "server\dist\index.js" (
    echo [ERROR] Server build files not found
    echo Please run 'npm run build' first
    pause
    exit /b 1
)

if not exist "client\dist\index.html" (
    echo [ERROR] Client build files not found
    echo Please run 'npm run build' first
    pause
    exit /b 1
)

:: 创建必要的目录
if not exist "server\uploads" (
    echo [INFO] Creating uploads directory...
    mkdir server\uploads
)

if not exist "server\data" (
    echo [INFO] Creating data directory...
    mkdir server\data
)

:: 设置环境变量
set NODE_ENV=production

:: 获取本机IP地址
echo [INFO] Getting network information...
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /C:"IPv4"') do set IP=%%a
set IP=%IP: =%

:: 从根目录启动（重要：依赖在根node_modules）
echo [INFO] Starting server from root directory...
echo.
echo ========================================
echo Access URLs:
echo ========================================
echo Local:            http://localhost:4000
if defined IP (
    echo Network:          http://%IP%:4000
    echo.
    echo Share this URL with devices on the same network!
)
echo ========================================
echo Press Ctrl+C to stop the server
echo ========================================
echo.

node server/dist/index.js

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Server failed to start
    pause
    exit /b 1
)

pause
