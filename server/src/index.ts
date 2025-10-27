import express from 'express';
import cors from 'cors';
import path from 'path';
import { SmartDatabaseSelector } from './db-manager';
import authRouter from './routes/auth';
import csvRouter from './routes/csv';

const app = express();
const port = parseInt(process.env.PORT || '4000', 10);

app.use(cors());
app.use(express.json({ limit: '10gb' }));
app.use(express.urlencoded({ limit: '10gb', extended: true }));

// Serve static files from client/dist
app.use(express.static(path.join(__dirname, '../../client/dist')));

// 初始化数据库并启动服务器
async function startServer() {
  try {
    // 初始化智能数据库选择器
    const dbManager = await SmartDatabaseSelector.createOptimizedDatabase(0);
    console.log('Smart database selector initialized successfully');

    // 注册路由
    app.use('/api/auth', authRouter);
    app.use('/api/csv', csvRouter);

    // Serve frontend for all non-API routes
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
    });

    app.listen(port, '0.0.0.0', () => {
      console.log('========================================');
      console.log('Server started successfully!');
      console.log('========================================');
      console.log(`Local:            http://localhost:${port}`);
      console.log(`Network:          http://<your-ip>:${port}`);
      console.log('========================================');
      console.log('Press Ctrl+C to stop the server');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
