import { useEffect, useState } from 'react';
import { getDiagnosticCodes, addDiagnosticCode } from '../services/api';
import { 
    Table, TableBody, TableCell, TableContainer, 
    TableHead, TableRow, Paper, Typography, Chip, Button,
    Dialog, DialogTitle, DialogContent, DialogActions, TextField, 
    MenuItem, Select, InputLabel, FormControl
} from '@mui/material';

export default function Dashboard() {
    const [dtcList, setDtcList] = useState([]);
    const [open, setOpen] = useState(false); // Controls the popup form
    
    // Holds the data for the new DTC being typed in
    const [formData, setFormData] = useState({
        errorCode: '', humanTitle: '', description: '', severity: 1, actionRequired: '', estimatedCostMin: 0, estimatedCostMax: 0
    });

    // Fetches data from C#
    const loadData = async () => {
        const data = await getDiagnosticCodes();
        setDtcList(data);
    };

    useEffect(() => {
        loadData();
    }, []);

    // Handles typing in the form fields
    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    // Submits the new data to the C# backend
    const handleSubmit = async () => {
        await addDiagnosticCode(formData);
        setOpen(false); // Close the popup
        loadData();     // Refresh the table to show the new code
        // Reset the form
        setFormData({ errorCode: '', humanTitle: '', description: '', severity: 1, actionRequired: '', estimatedCostMin: 0, estimatedCostMax: 0 });
    };

    // Visual helper for severity
    const getSeverityChip = (level) => {
        switch(level) {
            case 1: return <Chip label="Green (Info)" color="success" />;
            case 2: return <Chip label="Yellow (Warning)" color="warning" />;
            case 3: return <Chip label="Red (Critical)" color="error" />;
            default: return <Chip label="Unknown" />;
        }
    };

    return (
        <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <Typography variant="h4">
                    Super Admin Dashboard
                </Typography>
                <Button variant="contained" color="primary" onClick={() => setOpen(true)}>
                    + Add New DTC
                </Button>
            </div>
            
            <TableContainer component={Paper} elevation={3}>
                <Table>
                    <TableHead style={{ backgroundColor: '#f5f5f5' }}>
                        <TableRow>
                            <TableCell><b>Error Code</b></TableCell>
                            <TableCell><b>Human Title</b></TableCell>
                            <TableCell><b>Severity</b></TableCell>
                            <TableCell><b>Est. Cost</b></TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {dtcList.map((dtc) => (
                            <TableRow key={dtc.id}>
                                <TableCell>{dtc.errorCode}</TableCell>
                                <TableCell>{dtc.humanTitle}</TableCell>
                                <TableCell>{getSeverityChip(dtc.severity)}</TableCell>
                                <TableCell>₪{dtc.estimatedCostMin} - ₪{dtc.estimatedCostMax}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* THE POPUP FORM FOR NEW CODES */}
            <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Add Human-Readable Diagnostic</DialogTitle>
                <DialogContent style={{ display: 'flex', flexDirection: 'column', gap: '15px', paddingTop: '10px' }}>
                    
                    <TextField label="Raw Error Code (e.g., P0300)" name="errorCode" value={formData.errorCode} onChange={handleChange} fullWidth />
                    <TextField label="Simple Human Title" name="humanTitle" value={formData.humanTitle} onChange={handleChange} fullWidth />
                    <TextField label="Detailed Explanation" name="description" value={formData.description} onChange={handleChange} multiline rows={3} fullWidth />
                    <TextField label="Action Required (Advice for Driver)" name="actionRequired" value={formData.actionRequired} onChange={handleChange} fullWidth />
                    
                    <FormControl fullWidth>
                        <InputLabel>Severity Level</InputLabel>
                        <Select name="severity" value={formData.severity} onChange={handleChange} label="Severity Level">
                            <MenuItem value={1}>Green (Info only)</MenuItem>
                            <MenuItem value={2}>Yellow (Check soon)</MenuItem>
                            <MenuItem value={3}>Red (Stop Safely / Immediate Action)</MenuItem>
                        </Select>
                    </FormControl>

                    <div style={{ display: 'flex', gap: '10px' }}>
                        <TextField label="Min Cost (₪)" name="estimatedCostMin" type="number" value={formData.estimatedCostMin} onChange={handleChange} fullWidth />
                        <TextField label="Max Cost (₪)" name="estimatedCostMax" type="number" value={formData.estimatedCostMax} onChange={handleChange} fullWidth />
                    </div>

                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpen(false)} color="inherit">Cancel</Button>
                    <Button onClick={handleSubmit} variant="contained" color="success">Save to Dictionary</Button>
                </DialogActions>
            </Dialog>
        </div>
    );
}