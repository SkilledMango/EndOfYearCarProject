import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
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
        bgcolor: 'background.default',
        p: 2,
      }}
    >
      <Paper sx={{ p: 4, width: 380, maxWidth: '100%', borderRadius: 4 }}>
        {/* Mirrors the mobile app's login header: the same rounded-square
            logo tile, name and tagline, so the two read as one product. */}
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3 }}>
          <Box
            sx={{
              width: 68, height: 68, borderRadius: 4,
              bgcolor: 'primary.dark',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              mb: 2,
            }}
          >
            <DirectionsCarIcon sx={{ color: '#fff', fontSize: 34 }} />
          </Box>
          <Typography variant="h5" sx={{ fontSize: 26 }}>
            CarStats
          </Typography>
          <Typography
            sx={{ fontSize: 11, letterSpacing: 2, color: 'text.secondary', mt: 0.5 }}
          >
            ADMIN PANEL
          </Typography>
          <Typography variant="body2" sx={{ mt: 1.5 }}>
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
