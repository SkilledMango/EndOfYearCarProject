import { useState } from 'react';
import { Tabs, Tab, Box, Container, AppBar, Toolbar, Typography, Button } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
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
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static" color="default">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700 }}>
            CarStats Admin
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mr: 2 }}>
            {admin.fullName}
          </Typography>
          <Button
            size="small"
            color="inherit"
            startIcon={<LogoutIcon />}
            onClick={handleLogout}
          >
            Logout
          </Button>
        </Toolbar>
        <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)} centered>
          <Tab label="Analytics" />
          <Tab label="User Management" />
          <Tab label="DTC Dictionary" />
        </Tabs>
      </AppBar>

      <Container sx={{ mt: 4 }}>
        {tabValue === 0 && <Analytics />}
        {tabValue === 1 && <UsersManager />}
        {tabValue === 2 && <Dashboard />}
      </Container>
    </Box>
  );
}

export default App;
