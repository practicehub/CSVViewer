# CSV Viewer

English | [日本語](README.ja.md) | [简体中文](README.md)

A million-row CSV data viewer system based on React + Express, supporting offline intranet deployment.

## 🎯 Features

### Core Functions
- ✅ **User Authentication** - JWT token security
- ✅ **CSV File Upload** - Support 100MB+ large files
- ✅ **Million-row Data Processing** - Papa Parse correct parsing, JSON storage preserves all content
- ✅ **Server-side Pagination** - 50/100/200/500 rows selectable, second-level response
- ✅ **Advanced Filtering**
  - Time range filtering (second precision)
  - Keyword search
  - Column selection filtering
- ✅ **Batch Operations** - File selection and batch deletion
- ✅ **Detail View** - Click row to view complete details, multi-line content perfectly displayed
- ✅ **Timezone Conversion** - UTC auto-converted to local timezone

### Technical Highlights
- 📦 npm workspaces monorepo management
- 🚀 Papa Parse RFC 4180 standard CSV parsing
- 💾 SQLite database, JSON format storage (preserves all line breaks)
- 🔒 Backward compatible with old data formats
- 🌐 Complete offline deployment support

## 📋 Tech Stack

### Frontend
- React 18 + TypeScript
- Material-UI (MUI)
- Vite
- React Router v6
- Axios

### Backend
- Node.js + Express
- TypeScript
- SQLite3 (better-sqlite3)
- JWT Authentication
- Papa Parse
- Multer (File upload)

## 🚀 Quick Start

### System Requirements
- Node.js >= 18.x (Supports 18.x and above)
- npm >= 8.x

> 💡 **Development Environment**: This project is developed with Node.js 24.x, backward compatible to Node.js 18.x  
> 💡 **CI/CD Testing**: GitHub Actions automatically tests on Node.js 18.x and 24.x

### Development Environment

#### 1. Install Dependencies
```bash
npm install
```

#### 2. Start Development Server
```bash
# Start both frontend and backend
npm run dev

# Or start separately
cd client && npm run dev  # http://localhost:5173
cd server && npm run dev  # http://localhost:4000
```

### Production Environment

#### 1. Build Project
```bash
# Auto build script (recommended)
# Windows
.\build-for-deploy.bat

# Linux/Mac
chmod +x build-for-deploy.sh
./build-for-deploy.sh
```

Or manual build:
```bash
npm run build
```

#### 2. Start Service
```bash
# Windows
.\start.bat

# Linux/Mac
chmod +x start.sh
./start.sh
```

#### 3. Access Application

**Local Access**:
```
http://localhost:4000
```

**LAN Access** (Other devices on the same network):
```
http://<your-ip>:4000
Example: http://192.168.31.65:4000
```

> 💡 The startup script automatically displays available access addresses and local IP

## 📖 API Documentation

### Authentication API
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/profile` - Get user info

### CSV API
- `POST /api/csv/upload` - Upload CSV file
- `GET /api/csv/list` - Get file list
- `GET /api/csv/:id` - Get file data (paginated)
- `GET /api/csv/:id/row/:rowNumber` - Get single row details
- `DELETE /api/csv/:id` - Delete single file
- `POST /api/csv/batch-delete` - Batch delete files

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Modify PORT in server/.env
PORT=5000
```

### Build Failed
```bash
# Clean and reinstall
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Startup Failed
```bash
# Check build artifacts
ls server/dist/index.js
ls client/dist/index.html

# If not exist, rebuild
npm run build
```

## 📄 License

GNU General Public License v3.0

This project is licensed under GPL-3.0 open source license. See [LICENSE](LICENSE) for details.

## 🙋 Support

Having issues?
1. Check [DEPLOYMENT-OFFLINE.md](DEPLOYMENT-OFFLINE.md)
2. Review troubleshooting section
3. Submit an Issue

---

**Project Completion**: 100% ✅

**Main Features**:
- ✅ Million-row POD log processing
- ✅ Complete user authentication system
- ✅ Advanced filtering and search
- ✅ Batch file management
- ✅ Detail view (multi-line support)
- ✅ Timezone auto-conversion
- ✅ Complete offline deployment solution
