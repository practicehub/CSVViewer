@echo off
echo ========================================
echo Building for Production Deployment
echo ========================================
echo.

:: 1. 安装所有依赖
echo [STEP 1/4] Installing dependencies...
echo.

echo Installing client dependencies...
cd client
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to install client dependencies
    pause
    exit /b 1
)

echo.
echo Installing server dependencies...
cd ..\server
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to install server dependencies
    pause
    exit /b 1
)

cd ..

:: 2. 构建前端
echo.
echo [STEP 2/4] Building client...
echo.
cd client
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to build client
    pause
    exit /b 1
)

:: 3. 构建后端
echo.
echo [STEP 3/4] Building server...
echo.
cd ..\server
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to build server
    pause
    exit /b 1
)

cd ..

:: 4. 创建.env.production
echo.
echo [STEP 4/4] Creating production config...
echo.

if not exist "server\.env.production" (
    echo PORT=4000> server\.env.production
    echo JWT_SECRET=change_this_in_production_%RANDOM%_%RANDOM%>> server\.env.production
    echo DATABASE_PATH=./data/db.sqlite>> server\.env.production
    echo NODE_ENV=production>> server\.env.production
    echo [INFO] Created server\.env.production
    echo [WARNING] Please change JWT_SECRET before deployment!
) else (
    echo [INFO] server\.env.production already exists
)

echo.
echo ========================================
echo Build Complete!
echo ========================================
echo.
echo Next steps:
echo 1. Review and modify server\.env.production
echo 2. Package the entire webapp folder
echo 3. Transfer to target server
echo 4. Run start.bat (Windows) or start.sh (Linux)
echo.
echo Files to package:
echo   - client/dist/           (Frontend build)
echo   - client/node_modules/   (Optional, for dev)
echo   - server/dist/           (Backend build)
echo   - server/node_modules/   (Required!)
echo   - server/.env.production (Config)
echo   - start.bat / start.sh   (Startup scripts)
echo   - package.json files
echo.

pause
