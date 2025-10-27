import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Box,
  Typography,
  Button,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  AppBar,
  Toolbar,
  Alert,
  CircularProgress,
  Checkbox,
  Menu,
  MenuItem,
  IconButton,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import PeopleIcon from '@mui/icons-material/People';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';

interface CSVFile {
  id: number;
  original_name: string;
  upload_date: string;
  row_count?: number;
}

const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const [files, setFiles] = useState<CSVFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const navigate = useNavigate();

  const fetchFiles = async () => {
    try {
      const response = await axios.get('/api/csv/list');
      setFiles(response.data.files);
      setSelectedFiles([]);
    } catch (err) {
      setError('Failed to load files');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError('');
    setSuccess('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      await axios.post('/api/csv/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSuccess('文件上传成功！');
      fetchFiles();
    } catch (err: any) {
      setError(err.response?.data?.message || '文件上传失败');
    } finally {
      setUploading(false);
    }
  };

  const handleFileClick = (fileId: number, event: React.MouseEvent) => {
    // 如果点击的是checkbox或删除按钮，不跳转
    const target = event.target as HTMLElement;
    if (target.closest('input[type="checkbox"]') || target.closest('button')) {
      return;
    }
    navigate(`/csv/${fileId}`);
  };

  const handleSelectFile = (fileId: number) => {
    setSelectedFiles(prev =>
      prev.includes(fileId)
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId]
    );
  };

  const handleSelectAll = () => {
    if (selectedFiles.length === files.length) {
      setSelectedFiles([]);
    } else {
      setSelectedFiles(files.map(f => f.id));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedFiles.length === 0) return;

    if (!window.confirm(`确定要删除选中的 ${selectedFiles.length} 个文件吗？`)) {
      return;
    }

    setDeleting(true);
    setError('');
    setSuccess('');

    try {
      await axios.post('/api/csv/batch-delete', { fileIds: selectedFiles });
      setSuccess(`成功删除 ${selectedFiles.length} 个文件`);
      fetchFiles();
    } catch (err: any) {
      setError(err.response?.data?.message || '删除失败');
    } finally {
      setDeleting(false);
    }
  };

  const handleSingleDelete = async (fileId: number, fileName: string) => {
    if (!window.confirm(`确定要删除文件 "${fileName}" 吗？`)) {
      return;
    }

    setDeleting(true);
    setError('');
    setSuccess('');

    try {
      await axios.delete(`/api/csv/${fileId}`);
      setSuccess(`成功删除文件 "${fileName}"`);
      fetchFiles();
    } catch (err: any) {
      setError(err.response?.data?.message || '删除失败');
    } finally {
      setDeleting(false);
    }
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleProfile = () => {
    handleMenuClose();
    navigate('/profile');
  };

  const handleUserManagement = () => {
    handleMenuClose();
    navigate('/user-management');
  };

  const handleLogout = () => {
    handleMenuClose();
    logout();
    navigate('/login');
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return '无效日期';
      }
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch (error) {
      console.error('日期解析错误:', error, dateString);
      return '无效日期';
    }
  };

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            CSV 数据管理
          </Typography>
          <Typography sx={{ mr: 2 }}>
            欢迎, {user?.username} {user?.isAdmin ? '(管理员)' : '(普通用户)'}
          </Typography>
          <IconButton
            size="large"
            aria-label="account of current user"
            aria-controls="menu-appbar"
            aria-haspopup="true"
            onClick={handleMenuOpen}
            color="inherit"
          >
            <AccountCircleIcon />
          </IconButton>
          <Menu
            id="menu-appbar"
            anchorEl={anchorEl}
            anchorOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
            keepMounted
            transformOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
          >
            <MenuItem onClick={handleProfile}>
              <AccountCircleIcon sx={{ mr: 1 }} />
              个人资料
            </MenuItem>
            {user?.isAdmin && (
              <MenuItem onClick={handleUserManagement}>
                <PeopleIcon sx={{ mr: 1 }} />
                用户管理
              </MenuItem>
            )}
            <MenuItem onClick={handleLogout}>
              退出登录
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Paper elevation={3} sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h5">我的CSV文件</Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              {selectedFiles.length > 0 && (
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteIcon />}
                  onClick={handleBatchDelete}
                  disabled={deleting}
                >
                  {deleting ? '删除中...' : `删除 (${selectedFiles.length})`}
                </Button>
              )}
              <Button
                variant="contained"
                component="label"
                disabled={uploading}
              >
                {uploading ? <CircularProgress size={24} /> : '上传CSV文件'}
                <input
                  type="file"
                  accept=".csv"
                  hidden
                  onChange={handleFileUpload}
                />
              </Button>
            </Box>
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

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress />
            </Box>
          ) : files.length === 0 ? (
            <Typography variant="body1" color="text.secondary" align="center" sx={{ p: 3 }}>
              还没有上传任何文件。点击上方按钮上传您的第一个CSV文件。
            </Typography>
          ) : (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, pl: 2 }}>
                <Checkbox
                  checked={selectedFiles.length === files.length && files.length > 0}
                  indeterminate={selectedFiles.length > 0 && selectedFiles.length < files.length}
                  onChange={handleSelectAll}
                />
                <Typography variant="body2" color="text.secondary">
                  {selectedFiles.length > 0 ? `已选择 ${selectedFiles.length} 个文件` : '全选'}
                </Typography>
              </Box>
              <List>
                {files.map((file) => (
                  <ListItem 
                    key={file.id} 
                    disablePadding
                    secondaryAction={
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <IconButton
                          edge="end"
                          aria-label="delete"
                          onClick={() => handleSingleDelete(file.id, file.original_name)}
                          sx={{ mr: 1 }}
                        >
                          <DeleteIcon />
                        </IconButton>
                        <Checkbox
                          edge="end"
                          checked={selectedFiles.includes(file.id)}
                          onChange={() => handleSelectFile(file.id)}
                        />
                      </Box>
                    }
                  >
                    <ListItemButton onClick={(e) => handleFileClick(file.id, e)}>
                      <ListItemText
                        primary={file.original_name}
                        secondary={`${formatDate(file.upload_date)} | ${file.row_count?.toLocaleString() || '0'} 行`}
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            </>
          )}
        </Paper>
      </Container>
    </>
  );
};

export default Dashboard;
