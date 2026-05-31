import { useState } from 'react';
import { Tabs, Tab, Box, Container, AppBar, Toolbar, Typography } from '@mui/material';
import Analytics    from './Components/Analytics';
import Dashboard    from './Components/Dashboard';
import ShopsManager from './Components/ShopsManager';
import UsersManager from './Components/UsersManager';

function App() {
  const [tabValue, setTabValue] = useState(0);

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static" color="default">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700 }}>
            CarStats Admin
          </Typography>
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
