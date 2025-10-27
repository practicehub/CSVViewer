import React, { useState, useEffect } from 'react';
import {
  Container,
  Box,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  CircularProgress,
  IconButton,
  Chip,
  AppBar,
  Toolbar,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  AdminPanelSettings as AdminIcon,
  Person as UserIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';

interface User {
  id: number;
  username: string;
  created_at: string;
  isAdmin?: boolean;
}

const UserManagement: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const navigate = useNavigate();

  const fetchUsers = async () => {
    try {
      const response = await axios.get('/api/auth/users');
      setUsers(response.data.users);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    try {
      await axios.delete(`/api/auth/users/${selectedUser.id}`);
      setSuccess(`用户 ${selectedUser.username} 已删除`);
      setDeleteDialogOpen(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (err: any) {
      setError(err.response?.data?.message || '删除用户失败');
    }
  };

  const handleEditUser = async () => {
    if (!selectedUser) return;

    try {
      const updateData: any = {};
      if (newPassword) {
        updateData.password = newPassword;
      }
      if (selectedUser.isAdmin !== newIsAdmin) {
        updateData.isAdmin = newIsAdmin;
      }

      if (Object.keys(updateData).length > 0) {
        await axios.put(`/api/auth/users/${selectedUser.id}`, updateData);
        setSuccess(`用户 ${selectedUser.username} 已更新`);
        setEditDialogOpen(false);
        setSelectedUser(null);
        setNewPassword('');
        fetchUsers();
      }
    } catch (err: any) {
      setError(err.response?.data?.message || '更新用户失败');
    }
  };

  const openDeleteDialog = (user: User) => {
    setSelectedUser(user);
    setDeleteDialogOpen(true);
  };

  const openEditDialog = (user: User) => {
    setSelectedUser(user);
    setNewIsAdmin(user.isAdmin || false);
    setNewPassword('');
    setEditDialogOpen(true);
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (error) {
      return '无效日期';
    }
  };

  if (loading) {
    return (
      <>
        <AppBar position="static">
          <Toolbar>
            <IconButton edge="start" color="inherit" onClick={() => navigate('/dashboard')}>
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              用户管理
            </Typography>
          </Toolbar>
        </AppBar>
        <Container maxWidth="md" sx={{ mt: 4 }}>
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        </Container>
      </>
    );
  }

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <IconButton edge="start" color="inherit" onClick={() => navigate('/dashboard')}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            用户管理
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Paper elevation={3} sx={{ p: 3 }}>
          <Typography variant="h5" gutterBottom>
            所有用户
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
              {error}
            </Alert>
          )}

          {success && (
            <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
              {success}
            </Alert>
          )}

          {users.length === 0 ? (
            <Typography variant="body1" color="text.secondary" align="center" sx={{ p: 3 }}>
              没有找到用户
            </Typography>
          ) : (
            <List>
              {users.map((user) => (
                <ListItem
                  key={user.id}
                  disablePadding
                  secondaryAction={
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <IconButton
                        edge="end"
                        onClick={() => openEditDialog(user)}
                        disabled={user.id === currentUser?.id}
                      >
                        <EditIcon />
                      </IconButton>
                      <IconButton
                        edge="end"
                        onClick={() => openDeleteDialog(user)}
                        disabled={user.id === currentUser?.id}
                        color="error"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                  }
                >
                  <ListItemButton>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="subtitle1">{user.username}</Typography>
                          {user.isAdmin ? (
                            <Chip
                              icon={<AdminIcon />}
                              label="管理员"
                              size="small"
                              color="primary"
                            />
                          ) : (
                            <Chip
                              icon={<UserIcon />}
                              label="普通用户"
                              size="small"
                              color="default"
                            />
                          )}
                          {user.id === currentUser?.id && (
                            <Chip label="当前用户" size="small" color="success" />
                          )}
                        </Box>
                      }
                      secondary={`注册时间: ${formatDate(user.created_at)}`}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </Paper>
      </Container>

      {/* 删除确认对话框 */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>确认删除用户</DialogTitle>
        <DialogContent>
          <Typography>
            确定要删除用户 "{selectedUser?.username}" 吗？此操作不可撤销。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>取消</Button>
          <Button onClick={handleDeleteUser} color="error" variant="contained">
            删除
          </Button>
        </DialogActions>
      </Dialog>

      {/* 编辑用户对话框 */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>编辑用户 - {selectedUser?.username}</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <TextField
              fullWidth
              label="新密码（留空则不修改）"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              sx={{ mb: 2 }}
            />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography>用户权限:</Typography>
              <Button
                variant={newIsAdmin ? "contained" : "outlined"}
                onClick={() => setNewIsAdmin(true)}
                size="small"
              >
                管理员
              </Button>
              <Button
                variant={!newIsAdmin ? "contained" : "outlined"}
                onClick={() => setNewIsAdmin(false)}
                size="small"
              >
                普通用户
              </Button>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>取消</Button>
          <Button onClick={handleEditUser} variant="contained">
            保存
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default UserManagement;
