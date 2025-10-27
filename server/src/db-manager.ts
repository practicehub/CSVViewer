import initSqlJs, { Database } from 'sql.js';
import path from 'path';
import fs from 'fs';

// 数据库类型枚举
export enum DbType {
  SQLITE = 'sqlite',    // SQL.js (内存数据库，适合小文件)
  FILEDB = 'filedb'     // 文件数据库 (适合大文件)
}

// 数据库接口
export interface IDatabase {
  init(): Promise<void>;
  run(sql: string, params?: any[]): any;
  get(sql: string, params?: any[]): any;
  all(sql: string, params?: any[]): any[];
  save(): void;
  close(): void;
}

// SQL.js数据库实现 (适合小文件)
export class SqliteDatabase implements IDatabase {
  private db: Database | null = null;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  async init(): Promise<void> {
    const SQL = await initSqlJs();
    
    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
    }

    // 创建表结构
    this.createTables();
  }

  private createTables(): void {
    if (!this.db) throw new Error('Database not initialized');
    
    this.db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        is_admin INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS csv_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        row_count INTEGER DEFAULT 0,
        upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS csv_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id INTEGER NOT NULL,
        row_number INTEGER NOT NULL,
        row_data TEXT NOT NULL,
        is_header INTEGER DEFAULT 0,
        FOREIGN KEY (file_id) REFERENCES csv_files(id) ON DELETE CASCADE
      )
    `);

    // 创建索引
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_csv_data_file_id ON csv_data(file_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_csv_data_row_number ON csv_data(file_id, row_number)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_csv_data_header ON csv_data(file_id, is_header)`);
  }

  run(sql: string, params: any[] = []): any {
    if (!this.db) throw new Error('Database not initialized');
    const result = this.db.run(sql, params);
    this.save();
    return result;
  }

  get(sql: string, params: any[] = []): any {
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    const result = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return result;
  }

  all(sql: string, params: any[] = []): any[] {
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    const results: any[] = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  save(): void {
    if (!this.db) return;
    const data = this.db.export();
    const chunkSize = 100 * 1024 * 1024; // 100MB chunks
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);
      const flag = i === 0 ? 'w' : 'a';
      fs.writeFileSync(this.dbPath, chunk, { flag });
    }
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// 文件数据库实现 (适合大文件，基于文件系统)
export class FileDatabase implements IDatabase {
  private dataDir: string;
  private users: Map<string, any> = new Map();
  private csvFiles: Map<number, any> = new Map();
  private csvData: Map<number, Map<number, any>> = new Map();
  private pendingWrites: Map<number, any[]> = new Map(); // 批量写入缓冲区
  private writeTimer: NodeJS.Timeout | null = null;
  private maxMemoryRows = 10000000; // 限制内存中保存的行数 (调整为1000万行，充分利用32GB RAM)

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.ensureDataDir();
  }

  private ensureDataDir(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  async init(): Promise<void> {
    // 从文件加载数据
    this.loadUsers();
    this.loadCsvFiles();
    console.log('File database initialized for large file processing');
  }

  // 从文件加载CSV数据（按需加载，支持大文件）
  private loadCsvDataFromFile(fileId: number): void {
    const dataFile = path.join(this.dataDir, `csv_data_${fileId}.jsonl`);
    if (!fs.existsSync(dataFile)) return;

    try {
      const fileData = new Map<number, any>();
      const maxLoadRows = 100; // 减少加载行数，提高响应速度
      
      // 检查文件大小，决定使用同步还是异步读取
      const stats = fs.statSync(dataFile);
      const fileSizeMB = stats.size / (1024 * 1024);
      
      if (fileSizeMB < 100) { // 小于100MB的文件使用同步读取
        const maxReadBytes = 50 * 1024; // 最多读取50KB
        const fileBuffer = fs.readFileSync(dataFile);
        const buffer = fileBuffer.toString('utf-8', 0, Math.min(maxReadBytes, fileBuffer.length));
        const lines = buffer.split('\n');
        
        let lineCount = 0;
        for (const line of lines) {
          if (line.trim() && lineCount < maxLoadRows) {
            try {
              const row = JSON.parse(line);
              fileData.set(row.row_number, row);
              lineCount++;
            } catch (e) {
              console.warn(`Failed to parse line in file ${fileId}:`, line.substring(0, 100));
            }
          }
        }
        
        this.csvData.set(fileId, fileData);
        console.log(`📂 从文件同步加载了 ${fileData.size} 行数据 (文件ID: ${fileId})`);
        
        // 异步加载更多数据（如果需要）
        this.loadMoreDataAsync(fileId, maxLoadRows);
      } else { // 大文件使用纯流式读取
        console.log(`🌊 检测到大文件 (${fileSizeMB.toFixed(1)}MB)，使用流式读取 (文件ID: ${fileId})`);
        this.loadLargeFileStreaming(fileId, maxLoadRows);
      }
      
    } catch (error) {
      console.error(`Failed to load CSV data for file ${fileId}:`, error);
    }
  }

  // 流式加载大文件
  private loadLargeFileStreaming(fileId: number, maxLoadRows: number): void {
    const dataFile = path.join(this.dataDir, `csv_data_${fileId}.jsonl`);
    const fileData = new Map<number, any>();
    
    try {
      const readStream = fs.createReadStream(dataFile, { 
        encoding: 'utf-8', 
        start: 0,
        highWaterMark: 64 * 1024 // 64KB chunks
      });
      
      let buffer = '';
      let lineCount = 0;
      let headerFound = false;
      
      readStream.on('data', (chunk: string | Buffer) => {
        const chunkStr = chunk instanceof Buffer ? chunk.toString('utf-8') : chunk;
        buffer += chunkStr;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.trim()) {
            try {
              const row = JSON.parse(line);
              
              // 优先加载表头（row_number === 0）
              if (row.row_number === 0 && !headerFound) {
                fileData.set(row.row_number, row);
                headerFound = true;
                console.log(`[DEBUG] 找到表头行: ${row.row_number}`);
              } else if (lineCount < maxLoadRows) {
                fileData.set(row.row_number, row);
                lineCount++;
              }
            } catch (e) {
              console.warn(`Failed to parse line in file ${fileId}:`, line.substring(0, 100));
            }
          }
        }
        
        // 如果已经加载了足够的行数且找到了表头，停止读取
        if (lineCount >= maxLoadRows && headerFound) {
          readStream.destroy();
        }
      });
      
      readStream.on('end', () => {
        // 处理最后的buffer
        if (buffer.trim()) {
          try {
            const row = JSON.parse(buffer);
            
            // 优先加载表头
            if (row.row_number === 0 && !headerFound) {
              fileData.set(row.row_number, row);
              headerFound = true;
              console.log(`[DEBUG] 在最后buffer中找到表头行: ${row.row_number}`);
            } else if (lineCount < maxLoadRows) {
              fileData.set(row.row_number, row);
              lineCount++;
            }
          } catch (e) {
            console.warn(`Failed to parse final line in file ${fileId}:`, buffer.substring(0, 100));
          }
        }
        
        this.csvData.set(fileId, fileData);
        console.log(`📂 流式加载了 ${fileData.size} 行数据 (文件ID: ${fileId}, 表头: ${headerFound})`);
        
        // 继续异步加载更多数据
        this.loadMoreDataAsync(fileId, maxLoadRows);
      });
      
      readStream.on('error', (error) => {
        console.error(`Stream error reading file ${fileId}:`, error);
      });
      
    } catch (error) {
      console.error(`Failed to stream large file ${fileId}:`, error);
    }
  }

  // 异步加载更多数据
  private loadMoreDataAsync(fileId: number, startRow: number): void {
    const dataFile = path.join(this.dataDir, `csv_data_${fileId}.jsonl`);
    if (!fs.existsSync(dataFile)) return;

    try {
      const fileData = this.csvData.get(fileId);
      if (!fileData) return;

      const readStream = fs.createReadStream(dataFile, { encoding: 'utf-8', start: 0 });
      let buffer = '';
      let lineCount = 0;
      const maxLoadRows = 1000; // 异步加载更多行
      
      readStream.on('data', (chunk: string | Buffer) => {
        const chunkStr = chunk instanceof Buffer ? chunk.toString('utf-8') : chunk;
        buffer += chunkStr;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.trim() && lineCount < maxLoadRows) {
            try {
              const row = JSON.parse(line);
              if (!fileData.has(row.row_number)) {
                fileData.set(row.row_number, row);
                lineCount++;
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
        
        if (lineCount >= maxLoadRows) {
          readStream.destroy();
        }
      });
      
      readStream.on('end', () => {
        if (buffer.trim()) {
          try {
            const row = JSON.parse(buffer);
            if (!fileData.has(row.row_number)) {
              fileData.set(row.row_number, row);
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
        console.log(`📂 异步加载完成，总共 ${fileData.size} 行数据 (文件ID: ${fileId})`);
      });
      
    } catch (error) {
      console.error(`Failed to async load more data for file ${fileId}:`, error);
    }
  }

  // 同步查找特定行号的数据（用于大文件）
  private findRowInFile(fileId: number, rowNumber: number): Promise<any> {
    const dataFile = path.join(this.dataDir, `csv_data_${fileId}.jsonl`);
    if (!fs.existsSync(dataFile)) return Promise.resolve(null);

    try {
      const readStream = fs.createReadStream(dataFile, { encoding: 'utf-8' });
      let buffer = '';
      let found = false;
      let result: any = null;
      
      return new Promise<any>((resolve) => {
        readStream.on('data', (chunk: string | Buffer) => {
          const chunkStr = chunk instanceof Buffer ? chunk.toString('utf-8') : chunk;
          buffer += chunkStr;
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // 保留最后一个不完整的行
          
          for (const line of lines) {
            if (line.trim()) {
              try {
                const row = JSON.parse(line);
                if (row.row_number === rowNumber) {
                  result = row;
                  found = true;
                  readStream.destroy();
                  break;
                }
              } catch (e) {
                // 忽略解析错误的行
              }
            }
          }
        });
        
        readStream.on('end', () => {
          // 处理最后的buffer
          if (!found && buffer.trim()) {
            try {
              const row = JSON.parse(buffer);
              if (row.row_number === rowNumber) {
                result = row;
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
          resolve(result);
        });
        
        readStream.on('error', () => {
          resolve(null);
        });
      });
    } catch (error) {
      console.error(`Failed to find row ${rowNumber} in file ${fileId}:`, error);
      return Promise.resolve(null);
    }
  }

  private loadUsers(): void {
    const usersFile = path.join(this.dataDir, 'users.json');
    if (fs.existsSync(usersFile)) {
      const data = fs.readFileSync(usersFile, 'utf-8');
      const users = JSON.parse(data);
      this.users = new Map(users.map((u: any) => [u.username, u]));
    }
  }

  private loadCsvFiles(): void {
    const filesFile = path.join(this.dataDir, 'csv_files.json');
    if (fs.existsSync(filesFile)) {
      const data = fs.readFileSync(filesFile, 'utf-8');
      this.csvFiles = new Map(JSON.parse(data).map((f: any) => [f.id, f]));
    }
  }

  private saveUsers(): void {
    const usersFile = path.join(this.dataDir, 'users.json');
    const users = Array.from(this.users.values());
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
  }

  private saveCsvFiles(): void {
    const filesFile = path.join(this.dataDir, 'csv_files.json');
    const files = Array.from(this.csvFiles.values());
    fs.writeFileSync(filesFile, JSON.stringify(files, null, 2));
  }

  // 批量写入CSV数据到文件
  private flushCsvData(fileId: number): void {
    const pending = this.pendingWrites.get(fileId);
    if (!pending || pending.length === 0) return;

    const dataFile = path.join(this.dataDir, `csv_data_${fileId}.jsonl`); // 使用JSONL格式
    
    // 分批写入，避免字符串长度限制
    const batchSize = 1000;
    for (let i = 0; i < pending.length; i += batchSize) {
      const batch = pending.slice(i, i + batchSize);
      const lines = batch.map(row => JSON.stringify(row)).join('\n') + '\n';
      fs.appendFileSync(dataFile, lines);
    }
    
    // 清空缓冲区
    this.pendingWrites.delete(fileId);
  }

  // 定期批量写入
  private scheduleFlush(fileId: number): void {
    if (this.writeTimer) return;
    
    this.writeTimer = setTimeout(() => {
      for (const [fid] of this.pendingWrites) {
        this.flushCsvData(fid);
      }
      this.writeTimer = null;
    }, 3000); // 3秒批量写入一次
  }

  run(sql: string, params: any[] = []): any {
    // 简化的SQL解析，主要处理INSERT操作
    if (sql.includes('INSERT INTO users')) {
      const [_, username, password] = params;
      const user = {
        id: this.users.size + 1,
        username,
        password,
        created_at: new Date().toISOString()
      };
      this.users.set(username, user);
      this.saveUsers();
      return { lastInsertRowid: user.id };
    }

    if (sql.includes('INSERT INTO csv_files')) {
      const [userId, filename, originalName] = params;
      const file = {
        id: this.csvFiles.size + 1,
        user_id: userId,
        filename,
        original_name: originalName,
        row_count: 0,
        upload_date: new Date().toISOString()
      };
      this.csvFiles.set(file.id, file);
      this.csvData.set(file.id, new Map());
      this.saveCsvFiles();
      return { lastInsertRowid: file.id };
    }

    if (sql.includes('INSERT INTO csv_data')) {
      const [fileId, rowNumber, rowData, isHeader] = params;
      const fileData = this.csvData.get(fileId);
      if (fileData) {
        const row = {
          file_id: fileId,
          row_number: rowNumber,
          row_data: rowData,
          is_header: isHeader
        };
        
        // 限制内存中的行数，避免Map大小限制
        if (fileData.size < this.maxMemoryRows) {
          fileData.set(rowNumber, row);
        } else if (fileData.size === this.maxMemoryRows) {
          // 达到限制时清理内存，只保留最近的数据
          console.log(`⚠️  内存限制达到，清理文件 ${fileId} 的内存数据`);
          fileData.clear();
        }
        
        // 添加到批量写入缓冲区
        if (!this.pendingWrites.has(fileId)) {
          this.pendingWrites.set(fileId, []);
        }
        this.pendingWrites.get(fileId)!.push(row);
        
        // 定期批量写入
        this.scheduleFlush(fileId);
      }
      return {};
    }

    if (sql.includes('UPDATE csv_files SET row_count')) {
      const [rowCount, fileId] = params;
      const file = this.csvFiles.get(fileId);
      if (file) {
        file.row_count = rowCount;
        this.saveCsvFiles();
      }
      return {};
    }

    if (sql.includes('DELETE FROM csv_data')) {
      const [fileId] = params;
      // 删除内存中的数据
      this.csvData.delete(fileId);
      // 删除待写入缓冲区
      this.pendingWrites.delete(fileId);
      // 删除数据文件
      const dataFile = path.join(this.dataDir, `csv_data_${fileId}.jsonl`);
      if (fs.existsSync(dataFile)) {
        fs.unlinkSync(dataFile);
        console.log(`[DELETE] 删除数据文件: csv_data_${fileId}.jsonl`);
      }
      return {};
    }

    if (sql.includes('DELETE FROM csv_files')) {
      const [fileId] = params;
      this.csvFiles.delete(fileId);
      this.csvData.delete(fileId);
      this.pendingWrites.delete(fileId);
      this.saveCsvFiles();
      return {};
    }

    return {};
  }

  async getAsync(sql: string, params: any[] = []): Promise<any> {
    if (sql.includes('SELECT') && sql.includes('users')) {
      const [username] = params;
      return this.users.get(username) || null;
    }

    if (sql.includes('SELECT') && sql.includes('csv_files')) {
      if (sql.includes('filename')) {
        const [filename] = params;
        return Array.from(this.csvFiles.values()).find(file => file.filename === filename) || null;
      } else {
        const [fileId] = params;
        return this.csvFiles.get(fileId) || null;
      }
    }

    if (sql.includes('SELECT') && sql.includes('csv_data')) {
      const [fileId, rowNumber] = params;
      let fileData = this.csvData.get(fileId);
      
      // 如果数据不在内存中，从文件加载
      if (!fileData) {
        this.loadCsvDataFromFile(fileId);
        // 减少等待时间，提高响应速度
        await this.waitForDataLoad(fileId);
        fileData = this.csvData.get(fileId);
      }
      
      if (fileData) {
        if (rowNumber !== undefined) {
          // 查找特定行号
          const row = fileData.get(rowNumber);
          if (row) {
            return row;
          }
          // 如果内存中没有，从文件查找
          return await this.findRowInFile(fileId, rowNumber);
        } else {
          // 查找表头 - 优化等待时间
          let attempts = 0;
          let headerRow = Array.from(fileData.values())
            .find(row => row.file_id === fileId && row.is_header === 1);
          
          // 减少等待次数和间隔，提高响应速度
          while (!headerRow && attempts < 3) {
            await new Promise(resolve => setTimeout(resolve, 100));
            headerRow = Array.from(fileData.values())
              .find(row => row.file_id === fileId && row.is_header === 1);
            attempts++;
          }
          
          return headerRow || null;
        }
      }
    }

    if (sql.includes('COUNT')) {
      const [fileId] = params;
      let fileData = this.csvData.get(fileId);
      
      // 如果数据不在内存中，从文件加载
      if (!fileData) {
        this.loadCsvDataFromFile(fileId);
        // 减少等待时间
        await this.waitForDataLoad(fileId);
        fileData = this.csvData.get(fileId);
      }
      
      if (fileData) {
        const filteredRows = Array.from(fileData.values())
          .filter(row => row.file_id === fileId && row.is_header === 0);
        return { total: filteredRows.length };
      }
    }

    return null;
  }

  // 等待数据加载完成 - 优化性能
  private async waitForDataLoad(fileId: number): Promise<void> {
    let attempts = 0;
    while (!this.csvData.has(fileId) && attempts < 5) {
      await new Promise(resolve => setTimeout(resolve, 50));
      attempts++;
    }
  }

  get(sql: string, params: any[] = []): any {
    if (sql.includes('SELECT') && sql.includes('users')) {
      const [username] = params;
      return this.users.get(username) || null;
    }

    if (sql.includes('SELECT') && sql.includes('csv_files')) {
      if (sql.includes('filename')) {
        const [filename] = params;
        return Array.from(this.csvFiles.values()).find(file => file.filename === filename) || null;
      } else {
        const [fileId] = params;
        return this.csvFiles.get(fileId) || null;
      }
    }

    if (sql.includes('SELECT') && sql.includes('csv_data')) {
      const [fileId, rowNumber] = params;
      let fileData = this.csvData.get(fileId);
      
      // 如果数据不在内存中，从文件加载
      if (!fileData) {
        this.loadCsvDataFromFile(fileId);
        fileData = this.csvData.get(fileId);
      }
      
      if (fileData && rowNumber !== undefined) {
        return fileData.get(rowNumber) || null;
      }
    }

    if (sql.includes('COUNT')) {
      const [fileId] = params;
      let fileData = this.csvData.get(fileId);
      
      // 如果数据不在内存中，从文件加载
      if (!fileData) {
        this.loadCsvDataFromFile(fileId);
        fileData = this.csvData.get(fileId);
      }
      
      if (fileData) {
        const filteredRows = Array.from(fileData.values())
          .filter(row => row.file_id === fileId && row.is_header === 0);
        return { total: filteredRows.length };
      }
    }

    return null;
  }

  all(sql: string, params: any[] = []): any[] {
    if (sql.includes('SELECT') && sql.includes('csv_files')) {
      const [userId] = params;
      return Array.from(this.csvFiles.values())
        .filter(file => file.user_id === userId)
        .sort((a, b) => new Date(b.upload_date).getTime() - new Date(a.upload_date).getTime());
    }

    if (sql.includes('SELECT') && sql.includes('csv_data')) {
      // 解析SQL查询参数
      const [fileId, limit, offset] = params;
      let fileData = this.csvData.get(fileId);
      
      // 如果数据不在内存中，从文件加载
      if (!fileData) {
        this.loadCsvDataFromFile(fileId);
        fileData = this.csvData.get(fileId);
      }
      
      if (fileData) {
        let rows = Array.from(fileData.values())
          .filter(row => row.file_id === fileId && row.is_header === 0)
          .sort((a, b) => a.row_number - b.row_number);
        
        // 应用LIMIT和OFFSET
        if (offset !== undefined && limit !== undefined) {
          rows = rows.slice(offset, offset + limit);
        } else if (limit !== undefined) {
          rows = rows.slice(0, limit);
        }
        
        return rows;
      }
    }

    if (sql.includes('COUNT')) {
      const [fileId] = params;
      let fileData = this.csvData.get(fileId);
      
      // 如果数据不在内存中，从文件加载
      if (!fileData) {
        this.loadCsvDataFromFile(fileId);
        fileData = this.csvData.get(fileId);
      }
      
      if (fileData) {
        const filteredRows = Array.from(fileData.values())
          .filter(row => row.file_id === fileId && row.is_header === 0);
        return [{ total: filteredRows.length }];
      }
    }

    return [];
  }

  save(): void {
    // 强制刷新所有待写入数据
    for (const [fileId] of this.pendingWrites) {
      this.flushCsvData(fileId);
    }
  }

  close(): void {
    // 保存所有待写入数据
    this.save();
    
    // 清理内存
    this.users.clear();
    this.csvFiles.clear();
    this.csvData.clear();
    this.pendingWrites.clear();
    
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
  }
}

// 单例数据库管理器
class DatabaseManagerSingleton {
  private static instances: Map<DbType, DatabaseManager> = new Map();

  static async getInstance(dbType: DbType = DbType.SQLITE): Promise<DatabaseManager> {
    if (!this.instances.has(dbType)) {
      const dbManager = new DatabaseManager(dbType);
      await dbManager.init();
      this.instances.set(dbType, dbManager);
    }
    return this.instances.get(dbType)!;
  }

  static closeAll(): void {
    for (const dbManager of this.instances.values()) {
      dbManager.close();
    }
    this.instances.clear();
  }
}

// 数据库管理器
export class DatabaseManager {
  private db: IDatabase;
  private dbType: DbType;

  constructor(dbType: DbType = DbType.SQLITE) {
    this.dbType = dbType;
    const dataDir = path.join(__dirname, '..', 'data');
    
    if (dbType === DbType.SQLITE) {
      const dbPath = process.env.DATABASE_PATH || path.join(dataDir, 'db.sqlite');
      this.db = new SqliteDatabase(dbPath);
    } else {
      this.db = new FileDatabase(dataDir);
    }
  }

  async init(): Promise<void> {
    await this.db.init();
  }

  run(sql: string, params: any[] = []): any {
    return this.db.run(sql, params);
  }

  async getAsync(sql: string, params: any[] = []): Promise<any> {
    if ('getAsync' in this.db) {
      return await (this.db as any).getAsync(sql, params);
    } else {
      return this.db.get(sql, params);
    }
  }

  get(sql: string, params: any[] = []): any {
    return this.db.get(sql, params);
  }

  all(sql: string, params: any[] = []): any[] {
    return this.db.all(sql, params);
  }

  save(): void {
    this.db.save();
  }

  close(): void {
    this.db.close();
  }

  getDbType(): DbType {
    return this.dbType;
  }

  // 静态方法获取单例实例
  static async getInstance(dbType: DbType = DbType.SQLITE): Promise<DatabaseManager> {
    return await DatabaseManagerSingleton.getInstance(dbType);
  }

  static closeAll(): void {
    DatabaseManagerSingleton.closeAll();
  }
}

// 智能数据库选择器
export class SmartDatabaseSelector {
  static selectDatabase(fileSizeMB: number): DbType {
    // 根据文件大小智能选择数据库
    if (fileSizeMB <= 50) { // 50MB以下使用SQL.js
      return DbType.SQLITE;
    } else { // 50MB以上使用文件数据库
      return DbType.FILEDB;
    }
  }

  static async createOptimizedDatabase(fileSizeMB: number): Promise<DatabaseManager> {
    const dbType = this.selectDatabase(fileSizeMB);
    const dbManager = new DatabaseManager(dbType);
    await dbManager.init();
    
    console.log(`🗄️  选择数据库类型: ${dbType} (文件大小: ${fileSizeMB}MB)`);
    
    return dbManager;
  }
}

export default DatabaseManager;
