import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import Papa from 'papaparse';
import { createReadStream } from 'fs';
import db from '../db';
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
    fileSize: 100 * 1024 * 1024, // 100MB limit
    files: 1 
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || path.extname(file.originalname).toLowerCase() === '.csv') {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

// 简化的CSV处理 - 使用原始数据库
router.post('/upload', authenticateToken, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const userId = req.userId!;
    const filename = req.file.filename;
    const originalName = req.file.originalname;
    const filePath = path.join(uploadDir, filename);

    // 保存文件信息到数据库
    db.run(
      'INSERT INTO csv_files (user_id, filename, original_name) VALUES (?, ?, ?)',
      [userId, filename, originalName]
    );
    
    // 获取新插入的文件ID
    const file = db.get('SELECT id FROM csv_files WHERE filename = ?', [filename]);
    const fileId = file.id;

    // 读取并解析CSV文件
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const parseResult = Papa.parse(fileContent, {
      header: false,
      skipEmptyLines: true,
    });

    if (parseResult.errors.length > 0) {
      console.error('CSV parse errors:', parseResult.errors);
    }

    const rows = parseResult.data as string[][];
    if (rows.length === 0) {
      return res.status(400).json({ message: 'CSV file is empty' });
    }

    // 第一行是表头
    const headers = rows[0];
    const headerLine = JSON.stringify(rows[0]);
    db.run('INSERT INTO csv_data (file_id, row_number, row_data, is_header) VALUES (?, ?, ?, ?)', 
      [fileId, 0, headerLine, 1]);

    // 批量插入数据
    let rowCount = 0;
    const batchSize = 500;

    for (let i = 1; i < rows.length; i++) {
      rowCount++;
      const rowLine = JSON.stringify(rows[i]);
      db.run('INSERT INTO csv_data (file_id, row_number, row_data, is_header) VALUES (?, ?, ?, ?)', 
        [fileId, rowCount, rowLine, 0]);

      // 每500行显示进度
      if (rowCount % batchSize === 0) {
        console.log(`Processed ${rowCount} rows...`);
      }
    }

    // 更新文件的行数
    db.run('UPDATE csv_files SET row_count = ? WHERE id = ?', [rowCount, fileId]);

    res.status(201).json({
      message: 'File uploaded successfully',
      fileId: fileId,
      filename: originalName,
      rowCount: rowCount
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: 'Failed to upload file' });
  }
});

// 获取用户的CSV文件列表
router.get('/list', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const files = db.all(
      'SELECT id, original_name, upload_date, row_count FROM csv_files WHERE user_id = ? ORDER BY upload_date DESC',
      [userId]
    );

    res.json({ files });
  } catch (error) {
    console.error('List error:', error);
    res.status(500).json({ message: 'Failed to retrieve file list' });
  }
});

// 获取CSV文件的分页数据
router.get('/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const fileId = parseInt(req.params.id);
    
    // 获取分页参数
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 100;
    const offset = (page - 1) * pageSize;

    // 验证文件属于当前用户
    const file = db.get('SELECT * FROM csv_files WHERE id = ? AND user_id = ?', [fileId, userId]);

    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    // 获取表头
    const headerRow = db.get('SELECT row_data FROM csv_data WHERE file_id = ? AND is_header = 1', [fileId]);
    let headers: string[] = [];
    if (headerRow) {
      headers = JSON.parse(headerRow.row_data);
    }

    // 获取总记录数
    const countResult = db.get('SELECT COUNT(*) as total FROM csv_data WHERE file_id = ? AND is_header = 0', [fileId]);
    const totalRows = countResult.total;

    // 获取分页数据
    const rows = db.all(
      'SELECT row_number, row_data FROM csv_data WHERE file_id = ? AND is_header = 0 ORDER BY row_number LIMIT ? OFFSET ?',
      [fileId, pageSize, offset]
    );

    // 解析数据
    const data = rows.map((row: any) => {
      const values = JSON.parse(row.row_data);
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
  }
});

export default router;
