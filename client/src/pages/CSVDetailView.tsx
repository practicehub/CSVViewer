import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Box,
  Typography,
  Button,
  Paper,
  AppBar,
  Toolbar,
  TextField,
  Grid,
  CircularProgress,
  Alert,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';

const CSVDetailView: React.FC = () => {
  const { fileId, rowNumber } = useParams<{ fileId: string; rowNumber: string }>();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rowData, setRowData] = useState<any>(null);
  const [headers, setHeaders] = useState<string[]>([]);

  useEffect(() => {
    fetchRowDetail();
  }, [fileId, rowNumber]);

  const fetchRowDetail = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/csv/${fileId}/row/${rowNumber}`);
      setHeaders(response.data.headers);
      setRowData(response.data.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load row data');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate(`/csv/${fileId}`);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            日志详情 - 行 #{rowNumber}
          </Typography>
          <Typography sx={{ mr: 2 }}>欢迎, {user?.username}</Typography>
          <Button color="inherit" onClick={handleLogout}>
            退出登录
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ mt: 4 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : rowData ? (
          <Paper elevation={3} sx={{ p: 3 }}>
            <Box sx={{ mb: 3 }}>
              <Button
                variant="outlined"
                startIcon={<ArrowBackIcon />}
                onClick={handleBack}
              >
                返回列表
              </Button>
            </Box>

            <Typography variant="h6" gutterBottom>
              记录详情
            </Typography>

            <Grid container spacing={3} sx={{ mt: 2 }}>
              {headers.map((header) => (
                <Grid item xs={12} key={header}>
                  <TextField
                    fullWidth
                    label={header}
                    value={rowData[header] || ''}
                    multiline
                    minRows={3}
                    maxRows={20}
                    InputProps={{
                      readOnly: true,
                    }}
                    variant="outlined"
                    sx={{
                      '& .MuiInputBase-input': {
                        fontFamily: 'monospace',
                        fontSize: '0.9rem',
                      },
                    }}
                  />
                </Grid>
              ))}
            </Grid>
          </Paper>
        ) : (
          <Typography variant="body1" color="text.secondary" align="center">
            未找到数据
          </Typography>
        )}
      </Container>
    </>
  );
};

export default CSVDetailView;
