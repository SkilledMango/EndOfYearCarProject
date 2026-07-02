import { useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  CircularProgress,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { login } from '../Services/api';

/**
 * Admin panel login gate.
 * Calls the shared /auth/login endpoint and only lets Admin / SuperAdmin
 * accounts through (enforced in api.login). On success, hands the user
 * object up to App so it can persist the session.
 */
function LoginPage({ onLogin }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      const user = await login(email.trim(), password);
      onLogin(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'grey.100',
      }}
    >
      <Paper elevation={3} sx={{ p: 4, width: 380, borderRadius: 3 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 2 }}>
          <Avatar sx={{ bgcolor: 'primary.main', mb: 1 }}>
            <LockOutlinedIcon />
          </Avatar>
          <Typography variant="h5" fontWeight={700}>
            CarStats Admin
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Sign in with an admin account
          </Typography>
        </Box>

        <form onSubmit={handleSubmit} noValidate>
          <TextField
            label="Email"
            type="email"
            fullWidth
            margin="normal"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(null); }}
            autoFocus
            disabled={loading}
          />
          <TextField
            label="Password"
            type="password"
            fullWidth
            margin="normal"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null); }}
            disabled={loading}
          />

          {error && (
            <Alert severity="error" sx={{ mt: 1 }}>
              {error}
            </Alert>
          )}

          <Button
            type="submit"
            variant="contained"
            fullWidth
            size="large"
            sx={{ mt: 2, py: 1.2, fontWeight: 700 }}
            disabled={loading}
          >
            {loading ? <CircularProgress size={24} color="inherit" /> : 'SIGN IN'}
          </Button>
        </form>
      </Paper>
    </Box>
  );
}

export default LoginPage;
