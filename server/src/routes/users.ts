import express, { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { body, validationResult } from 'express-validator';
import db from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();

// 获取所有用户（管理员功能）
router.get('/', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    // 检查是否是管理员（这里简化处理，实际应用中应该有更严格的权限控制）
    const users = db.all('SELECT id, username, created_at FROM users ORDER BY created_at DESC');
    
    // 不返回密码信息
    const safeUsers = users.map(user => ({
      id: user.id,
      username: user.username,
      created_at: user.created_at
    }));
    
    res.json({ users: safeUsers });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// 获取单个用户详情
router.get('/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    
    const user = db.get('SELECT id, username, created_at FROM users WHERE id = ?', [userId]);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // 获取用户的CSV文件统计
    const csvStats = db.get('SELECT COUNT(*) as count FROM csv_files WHERE user_id = ?', [userId]);
    
    res.json({
      user: {
        id: user.id,
        username: user.username,
        created_at: user.created_at
      },
      csvFileCount: csvStats.count
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// 更新用户信息
router.put('/:id', authenticateToken, [
  body('username').optional().trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
  body('password').optional().isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
], async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const userId = parseInt(req.params.id);
    const { username, password } = req.body;
    
    // 检查用户是否存在
    const existingUser = db.get('SELECT id FROM users WHERE id = ?', [userId]);
    if (!existingUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // 构建更新语句
    let updateSql = 'UPDATE users SET ';
    const params: any[] = [];
    
    if (username) {
      // 检查用户名是否已存在（排除当前用户）
      const usernameExists = db.get('SELECT id FROM users WHERE username = ? AND id != ?', [username, userId]);
      if (usernameExists) {
        return res.status(409).json({ message: 'Username already exists' });
      }
      updateSql += 'username = ?';
      params.push(username);
    }
    
    if (password) {
      if (params.length > 0) updateSql += ', ';
      const hashedPassword = await bcrypt.hash(password, 10);
      updateSql += 'password = ?';
      params.push(hashedPassword);
    }
    
    if (params.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }
    
    updateSql += ' WHERE id = ?';
    params.push(userId);
    
    db.run(updateSql, params);
    
    // 返回更新后的用户信息
    const updatedUser = db.get('SELECT id, username, created_at FROM users WHERE id = ?', [userId]);
    
    res.json({ 
      message: 'User updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// 删除用户
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    
    // 检查用户是否存在
    const existingUser = db.get('SELECT id FROM users WHERE id = ?', [userId]);
    if (!existingUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // 删除用户（由于设置了外键约束，相关的CSV文件和数据也会被删除）
    db.run('DELETE FROM users WHERE id = ?', [userId]);
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
