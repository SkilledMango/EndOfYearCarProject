import React from 'react';
import { 
  AppBar, 
  Toolbar, 
  Typography, 
  Container, 
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableRow, 
  Paper,
  Chip
} from '@mui/material';

const dtcData = [
  { code: 'P0101', name: 'Mass Air Flow Sensor Issue', severity: 'Yellow', cost: '$150' },
  { code: 'P0300', name: 'Random/Multiple Cylinder Misfire', severity: 'Red', cost: '$300' },
  { code: 'P0420', name: 'Catalytic Converter System', severity: 'Yellow', cost: '$800' },
  { code: 'P0455', name: 'Evaporative Emission Leak (Gas Cap)', severity: 'Green', cost: '$0' },
];

// Helper function to color-code the severity badges
const getSeverityColor = (severity) => {
  switch (severity) {
    case 'Red': return 'error';
    case 'Yellow': return 'warning';
    case 'Green': return 'success';
    default: return 'default';
  }
};

function App() {
  return (
    <div style={{ backgroundColor: '#f4f6f8', minHeight: '100vh', paddingBottom: '50px' }}>
      {/* Top Navigation Bar */}
      <AppBar position="static" style={{ backgroundColor: '#1976d2' }}>
        <Toolbar>
          <Typography variant="h6" component="div">
            Car Stats - Super Admin
          </Typography>
        </Toolbar>
      </AppBar>

      {/* Main Content Area */}
      <Container style={{ marginTop: '40px' }}>
        <Typography variant="h4" gutterBottom>
          DTC Master List
        </Typography>
        <Typography variant="subtitle1" color="textSecondary" gutterBottom>
          Manage "Human-Readable" fault code explanations and repair costs.
        </Typography>

        {/* Data Table */}
        <TableContainer component={Paper} style={{ marginTop: '20px', boxShadow: '0px 4px 10px rgba(0,0,0,0.1)' }}>
          <Table>
            <TableHead style={{ backgroundColor: '#f5f5f5' }}>
              <TableRow>
                <TableCell><strong>Technical Code</strong></TableCell>
                <TableCell><strong>Human-Friendly Name</strong></TableCell>
                <TableCell><strong>Severity</strong></TableCell>
                <TableCell><strong>Est. Cost</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {dtcData.map((row) => (
                <TableRow key={row.code}>
                  <TableCell>{row.code}</TableCell>
                  <TableCell>{row.name}</TableCell>
                  <TableCell>
                    <Chip 
                      label={row.severity} 
                      color={getSeverityColor(row.severity)} 
                      size="small" 
                    />
                  </TableCell>
                  <TableCell>{row.cost}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Container>
    </div>
  );
}

export default App;