import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import Papa from 'papaparse';
import { SmartDatabaseSelector, DatabaseManager, DbType } from '../db-manager';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();

// 配置文件上传
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    cb(null, `${basename}_${timestamp}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { 
    fileSize: 12 * 1024 * 1024 * 1024, // 12GB limit for large log files
    fieldSize: 12 * 1024 * 1024 * 1024, // 12GB field size
    files: 1 // Only one file at a time
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || path.extname(file.originalname).toLowerCase() === '.csv') {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

// 流式处理CSV文件上传 - 优化大文件处理
router.post('/upload', authenticateToken, upload.single('file'), async (req: AuthRequest, res: Response) => {
  const overallStartTime = Date.now();
  let fileUploadTime = 0;
  let parseTime = 0;
  let dbInsertTime = 0;
  let dbManager: DatabaseManager | null = null;
  
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const userId = req.userId!;
    const filename = req.file.filename;
    const originalName = req.file.originalname;
    const filePath = path.join(uploadDir, filename);
    
    // 记录文件信息
    const fileSizeMB = (req.file.size / (1024 * 1024)).toFixed(2);
    const fileSizeGB = (req.file.size / (1024 * 1024 * 1024)).toFixed(2);
    
    console.log(`[UPLOAD-START] 用户 ${userId} 开始上传文件: ${originalName} (${fileSizeGB}GB)`);

    // 记录文件上传完成时间
    fileUploadTime = Date.now() - overallStartTime;
    console.log(`[UPLOAD-FILE] 文件上传完成，耗时: ${(fileUploadTime / 1000).toFixed(2)}秒`);

    // 智能选择数据库类型
    dbManager = await SmartDatabaseSelector.createOptimizedDatabase(parseFloat(fileSizeMB));
    
    // 保存文件信息到数据库
    const insertResult = dbManager.run(
      'INSERT INTO csv_files (user_id, filename, original_name) VALUES (?, ?, ?)',
      [userId, filename, originalName]
    );
    
    // 获取新插入的文件ID
    let fileId: number;
    if (insertResult && insertResult.lastInsertRowid) {
      fileId = insertResult.lastInsertRowid;
    } else {
      // 兼容不同的数据库实现
      const file = dbManager.get('SELECT id FROM csv_files WHERE filename = ? ORDER BY id DESC LIMIT 1', [filename]) as any;
      if (!file) {
        throw new Error('Failed to create file record');
      }
      fileId = file.id;
    }
    
    console.log(`[DB-INFO] 文件记录已创建，ID: ${fileId}`);

    // 使用高性能批量插入策略
    console.log(`[PARSE-START] 开始流式解析CSV文件...`);
    const parseStartTime = Date.now();
    
    let headers: string[] = [];
    let rowCount = 0;
    let saveCount = 0;
    const batchSize = 100000; // 大幅增加批次大小以提高性能
    
    const dbInsertStartTime = Date.now();
    
    const parseResult = await new Promise<void>((resolve, reject) => {
      const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
      let isFirstRow = true;
      let batch: any[] = [];
      
      Papa.parse(stream, {
        header: false,
        skipEmptyLines: true,
        step: (row: any) => {
          try {
            if (isFirstRow) {
              // 处理表头
              headers = row.data;
              const headerLine = JSON.stringify(headers);
              dbManager!.run('INSERT INTO csv_data (file_id, row_number, row_data, is_header) VALUES (?, ?, ?, ?)', 
                [fileId, 0, headerLine, 1]);
              isFirstRow = false;
              console.log(`[PARSE-HEADER] 表头已保存: ${headers.join(', ')}`);
            } else {
              // 处理数据行 - 累积到批次中
              rowCount++;
              const rowLine = JSON.stringify(row.data);
              batch.push([fileId, rowCount, rowLine, 0]);
              
              // 批量插入
              if (batch.length >= batchSize) {
                // 直接批量插入（SQL.js不支持事务）
                for (const item of batch) {
                  dbManager!.run('INSERT INTO csv_data (file_id, row_number, row_data, is_header) VALUES (?, ?, ?, ?)', item);
                }
                saveCount++;
                
                const elapsed = ((Date.now() - dbInsertStartTime) / 1000).toFixed(2);
                const speed = (rowCount / parseFloat(elapsed)).toFixed(0);
                
                // 基于实际处理进度和文件大小计算更准确的进度百分比
                const fileSizeMBNum = parseFloat(fileSizeMB);
                const elapsedSeconds = parseFloat(elapsed);
                
                // 计算当前处理速度（行/秒）
                const currentSpeed = elapsedSeconds > 0 ? rowCount / elapsedSeconds : 0;
                
                // 基于文件大小和当前速度估算总处理时间
                let estimatedTotalRows = 0;
                let progress = 0;
                
                if (currentSpeed > 0) {
                  // 使用实际处理速度来估算总行数
                  // 根据文件大小调整预期的行密度
                  let rowsPerMB = 1000; // 默认值
                  
                  if (fileSizeMBNum <= 10) {
                    rowsPerMB = 500;   // 小文件通常行数较少
                  } else if (fileSizeMBNum <= 100) {
                    rowsPerMB = 1000;  // 中小文件
                  } else if (fileSizeMBNum <= 1000) {
                    rowsPerMB = 5000;  // 中等文件
                  } else if (fileSizeMBNum <= 5000) {
                    rowsPerMB = 8000;  // 大文件
                  } else {
                    rowsPerMB = 10000; // 超大文件
                  }
                  
                  estimatedTotalRows = Math.max(rowCount, fileSizeMBNum * rowsPerMB);
                  
                  // 基于实际进度和估算计算百分比
                  progress = Math.min(99.9, (rowCount / estimatedTotalRows) * 100);
                } else {
                  // 如果还没有速度数据，使用基于时间的简单估算
                  const timeBasedProgress = Math.min(50, (elapsedSeconds / 60) * 10); // 最多50%，基于时间
                  progress = timeBasedProgress;
                }
                
                // 确保进度不会倒退
                progress = Math.max(progress, 0);
                
                // 只在每10%进度时报告
                const progressInt = Math.floor(progress / 10) * 10;
                if (progressInt > 0 && progressInt <= 90 && progress % 10 < 2) {
                  const estimatedTotalSeconds = (estimatedTotalRows / parseFloat(speed));
                  const remainingSeconds = Math.max(0, estimatedTotalSeconds - parseFloat(elapsed)).toFixed(0);
                  const remainingMinutes = (parseFloat(remainingSeconds) / 60).toFixed(1);
                  
                  console.log(`\n📊 [进度报告] ${progressInt}% | 已处理: ${rowCount.toLocaleString()} 行 | 速度: ${speed} 行/秒`);
                  console.log(`⏱️  已用时: ${elapsed}秒 | 预计剩余: ${remainingMinutes}分钟 | 批次: #${saveCount}`);
                  console.log(`💾 内存使用: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)}MB\n`);
                }
                
                // 清空批次
                batch = [];
                
                // 强制垃圾回收
                if (global.gc) {
                  global.gc();
                }
              }
            }
          } catch (error) {
            console.error(`Error processing row ${rowCount}:`, error);
          }
        },
        complete: () => {
          // 处理剩余的批次
          if (batch.length > 0) {
            // 直接批量插入（SQL.js不支持事务）
            for (const item of batch) {
              dbManager!.run('INSERT INTO csv_data (file_id, row_number, row_data, is_header) VALUES (?, ?, ?, ?)', item);
            }
            saveCount++;
          }
          
          // 最终保存
          dbManager!.save();
          resolve();
        },
        error: (error: any) => {
          reject(error);
        }
      });
    });
    
    parseTime = Date.now() - parseStartTime;
    dbInsertTime = Date.now() - dbInsertStartTime;
    
    console.log(`[PARSE-COMPLETE] CSV流式解析完成，耗时: ${(parseTime / 1000).toFixed(2)}秒`);
    console.log(`[DB-INSERT-COMPLETE] 数据库插入完成，耗时: ${(dbInsertTime / 1000).toFixed(2)}秒`);

    if (rowCount === 0) {
      return res.status(400).json({ message: 'CSV file is empty or contains only headers' });
    }

    // 更新文件的行数
    dbManager.run('UPDATE csv_files SET row_count = ? WHERE id = ?', [rowCount, fileId]);

    // 计算总体性能统计
    const overallTime = Date.now() - overallStartTime;
    const uploadSpeedMBps = (parseFloat(fileSizeMB) / (overallTime / 1000)).toFixed(2);
    const insertSpeedRowsPerSec = Math.round(rowCount / (dbInsertTime / 1000)).toString();
    
    // 生成详细的性能报告
    console.log('\n' + '='.repeat(80));
    console.log('📊 文件上传性能报告');
    console.log('='.repeat(80));
    console.log(`📁 文件信息: ${originalName} (${fileSizeGB}GB, ${rowCount.toLocaleString()} 行)`);
    console.log(`👤 用户ID: ${userId}`);
    console.log(`⏱️  总耗时: ${(overallTime / 1000).toFixed(2)} 秒`);
    console.log('');
    console.log('📈 各阶段耗时分析:');
    console.log(`   • 文件上传: ${(fileUploadTime / 1000).toFixed(2)} 秒 (${((fileUploadTime / overallTime) * 100).toFixed(1)}%)`);
    console.log(`   • CSV解析:  ${(parseTime / 1000).toFixed(2)} 秒 (${((parseTime / overallTime) * 100).toFixed(1)}%)`);
    console.log(`   • 数据库插入: ${(dbInsertTime / 1000).toFixed(2)} 秒 (${((dbInsertTime / overallTime) * 100).toFixed(1)}%)`);
    console.log('');
    console.log('⚡ 性能指标:');
    console.log(`   • 上传速度: ${uploadSpeedMBps} MB/s`);
    console.log(`   • 插入速度: ${insertSpeedRowsPerSec} 行/秒`);
    console.log(`   • 批次保存: ${saveCount} 次 (每 ${batchSize} 行保存一次)`);
    console.log('='.repeat(80));

    res.status(201).json({
      message: 'File uploaded successfully',
      fileId: fileId,
      filename: originalName,
      rowCount: rowCount,
      performance: {
        totalTime: `${(overallTime / 1000).toFixed(2)}s`,
        fileUploadTime: `${(fileUploadTime / 1000).toFixed(2)}s`,
        parseTime: `${(parseTime / 1000).toFixed(2)}s`,
        dbInsertTime: `${(dbInsertTime / 1000).toFixed(2)}s`,
        uploadSpeed: `${uploadSpeedMBps} MB/s`,
        insertSpeed: `${insertSpeedRowsPerSec} 行/秒`,
        saveCount: saveCount
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: 'Failed to upload file' });
  } finally {
    if (dbManager) {
      dbManager.close();
    }
  }
});

// 获取用户的CSV文件列表 - 支持混合数据库查询
router.get('/list', authenticateToken, async (req: AuthRequest, res: Response) => {
  let sqliteDb: DatabaseManager | null = null;
  let fileDb: DatabaseManager | null = null;
  try {
    const userId = req.userId!;
    const allFiles: any[] = [];
    
    // 1. 查询SQLite数据库中的小文件
    try {
      sqliteDb = await SmartDatabaseSelector.createOptimizedDatabase(0);
      const sqliteFiles = sqliteDb.all(
        'SELECT id, original_name, upload_date, row_count FROM csv_files WHERE user_id = ? ORDER BY upload_date DESC',
        [userId]
      );
      allFiles.push(...sqliteFiles);
    } catch (error) {
      console.warn('SQLite query failed:', error);
    }
    
    // 2. 查询文件数据库中的大文件
    try {
      fileDb = await SmartDatabaseSelector.createOptimizedDatabase(1000); // 使用大文件数据库
      const fileDbFiles = fileDb.all(
        'SELECT id, original_name, upload_date, row_count FROM csv_files WHERE user_id = ? ORDER BY upload_date DESC',
        [userId]
      );
      allFiles.push(...fileDbFiles);
    } catch (error) {
      console.warn('File database query failed:', error);
    }
    
    // 3. 去重并排序（基于ID去重，按上传日期排序）
    const uniqueFiles = allFiles.filter((file, index, self) => 
      index === self.findIndex((f) => f.id === file.id)
    );
    
    uniqueFiles.sort((a, b) => new Date(b.upload_date).getTime() - new Date(a.upload_date).getTime());

    res.json({ files: uniqueFiles });
  } catch (error) {
    console.error('List error:', error);
    res.status(500).json({ message: 'Failed to retrieve file list' });
  } finally {
    if (sqliteDb) {
      sqliteDb.close();
    }
    if (fileDb) {
      fileDb.close();
    }
  }
});

// 获取CSV文件的分页数据 - 支持大数据量和混合数据库
router.get('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  let sqliteDb: DatabaseManager | null = null;
  let fileDb: DatabaseManager | null = null;
  let targetDb: DatabaseManager | null = null;
  let file: any = null;
  
  try {
    const userId = req.userId!;
    const fileId = parseInt(req.params.id);
    
    // 获取分页参数
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 100;
    const offset = (page - 1) * pageSize;

    // 1. 先在SQLite中查找文件
    try {
      sqliteDb = await SmartDatabaseSelector.createOptimizedDatabase(0);
      file = sqliteDb.get('SELECT * FROM csv_files WHERE id = ? AND user_id = ?', [fileId, userId]) as any;
      if (file) {
        targetDb = sqliteDb;
      }
    } catch (error) {
      console.warn('SQLite file query failed:', error);
    }
    
    // 2. 如果SQLite中没有，在文件数据库中查找
    if (!file) {
      try {
        fileDb = await SmartDatabaseSelector.createOptimizedDatabase(1000);
        file = fileDb.get('SELECT * FROM csv_files WHERE id = ? AND user_id = ?', [fileId, userId]) as any;
        if (file) {
          targetDb = fileDb;
        }
      } catch (error) {
        console.warn('File database query failed:', error);
      }
    }

    if (!file || !targetDb) {
      return res.status(404).json({ message: 'File not found' });
    }

    // 获取表头（兼容旧格式和新格式）
    let headers: string[] = [];
    console.log(`[DEBUG] 尝试获取文件 ${fileId} 的表头...`);
    
    // 对于大文件，使用流式读取表头
    if (targetDb.getDbType() === 'filedb') {
      try {
        const dataFile = path.join(__dirname, '../../data', `csv_data_${fileId}.jsonl`);
        if (fs.existsSync(dataFile)) {
          headers = await new Promise<string[]>((resolve, reject) => {
            const readStream = fs.createReadStream(dataFile, { encoding: 'utf-8' });
            let buffer = '';
            let found = false;
            
            readStream.on('data', (chunk: string | Buffer) => {
              const chunkStr = chunk instanceof Buffer ? chunk.toString('utf-8') : chunk;
              buffer += chunkStr;
              const lines = buffer.split('\n');
              buffer = lines.pop() || ''; // 保留最后一个不完整的行
              
              for (const line of lines) {
                if (line.trim()) {
                  try {
                    const row = JSON.parse(line);
                    if (row.file_id === fileId && row.is_header === 1) {
                      const headerData = JSON.parse(row.row_data);
                      console.log(`[DEBUG] 流式读取表头成功:`, headerData);
                      found = true;
                      readStream.destroy();
                      resolve(headerData);
                      return;
                    }
                  } catch (e) {
                    // 忽略解析错误
                  }
                }
              }
            });
            
            readStream.on('end', () => {
              if (!found && buffer.trim()) {
                try {
                  const row = JSON.parse(buffer);
                  if (row.file_id === fileId && row.is_header === 1) {
                    const headerData = JSON.parse(row.row_data);
                    console.log(`[DEBUG] 在最后buffer中找到表头:`, headerData);
                    resolve(headerData);
                    return;
                  }
                } catch (e) {
                  // 忽略解析错误
                }
              }
              resolve([]);
            });
            
            readStream.on('error', (error) => {
              console.warn('[DEBUG] 流式读取表头失败:', error);
              resolve([]);
            });
          });
        }
      } catch (error) {
        console.warn('[DEBUG] 流式读取表头失败:', error);
      }
    }
    
    // 如果直接读取失败，尝试数据库查询
    if (headers.length === 0) {
      // 减少等待时间，提高响应速度
      await new Promise(resolve => setTimeout(resolve, 100));
      
      try {
        const headerRow = await targetDb.getAsync('SELECT row_data FROM csv_data WHERE file_id = ? AND is_header = 1', [fileId]) as any;
        console.log(`[DEBUG] 表头查询结果:`, headerRow ? '找到表头' : '未找到表头');
        if (headerRow) {
          try {
            headers = JSON.parse(headerRow.row_data);
            console.log(`[DEBUG] 解析表头成功:`, headers);
          } catch (parseError) {
            console.warn('[DEBUG] JSON解析失败，尝试CSV格式:', parseError);
            // 兼容旧格式（CSV字符串）
            headers = headerRow.row_data.split(',').map((h: string) => h.trim());
            console.log(`[DEBUG] CSV格式表头:`, headers);
          }
        }
      } catch (error) {
        console.warn('[DEBUG] getAsync方法失败:', error);
        // 如果getAsync失败，尝试使用同步方法
        try {
          const headerRow = targetDb.get('SELECT row_data FROM csv_data WHERE file_id = ? AND is_header = 1', [fileId]) as any;
          console.log(`[DEBUG] 同步方法表头查询结果:`, headerRow ? '找到表头' : '未找到表头');
          if (headerRow) {
            try {
              headers = JSON.parse(headerRow.row_data);
              console.log(`[DEBUG] 同步方法解析表头成功:`, headers);
            } catch (parseError) {
              console.warn('[DEBUG] 同步方法JSON解析失败，尝试CSV格式:', parseError);
              // 兼容旧格式（CSV字符串）
              headers = headerRow.row_data.split(',').map((h: string) => h.trim());
              console.log(`[DEBUG] 同步方法CSV格式表头:`, headers);
            }
          }
        } catch (syncError) {
          console.error('[DEBUG] 同步方法也失败:', syncError);
        }
      }
    }

    // 获取总记录数
    const countResult = await targetDb.getAsync('SELECT COUNT(*) as total FROM csv_data WHERE file_id = ? AND is_header = 0', [fileId]) as any;
    const totalRows = countResult ? countResult.total : 0;

    // 获取分页数据 - 对于大文件使用流式读取
    let rows: any[] = [];
    if (targetDb.getDbType() === 'filedb') {
      try {
        const dataFile = path.join(__dirname, '../../data', `csv_data_${fileId}.jsonl`);
        if (fs.existsSync(dataFile)) {
          rows = await new Promise<any[]>((resolve, reject) => {
            const readStream = fs.createReadStream(dataFile, { encoding: 'utf-8' });
            let buffer = '';
            let dataRows: any[] = [];
            let currentRow = 0;
            let targetStartRow = offset + 1; // 跳过表头行
            let targetEndRow = targetStartRow + pageSize;
            let found = false;
            
            readStream.on('data', (chunk: string | Buffer) => {
              const chunkStr = chunk instanceof Buffer ? chunk.toString('utf-8') : chunk;
              buffer += chunkStr;
              const lines = buffer.split('\n');
              buffer = lines.pop() || ''; // 保留最后一个不完整的行
              
              for (const line of lines) {
                if (line.trim()) {
                  try {
                    const row = JSON.parse(line);
                    if (row.file_id === fileId && row.is_header === 0) {
                      currentRow++;
                      
                      if (currentRow >= targetStartRow && currentRow < targetEndRow) {
                        dataRows.push(row);
                      }
                      
                      if (currentRow >= targetEndRow) {
                        found = true;
                        readStream.destroy();
                        resolve(dataRows);
                        return;
                      }
                    }
                  } catch (e) {
                    // 忽略解析错误
                  }
                }
              }
            });
            
            readStream.on('end', () => {
              if (!found && buffer.trim()) {
                try {
                  const row = JSON.parse(buffer);
                  if (row.file_id === fileId && row.is_header === 0) {
                    currentRow++;
                    if (currentRow >= targetStartRow && currentRow < targetEndRow) {
                      dataRows.push(row);
                    }
                  }
                } catch (e) {
                  // 忽略解析错误
                }
              }
              resolve(dataRows);
            });
            
            readStream.on('error', (error) => {
              console.warn('[DEBUG] 流式读取数据失败:', error);
              resolve([]);
            });
          });
        }
      } catch (error) {
        console.warn('[DEBUG] 流式读取数据失败:', error);
      }
    } else {
      // 小文件使用数据库查询
      rows = targetDb.all(
        'SELECT row_number, row_data FROM csv_data WHERE file_id = ? AND is_header = 0 ORDER BY row_number LIMIT ? OFFSET ?',
        [fileId, pageSize, offset]
      ) as any[];
    }

    // 解析数据（兼容旧格式和新格式）
    const data = rows.map((row: any) => {
      let values: string[];
      try {
        values = JSON.parse(row.row_data);
      } catch {
        // 兼容旧格式（CSV字符串）
        values = row.row_data.split(',').map((v: string) => v.trim());
      }
      const obj: any = { _rowNumber: row.row_number };
      headers.forEach((header: string, index: number) => {
        obj[header] = values[index] || '';
      });
      return obj;
    });

    res.json({
      file: {
        id: file.id,
        name: file.original_name,
        uploadDate: file.upload_date,
        totalRows: file.row_count || totalRows
      },
      headers,
      data,
      pagination: {
        currentPage: page,
        pageSize: pageSize,
        totalRows: totalRows,
        totalPages: Math.ceil(totalRows / pageSize)
      }
    });
  } catch (error) {
    console.error('Get file error:', error);
    res.status(500).json({ message: 'Failed to retrieve file data' });
  } finally {
    if (sqliteDb) {
      sqliteDb.close();
    }
    if (fileDb) {
      fileDb.close();
    }
  }
});

// 获取单行数据详情 - 支持混合数据库查询
router.get('/:id/row/:rowNumber', authenticateToken, async (req: AuthRequest, res: Response) => {
  let sqliteDb: DatabaseManager | null = null;
  let fileDb: DatabaseManager | null = null;
  let targetDb: DatabaseManager | null = null;
  let file: any = null;
  
  try {
    const userId = req.userId!;
    const fileId = parseInt(req.params.id);
    const rowNumber = parseInt(req.params.rowNumber);

    // 1. 先在SQLite中查找文件
    try {
      sqliteDb = await SmartDatabaseSelector.createOptimizedDatabase(0);
      file = sqliteDb.get('SELECT * FROM csv_files WHERE id = ? AND user_id = ?', [fileId, userId]) as any;
      if (file) {
        targetDb = sqliteDb;
      }
    } catch (error) {
      console.warn('SQLite file query failed:', error);
    }
    
    // 2. 如果SQLite中没有，在文件数据库中查找
    if (!file) {
      try {
        fileDb = await SmartDatabaseSelector.createOptimizedDatabase(1000);
        file = fileDb.get('SELECT * FROM csv_files WHERE id = ? AND user_id = ?', [fileId, userId]) as any;
        if (file) {
          targetDb = fileDb;
        }
      } catch (error) {
        console.warn('File database query failed:', error);
      }
    }

    if (!file || !targetDb) {
      return res.status(404).json({ message: 'File not found' });
    }

    // 获取表头（兼容旧格式和新格式）
    let headers: string[] = [];
    
    // 对于大文件，使用流式读取表头
    if (targetDb.getDbType() === 'filedb') {
      try {
        const dataFile = path.join(__dirname, '../../data', `csv_data_${fileId}.jsonl`);
        if (fs.existsSync(dataFile)) {
          headers = await new Promise<string[]>((resolve, reject) => {
            const readStream = fs.createReadStream(dataFile, { encoding: 'utf-8' });
            let buffer = '';
            let found = false;
            
            readStream.on('data', (chunk: string | Buffer) => {
              const chunkStr = chunk instanceof Buffer ? chunk.toString('utf-8') : chunk;
              buffer += chunkStr;
              const lines = buffer.split('\n');
              buffer = lines.pop() || ''; // 保留最后一个不完整的行
              
              for (const line of lines) {
                if (line.trim()) {
                  try {
                    const row = JSON.parse(line);
                    if (row.file_id === fileId && row.is_header === 1) {
                      const headerData = JSON.parse(row.row_data);
                      console.log(`[DEBUG] 单行查询-流式读取表头成功:`, headerData);
                      found = true;
                      readStream.destroy();
                      resolve(headerData);
                      return;
                    }
                  } catch (e) {
                    // 忽略解析错误
                  }
                }
              }
            });
            
            readStream.on('end', () => {
              if (!found && buffer.trim()) {
                try {
                  const row = JSON.parse(buffer);
                  if (row.file_id === fileId && row.is_header === 1) {
                    const headerData = JSON.parse(row.row_data);
                    console.log(`[DEBUG] 单行查询-在最后buffer中找到表头:`, headerData);
                    resolve(headerData);
                    return;
                  }
                } catch (e) {
                  // 忽略解析错误
                }
              }
              resolve([]);
            });
            
            readStream.on('error', (error) => {
              console.warn('[DEBUG] 单行查询-流式读取表头失败:', error);
              resolve([]);
            });
          });
        }
      } catch (error) {
        console.warn('[DEBUG] 单行查询-流式读取表头失败:', error);
      }
    }
    
    // 如果流式读取失败，尝试数据库查询
    if (headers.length === 0) {
      try {
        const headerRow = await targetDb.getAsync('SELECT row_data FROM csv_data WHERE file_id = ? AND is_header = 1', [fileId]) as any;
        console.log(`[DEBUG] 单行查询-表头查询结果:`, headerRow ? '找到表头' : '未找到表头');
        if (headerRow) {
          try {
            headers = JSON.parse(headerRow.row_data);
            console.log(`[DEBUG] 单行查询-解析表头成功:`, headers);
          } catch (parseError) {
            console.warn('[DEBUG] 单行查询-JSON解析失败，尝试CSV格式:', parseError);
            // 兼容旧格式（CSV字符串）
            headers = headerRow.row_data.split(',').map((h: string) => h.trim());
            console.log(`[DEBUG] 单行查询-CSV格式表头:`, headers);
          }
        }
      } catch (error) {
        console.warn('[DEBUG] 单行查询-getAsync方法失败:', error);
        // 如果getAsync失败，尝试使用同步方法
        try {
          const headerRow = targetDb.get('SELECT row_data FROM csv_data WHERE file_id = ? AND is_header = 1', [fileId]) as any;
          console.log(`[DEBUG] 单行查询-同步方法表头查询结果:`, headerRow ? '找到表头' : '未找到表头');
          if (headerRow) {
            try {
              headers = JSON.parse(headerRow.row_data);
              console.log(`[DEBUG] 单行查询-同步方法解析表头成功:`, headers);
            } catch (parseError) {
              console.warn('[DEBUG] 单行查询-同步方法JSON解析失败，尝试CSV格式:', parseError);
              // 兼容旧格式（CSV字符串）
              headers = headerRow.row_data.split(',').map((h: string) => h.trim());
              console.log(`[DEBUG] 单行查询-同步方法CSV格式表头:`, headers);
            }
          }
        } catch (syncError) {
          console.error('[DEBUG] 单行查询-同步方法也失败:', syncError);
        }
      }
    }

    // 获取指定行数据 - 对于大文件使用流式读取
    let row: any = null;
    
    if (targetDb.getDbType() === 'filedb') {
      try {
        const dataFile = path.join(__dirname, '../../data', `csv_data_${fileId}.jsonl`);
        if (fs.existsSync(dataFile)) {
          row = await new Promise<any>((resolve, reject) => {
            const readStream = fs.createReadStream(dataFile, { encoding: 'utf-8' });
            let buffer = '';
            let currentRow = 0;
            let found = false;
            
            readStream.on('data', (chunk: string | Buffer) => {
              const chunkStr = chunk instanceof Buffer ? chunk.toString('utf-8') : chunk;
              buffer += chunkStr;
              const lines = buffer.split('\n');
              buffer = lines.pop() || ''; // 保留最后一个不完整的行
              
              for (const line of lines) {
                if (line.trim()) {
                  try {
                    const rowData = JSON.parse(line);
                    if (rowData.file_id === fileId && rowData.is_header === 0) {
                      currentRow++;
                      
                      if (currentRow === rowNumber) {
                        found = true;
                        readStream.destroy();
                        resolve(rowData);
                        return;
                      }
                    }
                  } catch (e) {
                    // 忽略解析错误
                  }
                }
              }
            });
            
            readStream.on('end', () => {
              if (!found && buffer.trim()) {
                try {
                  const rowData = JSON.parse(buffer);
                  if (rowData.file_id === fileId && rowData.is_header === 0) {
                    currentRow++;
                    if (currentRow === rowNumber) {
                      resolve(rowData);
                      return;
                    }
                  }
                } catch (e) {
                  // 忽略解析错误
                }
              }
              resolve(null);
            });
            
            readStream.on('error', (error) => {
              console.warn('[DEBUG] 流式读取单行数据失败:', error);
              resolve(null);
            });
          });
        }
      } catch (error) {
        console.warn('[DEBUG] 流式读取单行数据失败:', error);
      }
    } else {
      // 小文件使用数据库查询
      row = await targetDb.getAsync('SELECT row_data FROM csv_data WHERE file_id = ? AND row_number = ?', [fileId, rowNumber]) as any;
    }
    
    if (!row) {
      return res.status(404).json({ message: 'Row not found' });
    }

    // 解析数据（兼容旧格式和新格式）
    let values: string[];
    try {
      values = JSON.parse(row.row_data);
    } catch {
      // 兼容旧格式（CSV字符串）
      values = row.row_data.split(',').map((v: string) => v.trim());
    }
    
    const data: any = {};
    headers.forEach((header: string, index: number) => {
      data[header] = values[index] || '';
    });

    res.json({
      headers,
      data,
      rowNumber
    });
  } catch (error) {
    console.error('Get row error:', error);
    res.status(500).json({ message: 'Failed to retrieve row data' });
  } finally {
    if (sqliteDb) {
      sqliteDb.close();
    }
    if (fileDb) {
      fileDb.close();
    }
  }
});

// 批量删除CSV文件 - 支持混合数据库
router.post('/batch-delete', authenticateToken, async (req: AuthRequest, res: Response) => {
  let sqliteDb: DatabaseManager | null = null;
  let fileDb: DatabaseManager | null = null;
  try {
    const userId = req.userId!;
    const { fileIds } = req.body;

    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return res.status(400).json({ message: 'No files selected' });
    }

    sqliteDb = await SmartDatabaseSelector.createOptimizedDatabase(0);
    fileDb = await SmartDatabaseSelector.createOptimizedDatabase(1000);
    let deletedCount = 0;

    for (const fileId of fileIds) {
      let file = null;
      let targetDb = null;

      // 先在SQLite中查找文件
      try {
        file = sqliteDb.get('SELECT filename FROM csv_files WHERE id = ? AND user_id = ?', [fileId, userId]) as any;
        if (file) {
          targetDb = sqliteDb;
        }
      } catch (error) {
        console.warn('SQLite file query failed:', error);
      }
      
      // 如果SQLite中没有，在文件数据库中查找
      if (!file) {
        try {
          file = fileDb.get('SELECT filename FROM csv_files WHERE id = ? AND user_id = ?', [fileId, userId]) as any;
          if (file) {
            targetDb = fileDb;
          }
        } catch (error) {
          console.warn('File database query failed:', error);
        }
      }

      if (file && targetDb) {
        // 删除物理文件
        const filePath = path.join(uploadDir, file.filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }

        // 删除数据文件（对于大文件）
        if (targetDb.getDbType() === 'filedb') {
          try {
            const dataFile = path.join(__dirname, '../../data', `csv_data_${fileId}.jsonl`);
            if (fs.existsSync(dataFile)) {
              fs.unlinkSync(dataFile);
              console.log(`[DELETE] 删除数据文件: csv_data_${fileId}.jsonl`);
            }
          } catch (error) {
            console.warn('Failed to delete data file:', error);
          }
        }

        // 删除CSV数据
        targetDb.run('DELETE FROM csv_data WHERE file_id = ?', [fileId]);
        
        // 删除文件记录
        targetDb.run('DELETE FROM csv_files WHERE id = ?', [fileId]);
        
        deletedCount++;
        console.log(`[DELETE] 成功删除文件 ID: ${fileId}, 名称: ${file.filename}`);
      } else {
        console.warn(`[DELETE] 未找到文件 ID: ${fileId}, 用户ID: ${userId}`);
      }
    }

    res.json({ message: `Successfully deleted ${deletedCount} file(s)`, deletedCount });
  } catch (error) {
    console.error('Batch delete error:', error);
    res.status(500).json({ message: 'Failed to delete files' });
  } finally {
    if (sqliteDb) {
      sqliteDb.close();
    }
    if (fileDb) {
      fileDb.close();
    }
  }
});

// 删除CSV文件 - 支持混合数据库
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  let sqliteDb: DatabaseManager | null = null;
  let fileDb: DatabaseManager | null = null;
  try {
    const userId = req.userId!;
    const fileId = parseInt(req.params.id);

    sqliteDb = await SmartDatabaseSelector.createOptimizedDatabase(0);
    fileDb = await SmartDatabaseSelector.createOptimizedDatabase(1000);
    
    let file = null;
    let targetDb = null;

    // 使用与列表API完全相同的查询逻辑
    const allFiles: any[] = [];
    
    // 1. 查询SQLite数据库中的小文件
    try {
      const sqliteFiles = sqliteDb.all(
        'SELECT id, filename, user_id FROM csv_files WHERE user_id = ?',
        [userId]
      );
      allFiles.push(...sqliteFiles);
      console.log(`[DELETE] SQLite找到 ${sqliteFiles.length} 个文件`);
    } catch (error) {
      console.warn('SQLite query failed:', error);
    }
    
    // 2. 查询文件数据库中的大文件
    try {
      const fileDbFiles = fileDb.all(
        'SELECT id, filename, user_id FROM csv_files WHERE user_id = ?',
        [userId]
      );
      allFiles.push(...fileDbFiles);
      console.log(`[DELETE] 文件数据库找到 ${fileDbFiles.length} 个文件`);
    } catch (error) {
      console.warn('File database query failed:', error);
    }
    
    // 3. 去重并查找目标文件
    const uniqueFiles = allFiles.filter((file, index, self) => 
      index === self.findIndex((f) => f.id === file.id)
    );
    
    console.log(`[DELETE] 总共找到 ${uniqueFiles.length} 个唯一文件，查找ID: ${fileId}`);
    
    const targetFile = uniqueFiles.find(f => f.id === fileId);
    if (targetFile) {
      file = targetFile;
      // 确定使用哪个数据库
      try {
        const sqliteFile = sqliteDb.get('SELECT filename FROM csv_files WHERE id = ?', [fileId]) as any;
        if (sqliteFile) {
          targetDb = sqliteDb;
          console.log(`[DELETE] 使用SQLite数据库`);
        }
      } catch (error) {
        // 忽略错误
      }
      
      if (!targetDb) {
        targetDb = fileDb;
        console.log(`[DELETE] 使用文件数据库`);
      }
      console.log(`[DELETE] 找到文件 ID: ${fileId}, 名称: ${file.filename}`);
    } else {
      console.log(`[DELETE] 在所有文件中未找到ID: ${fileId}`);
      console.log(`[DELETE] 可用文件ID: ${uniqueFiles.map(f => f.id).join(', ')}`);
    }

    if (!file || !targetDb) {
      console.warn(`[DELETE] 文件未找到 - ID: ${fileId}, 用户ID: ${userId}`);
      return res.status(404).json({ message: 'File not found' });
    }

    // 删除物理文件
    const filePath = path.join(uploadDir, file.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[DELETE] 删除物理文件: ${file.filename}`);
    }

    // 删除数据文件（对于大文件）
    if (targetDb.getDbType() === 'filedb') {
      try {
        const dataFile = path.join(__dirname, '../../data', `csv_data_${fileId}.jsonl`);
        if (fs.existsSync(dataFile)) {
          fs.unlinkSync(dataFile);
          console.log(`[DELETE] 删除数据文件: csv_data_${fileId}.jsonl`);
        }
      } catch (error) {
        console.warn('Failed to delete data file:', error);
      }
    }

    // 删除CSV数据
    targetDb.run('DELETE FROM csv_data WHERE file_id = ?', [fileId]);
    
    // 删除文件记录
    targetDb.run('DELETE FROM csv_files WHERE id = ?', [fileId]);

    console.log(`[DELETE] 成功删除文件 ID: ${fileId}, 名称: ${file.filename}`);
    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ message: 'Failed to delete file' });
  } finally {
    if (sqliteDb) {
      sqliteDb.close();
    }
    if (fileDb) {
      fileDb.close();
    }
  }
});

export default router;
