import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import Papa from 'papaparse';
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
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit for large log files
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
    const file = db.get('SELECT id FROM csv_files WHERE filename = ?', [filename]) as any;
    const fileId = file.id;

    // 使用Papa Parse正确处理CSV（支持引号内换行符）
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

    // 批量插入数据（存储为JSON以保留所有内容包括换行符）
    const batchSize = 1000;
    let rowCount = 0;

    for (let i = 1; i < rows.length; i++) {
      rowCount++;
      const rowLine = JSON.stringify(rows[i]);
      db.run('INSERT INTO csv_data (file_id, row_number, row_data, is_header) VALUES (?, ?, ?, ?)', 
        [fileId, rowCount, rowLine, 0]);

      // 每1000行提交一次（实际上sql.js会自动保存）
      if (rowCount % batchSize === 0) {
        // 进度记录
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

// 获取CSV文件的分页数据 - 支持大数据量
router.get('/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const fileId = parseInt(req.params.id);
    
    // 获取分页参数
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 100;
    const offset = (page - 1) * pageSize;

    // 获取过滤参数
    const filterColumn = req.query.filterColumn as string;
    const filterKeyword = req.query.filterKeyword as string;
    const filterStartDate = req.query.filterStartDate as string;
    const filterEndDate = req.query.filterEndDate as string;

    // 验证文件属于当前用户
    const file = db.get('SELECT * FROM csv_files WHERE id = ? AND user_id = ?', [fileId, userId]) as any;

    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    // 获取表头（兼容旧格式和新格式）
    const headerRow = db.get('SELECT row_data FROM csv_data WHERE file_id = ? AND is_header = 1', [fileId]) as any;
    let headers: string[] = [];
    if (headerRow) {
      try {
        headers = JSON.parse(headerRow.row_data);
      } catch {
        // 兼容旧格式（CSV字符串）
        headers = headerRow.row_data.split(',').map((h: string) => h.trim());
      }
    }

    // 构建WHERE子句用于过滤
    let whereClause = 'file_id = ? AND is_header = 0';
    const queryParams: any[] = [fileId];

    if (filterColumn && filterKeyword && headers.includes(filterColumn)) {
      whereClause += ' AND row_data LIKE ?';
      queryParams.push(`%${filterKeyword}%`);
    }

    // 获取总记录数（考虑过滤）
    const countResult = db.get(
      `SELECT COUNT(*) as total FROM csv_data WHERE ${whereClause}`,
      queryParams
    ) as any;
    const totalRows = countResult.total;

    // 获取分页数据
    const rows = db.all(
      `SELECT row_number, row_data FROM csv_data WHERE ${whereClause} ORDER BY row_number LIMIT ? OFFSET ?`,
      [...queryParams, pageSize, offset]
    ) as any[];

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

    // 如果有日期过滤，在应用层再过滤一次
    let filteredData = data;
    if (filterColumn && (filterStartDate || filterEndDate)) {
      filteredData = data.filter((row: any) => {
        const value = row[filterColumn];
        if (!value) return false;

        try {
          const rowDate = new Date(value);
          if (isNaN(rowDate.getTime())) return true;

          if (filterStartDate) {
            const startDate = new Date(filterStartDate);
            if (rowDate < startDate) return false;
          }

          if (filterEndDate) {
            const endDate = new Date(filterEndDate);
            endDate.setHours(23, 59, 59, 999);
            if (rowDate > endDate) return false;
          }

          return true;
        } catch {
          return true;
        }
      });
    }

    res.json({
      file: {
        id: file.id,
        name: file.original_name,
        uploadDate: file.upload_date,
        totalRows: file.row_count || totalRows
      },
      headers,
      data: filteredData,
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

// 获取单行数据详情
router.get('/:id/row/:rowNumber', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const fileId = parseInt(req.params.id);
    const rowNumber = parseInt(req.params.rowNumber);

    // 验证文件属于当前用户
    const file = db.get('SELECT * FROM csv_files WHERE id = ? AND user_id = ?', [fileId, userId]) as any;
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    // 获取表头（兼容旧格式和新格式）
    const headerRow = db.get('SELECT row_data FROM csv_data WHERE file_id = ? AND is_header = 1', [fileId]) as any;
    let headers: string[] = [];
    if (headerRow) {
      try {
        headers = JSON.parse(headerRow.row_data);
      } catch {
        // 兼容旧格式（CSV字符串）
        headers = headerRow.row_data.split(',').map((h: string) => h.trim());
      }
    }

    // 获取指定行数据
    const row = db.get('SELECT row_data FROM csv_data WHERE file_id = ? AND row_number = ?', [fileId, rowNumber]) as any;
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
  }
});

// 批量删除CSV文件
router.post('/batch-delete', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { fileIds } = req.body;

    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return res.status(400).json({ message: 'No files selected' });
    }

    let deletedCount = 0;

    for (const fileId of fileIds) {
      // 验证文件属于当前用户
      const file = db.get('SELECT filename FROM csv_files WHERE id = ? AND user_id = ?', [fileId, userId]) as any;

      if (file) {
        // 删除物理文件
        const filePath = path.join(uploadDir, file.filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }

        // 删除CSV数据
        db.run('DELETE FROM csv_data WHERE file_id = ?', [fileId]);
        
        // 删除文件记录
        db.run('DELETE FROM csv_files WHERE id = ?', [fileId]);
        
        deletedCount++;
      }
    }

    res.json({ message: `Successfully deleted ${deletedCount} file(s)`, deletedCount });
  } catch (error) {
    console.error('Batch delete error:', error);
    res.status(500).json({ message: 'Failed to delete files' });
  }
});

// 删除CSV文件
router.delete('/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const fileId = parseInt(req.params.id);

    // 验证文件属于当前用户
    const file = db.get('SELECT filename FROM csv_files WHERE id = ? AND user_id = ?', [fileId, userId]) as any;

    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    // 删除物理文件
    const filePath = path.join(uploadDir, file.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // 删除CSV数据
    db.run('DELETE FROM csv_data WHERE file_id = ?', [fileId]);
    
    // 删除文件记录
    db.run('DELETE FROM csv_files WHERE id = ?', [fileId]);

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ message: 'Failed to delete file' });
  }
});

export default router;
