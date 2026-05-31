import { useState } from 'react';
import { Tabs, Tab, Box, Container, AppBar, Toolbar, Typography } from '@mui/material';
import Dashboard from './components/Dashboard'; 
import ShopsManager from './components/ShopsManager';
import UsersManager from './components/UsersManager'; 

function App() {
  const [tabValue, setTabValue] = useState(0);

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static" color="default">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>Car Stats Admin</Typography>
        </Toolbar>
        <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)} centered>
          <Tab label="DTC Dictionary" />
          <Tab label="Mechanic Shops" />
          {/* 2. ADD THE NEW TAB BUTTON */}
          <Tab label="User Management" /> 
        </Tabs>
      </AppBar>

      <Container sx={{ mt: 4 }}>
        {tabValue === 0 && <Dashboard />}
        {tabValue === 1 && <ShopsManager />}
        {/* 3. TELL IT WHAT TO RENDER WHEN TAB 2 IS CLICKED */}
        {tabValue === 2 && <UsersManager />} 
      </Container>
    </Box>
  );
}

export default App;