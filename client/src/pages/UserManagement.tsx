import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Alert,
  Box,
  CircularProgress,
  Chip
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  Person as PersonIcon
} from '@mui/icons-material';
import axios from 'axios';

interface User {
  id: number;
  username: string;
  created_at: string;
}

interface UserDetail {
  user: User;
  csvFileCount: number;
}

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({ username: '', password: '' });
  const [editLoading, setEditLoading] = useState(false);

  // 获取用户列表
  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/users');
      setUsers(response.data.users);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.message || '获取用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 获取用户详情
  const fetchUserDetail = async (userId: number) => {
    try {
      const response = await axios.get(`/api/users/${userId}`);
      setSelectedUser(response.data);
    } catch (err: any) {
      setError(err.response?.data?.message || '获取用户详情失败');
    }
  };

  // 编辑用户
  const handleEdit = (user: User) => {
    setSelectedUser({ user: { ...user }, csvFileCount: 0 });
    setEditForm({ username: user.username, password: '' });
    setEditDialogOpen(true);
  };

  // 查看用户详情
  const handleView = async (user: User) => {
    await fetchUserDetail(user.id);
    setViewDialogOpen(true);
  };

  // 删除用户
  const handleDelete = (user: User) => {
    setSelectedUser({ user: { ...user }, csvFileCount: 0 });
    setDeleteDialogOpen(true);
  };

  // 提交编辑
  const handleEditSubmit = async () => {
    try {
      setEditLoading(true);
      const updateData: any = {};
      if (editForm.username !== selectedUser?.user?.username) {
        updateData.username = editForm.username;
      }
      if (editForm.password) {
        updateData.password = editForm.password;
      }

      await axios.put(`/api/users/${selectedUser!.user!.id}`, updateData);
      await fetchUsers();
      setEditDialogOpen(false);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.message || '更新用户失败');
    } finally {
      setEditLoading(false);
    }
  };

  // 确认删除
  const handleDeleteConfirm = async () => {
    try {
      await axios.delete(`/api/users/${selectedUser!.user.id}`);
      await fetchUsers();
      setDeleteDialogOpen(false);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.message || '删除用户失败');
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, textAlign: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        用户管理
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>用户名</TableCell>
              <TableCell>注册时间</TableCell>
              <TableCell align="center">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{user.id}</TableCell>
                <TableCell>
                  <Box display="flex" alignItems="center" gap={1}>
                    <PersonIcon color="primary" />
                    {user.username}
                  </Box>
                </TableCell>
                <TableCell>{new Date(user.created_at).toLocaleString('zh-CN')}</TableCell>
                <TableCell align="center">
                  <IconButton
                    color="primary"
                    onClick={() => handleView(user)}
                    title="查看详情"
                  >
                    <ViewIcon />
                  </IconButton>
                  <IconButton
                    color="primary"
                    onClick={() => handleEdit(user)}
                    title="编辑"
                  >
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    color="error"
                    onClick={() => handleDelete(user)}
                    title="删除"
                  >
                    <DeleteIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* 查看用户详情对话框 */}
      <Dialog open={viewDialogOpen} onClose={() => setViewDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>用户详情</DialogTitle>
        <DialogContent>
          {selectedUser && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body1" gutterBottom>
                <strong>ID:</strong> {selectedUser.user.id}
              </Typography>
              <Typography variant="body1" gutterBottom>
                <strong>用户名:</strong> {selectedUser.user.username}
              </Typography>
              <Typography variant="body1" gutterBottom>
                <strong>注册时间:</strong> {new Date(selectedUser.user.created_at).toLocaleString('zh-CN')}
              </Typography>
              <Typography variant="body1" gutterBottom>
                <strong>CSV文件数量:</strong> 
                <Chip 
                  label={selectedUser.csvFileCount} 
                  color="primary" 
                  size="small" 
                  sx={{ ml: 1 }}
                />
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewDialogOpen(false)}>关闭</Button>
        </DialogActions>
      </Dialog>

      {/* 编辑用户对话框 */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>编辑用户</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="用户名"
            value={editForm.username}
            onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
            margin="normal"
            required
          />
          <TextField
            fullWidth
            label="新密码（留空则不修改）"
            type="password"
            value={editForm.password}
            onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
            margin="normal"
            helperText="如果不需要修改密码，请留空"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>取消</Button>
          <Button 
            onClick={handleEditSubmit} 
            variant="contained"
            disabled={editLoading}
          >
            {editLoading ? <CircularProgress size={24} /> : '保存'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 删除用户确认对话框 */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          <Typography>
            确定要删除用户 "{selectedUser?.user?.username}" 吗？此操作将同时删除该用户的所有CSV文件和数据，且不可恢复。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>取消</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            确认删除
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default UserManagement;
