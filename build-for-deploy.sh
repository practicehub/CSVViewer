#!/bin/bash

echo "========================================"
echo "Building for Production Deployment"
echo "========================================"
echo

# 1. 安装所有依赖
echo "[STEP 1/4] Installing dependencies..."
echo

echo "Installing client dependencies..."
cd client
npm install
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to install client dependencies"
    exit 1
fi

echo
echo "Installing server dependencies..."
cd ../server
npm install
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to install server dependencies"
    exit 1
fi

cd ..

# 2. 构建前端
echo
echo "[STEP 2/4] Building client..."
echo
cd client
npm run build
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to build client"
    exit 1
fi

# 3. 构建后端
echo
echo "[STEP 3/4] Building server..."
echo
cd ../server
npm run build
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to build server"
    exit 1
fi

cd ..

# 4. 创建.env.production
echo
echo "[STEP 4/4] Creating production config..."
echo

if [ ! -f "server/.env.production" ]; then
    cat > server/.env.production << EOF
PORT=4000
JWT_SECRET=change_this_in_production_$(date +%s)_$RANDOM
DATABASE_PATH=./data/db.sqlite
NODE_ENV=production
EOF
    echo "[INFO] Created server/.env.production"
    echo "[WARNING] Please change JWT_SECRET before deployment!"
else
    echo "[INFO] server/.env.production already exists"
fi

echo
echo "========================================"
echo "Build Complete!"
echo "========================================"
echo
echo "Next steps:"
echo "1. Review and modify server/.env.production"
echo "2. Package the entire webapp folder"
echo "3. Transfer to target server"
echo "4. Run start.bat (Windows) or start.sh (Linux)"
echo
echo "Files to package:"
echo "  - client/dist/           (Frontend build)"
echo "  - client/node_modules/   (Optional, for dev)"
echo "  - server/dist/           (Backend build)"
echo "  - server/node_modules/   (Required!)"
echo "  - server/.env.production (Config)"
echo "  - start.bat / start.sh   (Startup scripts)"
echo "  - package.json files"
echo
echo "To create a tarball:"
echo "  tar -czf webapp-deploy.tar.gz webapp/"
echo
