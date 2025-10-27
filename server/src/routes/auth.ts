import express, { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { SmartDatabaseSelector, DatabaseManager, DbType } from '../db-manager';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();

// 用户注册
router.post(
  '/register',
  [
    body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ],
  async (req: Request, res: Response) => {
    let dbManager: DatabaseManager | null = null;
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { username, password } = req.body;

      dbManager = await SmartDatabaseSelector.createOptimizedDatabase(0);
      const hashedPassword = await bcrypt.hash(password, 10);
      
      dbManager.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword]);
      
      // 获取新插入的用户ID
      const user = dbManager.get('SELECT id FROM users WHERE username = ?', [username]);
      
      res.status(201).json({ 
        message: 'User created successfully', 
        userId: user.id
      });
    } catch (error: any) {
      if (error.message && error.message.includes('UNIQUE')) {
        return res.status(409).json({ message: 'Username already exists' });
      }
      console.error('Registration error:', error);
      res.status(500).json({ message: 'Internal server error' });
    } finally {
      if (dbManager) {
        dbManager.close();
      }
    }
  }
);

// 用户登录
router.post(
  '/login',
  [
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req: Request, res: Response) => {
    let dbManager: DatabaseManager | null = null;
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { username, password } = req.body;

      dbManager = await SmartDatabaseSelector.createOptimizedDatabase(0);
      const user = dbManager.get('SELECT * FROM users WHERE username = ?', [username]) as any;

      if (!user) {
        return res.status(401).json({ message: 'Invalid username or password' });
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ message: 'Invalid username or password' });
      }

      const secret = process.env.JWT_SECRET || 'your_jwt_secret_key';
      const token = jwt.sign({ userId: user.id }, secret, { expiresIn: '24h' });

      res.json({
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          username: user.username,
          isAdmin: Boolean(user.is_admin),
        },
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ message: 'Internal server error' });
    } finally {
      if (dbManager) {
        dbManager.close();
      }
    }
  }
);

// 获取用户资料
router.get('/profile', authenticateToken, async (req: AuthRequest, res) => {
  let dbManager: DatabaseManager | null = null;
  try {
    dbManager = await SmartDatabaseSelector.createOptimizedDatabase(0);
    const user = dbManager.get('SELECT id, username, created_at, is_admin FROM users WHERE id = ?', [req.userId!]) as any;

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ message: 'Failed to retrieve profile' });
  } finally {
    if (dbManager) {
      dbManager.close();
    }
  }
});

// 更新用户资料
router.put('/profile', authenticateToken, async (req: AuthRequest, res) => {
  let dbManager: DatabaseManager | null = null;
  try {
    const { username, currentPassword, newPassword } = req.body;
    const userId = req.userId!;

    dbManager = await SmartDatabaseSelector.createOptimizedDatabase(0);

    // 获取当前用户信息
    const currentUser = dbManager.get('SELECT * FROM users WHERE id = ?', [userId]) as any;
    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // 如果要更新用户名，检查是否已存在
    if (username && username !== currentUser.username) {
      const existingUser = dbManager.get('SELECT id FROM users WHERE username = ? AND id != ?', [username, userId]) as any;
      if (existingUser) {
        return res.status(400).json({ message: 'Username already exists' });
      }
    }

    // 如果要更新密码，验证当前密码
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ message: 'Current password is required to change password' });
      }

      const validPassword = await bcrypt.compare(currentPassword, currentUser.password);
      if (!validPassword) {
        return res.status(401).json({ message: 'Current password is incorrect' });
      }

      const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      dbManager.run('UPDATE users SET password = ? WHERE id = ?', [hashedNewPassword, userId]);
    }

    // 更新用户名
    if (username && username !== currentUser.username) {
      dbManager.run('UPDATE users SET username = ? WHERE id = ?', [username, userId]);
    }

    // 获取更新后的用户信息
    const updatedUser = dbManager.get('SELECT id, username, created_at, is_admin FROM users WHERE id = ?', [userId]) as any;

    res.json({
      message: 'Profile updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Failed to update profile' });
  } finally {
    if (dbManager) {
      dbManager.close();
    }
  }
});

// 删除用户账户
router.delete('/profile', authenticateToken, async (req: AuthRequest, res) => {
  let dbManager: DatabaseManager | null = null;
  try {
    const userId = req.userId!;

    dbManager = await SmartDatabaseSelector.createOptimizedDatabase(0);

    // 删除用户的所有CSV文件和数据
    const userFiles = dbManager.all('SELECT id FROM csv_files WHERE user_id = ?', [userId]) as any[];
    
    for (const file of userFiles) {
      // 删除CSV数据
      dbManager.run('DELETE FROM csv_data WHERE file_id = ?', [file.id]);
    }

    // 删除文件记录
    dbManager.run('DELETE FROM csv_files WHERE user_id = ?', [userId]);

    // 删除用户
    dbManager.run('DELETE FROM users WHERE id = ?', [userId]);

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ message: 'Failed to delete account' });
  } finally {
    if (dbManager) {
      dbManager.close();
    }
  }
});

// 获取所有用户（管理员功能）
router.get('/users', authenticateToken, async (req: AuthRequest, res) => {
  let dbManager: DatabaseManager | null = null;
  try {
    const userId = req.userId!;

    dbManager = await SmartDatabaseSelector.createOptimizedDatabase(0);

    // 检查当前用户是否是管理员
    const currentUser = dbManager.get('SELECT is_admin FROM users WHERE id = ?', [userId]) as any;
    if (!currentUser || !currentUser.is_admin) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    // 获取所有用户
    const users = dbManager.all('SELECT id, username, created_at, is_admin FROM users ORDER BY created_at DESC') as any[];

    res.json({ users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Failed to retrieve users' });
  } finally {
    if (dbManager) {
      dbManager.close();
    }
  }
});

// 更新用户（管理员功能）
router.put('/users/:id', authenticateToken, async (req: AuthRequest, res) => {
  let dbManager: DatabaseManager | null = null;
  try {
    const targetUserId = parseInt(req.params.id);
    const userId = req.userId!;
    const { password, isAdmin } = req.body;

    dbManager = await SmartDatabaseSelector.createOptimizedDatabase(0);

    // 检查当前用户是否是管理员
    const currentUser = dbManager.get('SELECT is_admin FROM users WHERE id = ?', [userId]) as any;
    if (!currentUser || !currentUser.is_admin) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    // 检查目标用户是否存在
    const targetUser = dbManager.get('SELECT * FROM users WHERE id = ?', [targetUserId]) as any;
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // 更新密码
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      dbManager.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, targetUserId]);
    }

    // 更新管理员权限
    if (typeof isAdmin === 'boolean') {
      dbManager.run('UPDATE users SET is_admin = ? WHERE id = ?', [isAdmin ? 1 : 0, targetUserId]);
    }

    res.json({ message: 'User updated successfully' });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ message: 'Failed to update user' });
  } finally {
    if (dbManager) {
      dbManager.close();
    }
  }
});

// 删除用户（管理员功能）
router.delete('/users/:id', authenticateToken, async (req: AuthRequest, res) => {
  let dbManager: DatabaseManager | null = null;
  try {
    const targetUserId = parseInt(req.params.id);
    const userId = req.userId!;

    dbManager = await SmartDatabaseSelector.createOptimizedDatabase(0);

    // 检查当前用户是否是管理员
    const currentUser = dbManager.get('SELECT is_admin FROM users WHERE id = ?', [userId]) as any;
    if (!currentUser || !currentUser.is_admin) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    // 不能删除自己
    if (targetUserId === userId) {
      return res.status(400).json({ message: 'Cannot delete yourself' });
    }

    // 检查目标用户是否存在
    const targetUser = dbManager.get('SELECT * FROM users WHERE id = ?', [targetUserId]) as any;
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // 删除用户的所有CSV文件和数据
    const userFiles = dbManager.all('SELECT id FROM csv_files WHERE user_id = ?', [targetUserId]) as any[];
    
    for (const file of userFiles) {
      // 删除CSV数据
      dbManager.run('DELETE FROM csv_data WHERE file_id = ?', [file.id]);
    }

    // 删除文件记录
    dbManager.run('DELETE FROM csv_files WHERE user_id = ?', [targetUserId]);

    // 删除用户
    dbManager.run('DELETE FROM users WHERE id = ?', [targetUserId]);

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Failed to delete user' });
  } finally {
    if (dbManager) {
      dbManager.close();
    }
  }
});

export default router;
