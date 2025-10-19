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
  Alert,
  CircularProgress,
  TextField,
  Grid,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
} from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import ClearIcon from '@mui/icons-material/Clear';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';

interface CSVData {
  file: {
    id: number;
    name: string;
    uploadDate: string;
    totalRows: number;
  };
  headers: string[];
  data: any[];
  pagination: {
    currentPage: number;
    pageSize: number;
    totalRows: number;
    totalPages: number;
  };
}

interface FilterState {
  column: string;
  keyword: string;
  startDateTime: string;
  endDateTime: string;
}

const CSVViewer: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user, logout } = useAuth();
  const [csvData, setCsvData] = useState<CSVData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(100);
  const [filterState, setFilterState] = useState<FilterState>({
    column: '',
    keyword: '',
    startDateTime: '',
    endDateTime: '',
  });
  const navigate = useNavigate();

  const fetchData = async (pageNum: number = 1, pageSize: number = 100) => {
    try {
      setLoading(true);
      const params: any = {
        page: pageNum,
        pageSize: pageSize,
      };

      if (filterState.column) {
        params.filterColumn = filterState.column;
      }
      if (filterState.keyword) {
        params.filterKeyword = filterState.keyword;
      }
      if (filterState.startDateTime) {
        params.filterStartDate = filterState.startDateTime;
      }
      if (filterState.endDateTime) {
        params.filterEndDate = filterState.endDateTime;
      }

      const response = await axios.get(`/api/csv/${id}`, { params });
      setCsvData(response.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load CSV data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(1, rowsPerPage);
  }, [id]);

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
    fetchData(newPage + 1, rowsPerPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = parseInt(event.target.value, 10);
    setRowsPerPage(newSize);
    setPage(0);
    fetchData(1, newSize);
  };

  const applyFilters = () => {
    setPage(0);
    fetchData(1, rowsPerPage);
  };

  const clearFilters = () => {
    setFilterState({
      column: '',
      keyword: '',
      startDateTime: '',
      endDateTime: '',
    });
    setTimeout(() => {
      setPage(0);
      fetchData(1, rowsPerPage);
    }, 100);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleBack = () => {
    navigate('/dashboard');
  };

  const handleDelete = async () => {
    if (!window.confirm('确定要删除这个文件吗？')) {
      return;
    }

    try {
      await axios.delete(`/api/csv/${id}`);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete file');
    }
  };

  const hasActiveFilters =
    filterState.keyword ||
    filterState.startDateTime ||
    filterState.endDateTime;

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            CSV 数据查看器 - 百万行优化版
          </Typography>
          <Typography sx={{ mr: 2 }}>欢迎, {user?.username}</Typography>
          <Button color="inherit" onClick={handleLogout}>
            退出登录
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth={false} sx={{ mt: 4, px: 3 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {loading && !csvData ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : csvData ? (
          <Paper elevation={3} sx={{ p: 3 }}>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                mb: 3,
              }}
            >
              <Box>
                <Typography variant="h5">{csvData.file.name}</Typography>
                <Typography variant="body2" color="text.secondary">
                  上传时间: {new Date(csvData.file.uploadDate + 'Z').toLocaleString()}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  总记录数: {csvData.file.totalRows?.toLocaleString() || csvData.pagination.totalRows.toLocaleString()} 条
                </Typography>
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                  <Chip label="服务端分页" color="success" size="small" />
                  <Chip label="内容自适应" color="info" size="small" />
                  <Chip label="横向滚动" color="primary" size="small" />
                </Stack>
              </Box>
              <Box>
                <Button variant="outlined" onClick={handleBack} sx={{ mr: 1 }}>
                  返回
                </Button>
                <Button variant="outlined" color="error" onClick={handleDelete}>
                  删除
                </Button>
              </Box>
            </Box>

            <Paper elevation={2} sx={{ p: 2, mb: 3, backgroundColor: '#f5f5f5' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <FilterListIcon sx={{ mr: 1 }} />
                <Typography variant="h6">数据过滤</Typography>
              </Box>

              <Grid container spacing={2}>
                <Grid item xs={12} md={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel>选择列</InputLabel>
                    <Select
                      value={filterState.column}
                      label="选择列"
                      onChange={(e) =>
                        setFilterState({ ...filterState, column: e.target.value })
                      }
                    >
                      <MenuItem value="">
                        <em>请选择</em>
                      </MenuItem>
                      {csvData.headers.map((header) => (
                        <MenuItem key={header} value={header}>
                          {header}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} md={2}>
                  <TextField
                    fullWidth
                    size="small"
                    label="关键字"
                    placeholder="输入搜索关键字"
                    value={filterState.keyword}
                    onChange={(e) =>
                      setFilterState({ ...filterState, keyword: e.target.value })
                    }
                    disabled={!filterState.column}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        applyFilters();
                      }
                    }}
                  />
                </Grid>

                <Grid item xs={12} md={3}>
                  <TextField
                    fullWidth
                    size="small"
                    type="datetime-local"
                    label="开始时间"
                    InputLabelProps={{ shrink: true }}
                    value={filterState.startDateTime}
                    onChange={(e) =>
                      setFilterState({ ...filterState, startDateTime: e.target.value })
                    }
                    disabled={!filterState.column}
                    inputProps={{ step: 1 }}
                  />
                </Grid>

                <Grid item xs={12} md={3}>
                  <TextField
                    fullWidth
                    size="small"
                    type="datetime-local"
                    label="结束时间"
                    InputLabelProps={{ shrink: true }}
                    value={filterState.endDateTime}
                    onChange={(e) =>
                      setFilterState({ ...filterState, endDateTime: e.target.value })
                    }
                    disabled={!filterState.column}
                    inputProps={{ step: 1 }}
                  />
                </Grid>

                <Grid item xs={12} md={2}>
                  <Stack direction="row" spacing={1}>
                    <Button
                      variant="contained"
                      onClick={applyFilters}
                      disabled={!filterState.column}
                      fullWidth
                    >
                      应用
                    </Button>
                    <Button
                      variant="outlined"
                      onClick={clearFilters}
                      disabled={!hasActiveFilters}
                      startIcon={<ClearIcon />}
                    >
                      清除
                    </Button>
                  </Stack>
                </Grid>
              </Grid>

              {hasActiveFilters && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    活动过滤器:
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    {filterState.column && filterState.keyword && (
                      <Chip
                        label={`${filterState.column}: "${filterState.keyword}"`}
                        onDelete={() => {
                          setFilterState({ ...filterState, keyword: '' });
                          setTimeout(() => fetchData(page + 1, rowsPerPage), 100);
                        }}
                        color="primary"
                        size="small"
                      />
                    )}
                    {filterState.startDateTime && (
                      <Chip
                        label={`开始: ${filterState.startDateTime.replace('T', ' ')}`}
                        onDelete={() => {
                          setFilterState({ ...filterState, startDateTime: '' });
                          setTimeout(() => fetchData(page + 1, rowsPerPage), 100);
                        }}
                        color="primary"
                        size="small"
                      />
                    )}
                    {filterState.endDateTime && (
                      <Chip
                        label={`结束: ${filterState.endDateTime.replace('T', ' ')}`}
                        onDelete={() => {
                          setFilterState({ ...filterState, endDateTime: '' });
                          setTimeout(() => fetchData(page + 1, rowsPerPage), 100);
                        }}
                        color="primary"
                        size="small"
                      />
                    )}
                  </Stack>
                </Box>
              )}
            </Paper>

            <TableContainer 
              component={Paper} 
              sx={{ 
                maxHeight: 600,
                overflow: 'auto',
                '& table': {
                  tableLayout: 'auto',
                  minWidth: 'max-content',
                },
              }}
            >
              <Table stickyHeader>
                <TableHead>
                  <TableRow>
                    {csvData.headers.map((header) => (
                      <TableCell 
                        key={header}
                        sx={{
                          fontWeight: 'bold',
                          backgroundColor: '#f5f5f5',
                          whiteSpace: 'nowrap',
                          minWidth: '150px',
                        }}
                      >
                        {header}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={csvData.headers.length} align="center">
                        <CircularProgress />
                      </TableCell>
                    </TableRow>
                  ) : csvData.data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={csvData.headers.length} align="center">
                        没有数据
                      </TableCell>
                    </TableRow>
                  ) : (
                    csvData.data.map((row, index) => (
                      <TableRow 
                        key={row._rowNumber || index}
                        hover
                        onClick={() => navigate(`/csv/${id}/row/${row._rowNumber}`)}
                        sx={{ 
                          '&:nth-of-type(odd)': { backgroundColor: '#fafafa' },
                          cursor: 'pointer',
                          '&:hover': {
                            backgroundColor: '#e3f2fd',
                          },
                        }}
                      >
                        {csvData.headers.map((header) => (
                          <TableCell 
                            key={header}
                            sx={{
                              whiteSpace: 'pre-wrap',
                              maxWidth: '400px',
                              wordBreak: 'break-word',
                              verticalAlign: 'top',
                            }}
                          >
                            {row[header] || ''}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            <TablePagination
              rowsPerPageOptions={[50, 100, 200, 500]}
              component="div"
              count={csvData.pagination.totalRows}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              labelRowsPerPage="每页行数:"
              labelDisplayedRows={({ from, to, count }) => 
                `${from}-${to} / 共 ${count !== -1 ? count : `超过 ${to}`} 条`
              }
            />

            <Box sx={{ mt: 2, p: 2, backgroundColor: '#e3f2fd', borderRadius: 1 }}>
              <Typography variant="body2" color="primary">
                🚀 所有内容完整显示 | 使用横向和纵向滚动条查看全部数据 | 百万行数据服务端分页，1秒内响应
              </Typography>
            </Box>
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

export default CSVViewer;
