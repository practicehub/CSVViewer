import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Paper,
  Typography,
  Box,
  Button,
  TextField,
  Alert,
  CircularProgress,
  Avatar,
  Grid,
  Card,
  CardContent,
  Divider,
} from '@mui/material';
import { ArrowBack, Edit, Save, Cancel } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';

interface UserProfile {
  id: number;
  username: string;
  created_at: string;
}

const UserProfile: React.FC = () => {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const response = await axios.get('/api/auth/profile');
      setProfile(response.data.user);
      setNewUsername(response.data.user.username);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async () => {
    setError('');
    setSuccess('');

    if (newPassword && newPassword !== confirmPassword) {
      setError('新密码和确认密码不匹配');
      return;
    }

    try {
      const updateData: any = {};
      if (newUsername !== profile?.username) {
        updateData.username = newUsername;
      }
      if (newPassword) {
        updateData.currentPassword = currentPassword;
        updateData.newPassword = newPassword;
      }

      if (Object.keys(updateData).length === 0) {
        setError('没有需要更新的信息');
        return;
      }

      await axios.put('/api/auth/profile', updateData);
      setSuccess('个人资料更新成功！');
      setEditing(false);
      fetchProfile();
      
      // 如果更新了用户名，需要更新本地存储
      if (newUsername !== profile?.username) {
        const updatedUser = { ...user, username: newUsername };
        localStorage.setItem('user', JSON.stringify(updatedUser));
        window.location.reload(); // 刷新页面以更新用户名显示
      }
    } catch (err: any) {
      setError(err.response?.data?.message || '更新失败');
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setNewUsername(profile?.username || '');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm('确定要删除账户吗？此操作不可撤销！')) {
      return;
    }

    try {
      await axios.delete('/api/auth/profile');
      logout();
      navigate('/login');
    } catch (err: any) {
      setError(err.response?.data?.message || '删除账户失败');
    }
  };

  if (loading) {
    return (
      <Container maxWidth="md" sx={{ mt: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ mt: 4 }}>
      <Paper elevation={3} sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
          <Button
            startIcon={<ArrowBack />}
            onClick={() => navigate('/dashboard')}
            sx={{ mr: 2 }}
          >
            返回
          </Button>
          <Typography variant="h4" component="h1" sx={{ flexGrow: 1 }}>
            个人资料
          </Typography>
          {!editing && (
            <Button
              variant="outlined"
              startIcon={<Edit />}
              onClick={() => setEditing(true)}
            >
              编辑
            </Button>
          )}
        </Box>

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

        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <Box sx={{ textAlign: 'center' }}>
              <Avatar
                sx={{ width: 120, height: 120, mx: 'auto', mb: 2, bgcolor: 'primary.main' }}
              >
                {profile?.username.charAt(0).toUpperCase()}
              </Avatar>
              <Typography variant="h6">{profile?.username}</Typography>
              <Typography variant="body2" color="text.secondary">
                用户ID: {profile?.id}
              </Typography>
            </Box>
          </Grid>

          <Grid item xs={12} md={8}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  账户信息
                </Typography>
                <Divider sx={{ mb: 2 }} />

                {!editing ? (
                  <Box>
                    <Typography variant="body1" sx={{ mb: 1 }}>
                      <strong>用户名:</strong> {profile?.username}
                    </Typography>
                    <Typography variant="body1" sx={{ mb: 1 }}>
                      <strong>注册时间:</strong> {profile?.created_at ? new Date(profile.created_at).toLocaleString() : '未知'}
                    </Typography>
                  </Box>
                ) : (
                  <Box component="form" onSubmit={(e) => { e.preventDefault(); handleUpdateProfile(); }}>
                    <TextField
                      fullWidth
                      label="用户名"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      margin="normal"
                      required
                      inputProps={{ minLength: 3 }}
                    />
                    
                    <Typography variant="h6" sx={{ mt: 3, mb: 1 }}>
                      修改密码
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      留空则不修改密码
                    </Typography>
                    
                    <TextField
                      fullWidth
                      type="password"
                      label="当前密码"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      margin="normal"
                      helperText="修改密码时需要填写当前密码"
                    />
                    
                    <TextField
                      fullWidth
                      type="password"
                      label="新密码"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      margin="normal"
                      inputProps={{ minLength: 6 }}
                    />
                    
                    <TextField
                      fullWidth
                      type="password"
                      label="确认新密码"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      margin="normal"
                      error={newPassword !== confirmPassword}
                      helperText={newPassword !== confirmPassword ? '密码不匹配' : ''}
                    />

                    <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
                      <Button
                        type="submit"
                        variant="contained"
                        startIcon={<Save />}
                      >
                        保存
                      </Button>
                      <Button
                        variant="outlined"
                        startIcon={<Cancel />}
                        onClick={handleCancel}
                      >
                        取消
                      </Button>
                    </Box>
                  </Box>
                )}
              </CardContent>
            </Card>

            <Card sx={{ mt: 2 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom color="error">
                  危险操作
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  删除账户将永久删除您的所有数据，包括上传的CSV文件。此操作不可撤销。
                </Typography>
                <Button
                  variant="outlined"
                  color="error"
                  onClick={handleDeleteAccount}
                >
                  删除账户
                </Button>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Paper>
    </Container>
  );
};

export default UserProfile;
