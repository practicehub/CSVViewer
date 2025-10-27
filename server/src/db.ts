import initSqlJs, { Database } from 'sql.js';
import path from 'path';
import fs from 'fs';

let db: Database;

// 确保data目录存在
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DATABASE_PATH || path.join(dataDir, 'db.sqlite');

// 初始化数据库
export async function initDatabase() {
  const SQL = await initSqlJs();
  
  // 如果数据库文件存在，加载它
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // 创建用户表
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 创建CSV文件表（添加row_count字段）
  db.run(`
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

  // 创建CSV数据表（优化版本 - 添加row_number和is_header字段）
  db.run(`
    CREATE TABLE IF NOT EXISTS csv_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id INTEGER NOT NULL,
      row_number INTEGER NOT NULL,
      row_data TEXT NOT NULL,
      is_header INTEGER DEFAULT 0,
      FOREIGN KEY (file_id) REFERENCES csv_files(id) ON DELETE CASCADE
    )
  `);

  // 创建索引以提高查询性能
  db.run(`CREATE INDEX IF NOT EXISTS idx_csv_data_file_id ON csv_data(file_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_csv_data_row_number ON csv_data(file_id, row_number)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_csv_data_header ON csv_data(file_id, is_header)`);

  // 创建默认管理员用户（如果不存在）
  const adminUser = get('SELECT * FROM users WHERE username = ?', ['admin']);
  if (!adminUser) {
    const bcrypt = require('bcrypt');
    const hashedPassword = bcrypt.hashSync('password', 10);
    run('INSERT INTO users (username, password) VALUES (?, ?)', ['admin', hashedPassword]);
    console.log('Default admin user created: username=admin, password=password');
  }

  // 保存数据库到文件
  saveDatabase();
}

// 保存数据库到文件
export function saveDatabase() {
  if (db) {
    const data = db.export();
    fs.writeFileSync(dbPath, data);
  }
}

// 获取数据库实例
export function getDatabase(): Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

// 包装器函数，执行SQL并自动保存
export function run(sql: string, params: any[] = []): any {
  const result = db.run(sql, params);
  saveDatabase();
  return result;
}

export function get(sql: string, params: any[] = []): any {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const result = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return result;
}

export function all(sql: string, params: any[] = []): any[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results: any[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

export default {
  initDatabase,
  saveDatabase,
  getDatabase,
  run,
  get,
  all,
};
