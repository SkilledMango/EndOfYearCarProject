import { useState } from 'react';
import { Tabs, Tab, Box, Container, AppBar, Toolbar, Typography, Button } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import Analytics    from './Components/Analytics';
import Dashboard    from './Components/Dashboard';
import UsersManager from './Components/UsersManager';
import LoginPage    from './Components/LoginPage';
import { logout as clearToken, hasToken } from './Services/api';

const SESSION_KEY = 'carstats_admin_user';

// Restore a saved session (survives page refresh).
// Both halves must exist: the user object (for display) AND the JWT
// (api.js attaches it to every request) — one without the other is stale.
function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw || !hasToken()) return null;
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function App() {
  const [tabValue, setTabValue] = useState(0);
  const [admin, setAdmin]       = useState(loadSession);

  const handleLogin = (user) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    setAdmin(user);
  };

  const handleLogout = () => {
    localStorage.removeItem(SESSION_KEY);
    clearToken();
    setAdmin(null);
    setTabValue(0);
  };

  // Not signed in → show the login gate instead of the panel
  if (!admin) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <Box sx={{ flexGrow: 1, minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="sticky">
        <Toolbar sx={{ gap: 1.5 }}>
          {/* The app's rounded-square logo tile, in the same deep accent. */}
          <Box
            sx={{
              width: 36, height: 36, borderRadius: 2.5,
              bgcolor: 'primary.dark',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <DirectionsCarIcon sx={{ color: '#fff', fontSize: 20 }} />
          </Box>

          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6" sx={{ lineHeight: 1.15 }}>CarStats</Typography>
            <Typography
              sx={{ fontSize: 10, letterSpacing: 1.5, color: 'text.secondary' }}
            >
              ADMIN PANEL
            </Typography>
          </Box>

          <Box sx={{ textAlign: 'right', mr: 1, display: { xs: 'none', sm: 'block' } }}>
            <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{admin.fullName}</Typography>
            <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{admin.email}</Typography>
          </Box>

          <Button
            size="small"
            variant="outlined"
            color="inherit"
            startIcon={<LogoutIcon />}
            onClick={handleLogout}
            sx={{ borderColor: 'divider', color: 'text.secondary' }}
          >
            Logout
          </Button>
        </Toolbar>

        <Tabs
          value={tabValue}
          onChange={(e, v) => setTabValue(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ px: 2, borderTop: 1, borderColor: 'divider' }}
        >
          <Tab label="Analytics" />
          <Tab label="User Management" />
          <Tab label="DTC Dictionary" />
        </Tabs>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        {tabValue === 0 && <Analytics />}
        {tabValue === 1 && <UsersManager />}
        {tabValue === 2 && <Dashboard />}
      </Container>
    </Box>
  );
}

export default App;
