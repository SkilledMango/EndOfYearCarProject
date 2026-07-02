import { useState } from 'react';
import { Tabs, Tab, Box, Container, AppBar, Toolbar, Typography, Button } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import Analytics    from './Components/Analytics';
import Dashboard    from './Components/Dashboard';
import ShopsManager from './Components/ShopsManager';
import UsersManager from './Components/UsersManager';
import LoginPage    from './Components/LoginPage';

const SESSION_KEY = 'carstats_admin_user';

// Restore a saved session (survives page refresh)
function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
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
          <Tab label="Mechanic Shops" />
        </Tabs>
      </AppBar>

      <Container sx={{ mt: 4 }}>
        {tabValue === 0 && <Analytics />}
        {tabValue === 1 && <UsersManager />}
        {tabValue === 2 && <Dashboard />}
        {tabValue === 3 && <ShopsManager />}
      </Container>
    </Box>
  );
}

export default App;
