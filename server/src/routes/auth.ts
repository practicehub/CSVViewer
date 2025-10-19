import express, { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import db from '../db';
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
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password } = req.body;

    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      
      db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword]);
      
      // 获取新插入的用户ID
      const user = db.get('SELECT id FROM users WHERE username = ?', [username]);
      
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
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password } = req.body;

    try {
      const user = db.get('SELECT * FROM users WHERE username = ?', [username]) as any;

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
        },
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// 获取用户资料
router.get('/profile', authenticateToken, (req: AuthRequest, res) => {
  try {
    const user = db.get('SELECT id, username, created_at FROM users WHERE id = ?', [req.userId!]) as any;

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
