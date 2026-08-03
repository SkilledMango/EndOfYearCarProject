import { useEffect, useState } from 'react';
import { getDiagnosticCodes, addDiagnosticCode, deleteDiagnosticCode } from '../Services/api';
import { 
    Table, TableBody, TableCell, TableContainer, TableHead, 
    TableRow, Paper, Button, Dialog, DialogTitle, DialogContent, 
    DialogActions, TextField, Typography, Alert
} from '@mui/material';

export default function Dashboard() {
    const [codes, setCodes] = useState([]);
    const [open, setOpen] = useState(false);
    const [newCode, setNewCode] = useState({ errorCode: '', humanTitle: '', severity: '', estimatedCostMin: 0, estimatedCostMax: 0 });

    const [loadError, setLoadError] = useState(null);

    // Without the catch a failed fetch rejects unhandled and the table just
    // shows nothing, which reads as "the dictionary is empty".
    const loadCodes = async () => {
        try {
            const data = await getDiagnosticCodes();
            setCodes(data);
            setLoadError(null);
        } catch (error) {
            console.error('Failed to load diagnostic codes', error);
            setLoadError('Could not load the fault-code dictionary. Check your connection and refresh.');
        }
    };

    useEffect(() => { loadCodes(); }, []);

    const handleSave = async () => {
        await addDiagnosticCode(newCode);
        setOpen(false);
        loadCodes(); 
    };

    const handleDelete = async (id, errorCode) => {
        if (window.confirm(`Are you sure you want to completely delete code ${errorCode}?`)) {
            await deleteDiagnosticCode(id);
            loadCodes();
        }
    };

    return (
        <div style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                <Typography variant="h5">Super Admin Dashboard</Typography>
                <Button variant="contained" color="primary" onClick={() => setOpen(true)}>
                    + Add New DTC
                </Button>
            </div>

            {loadError && (
                <Alert severity="error" sx={{ mb: 2 }}>{loadError}</Alert>
            )}

            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell><b>Error Code</b></TableCell>
                            <TableCell><b>Human Title</b></TableCell>
                            <TableCell><b>Severity</b></TableCell>
                            <TableCell><b>Est. Cost</b></TableCell>
                            <TableCell><b>Actions</b></TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {codes.map((code) => (
                            <TableRow key={code.id}>
                                <TableCell>{code.errorCode}</TableCell>
                                <TableCell>{code.humanTitle}</TableCell>
                                <TableCell>{code.severity}</TableCell>
                                <TableCell>${code.estimatedCostMin} - ${code.estimatedCostMax}</TableCell>
                                <TableCell>
                                    <Button variant="contained" color="error" size="small" onClick={() => handleDelete(code.id, code.errorCode)}>
                                        Delete
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            <Dialog open={open} onClose={() => setOpen(false)}>
                <DialogTitle>Add New Diagnostic Code</DialogTitle>
                <DialogContent style={{ display: 'flex', flexDirection: 'column', gap: '15px', paddingTop: '10px' }}>
                    <TextField label="Error Code (e.g., P0420)" onChange={(e) => setNewCode({...newCode, errorCode: e.target.value})} fullWidth />
                    <TextField label="Human Title" onChange={(e) => setNewCode({...newCode, humanTitle: e.target.value})} fullWidth />
                    <TextField label="Severity (Low, Medium, High)" onChange={(e) => setNewCode({...newCode, severity: e.target.value})} fullWidth />
                    <TextField label="Min Est. Cost" type="number" onChange={(e) => setNewCode({...newCode, estimatedCostMin: parseInt(e.target.value)})} fullWidth />
                    <TextField label="Max Est. Cost" type="number" onChange={(e) => setNewCode({...newCode, estimatedCostMax: parseInt(e.target.value)})} fullWidth />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpen(false)}>Cancel</Button>
                    <Button onClick={handleSave} variant="contained" color="primary">Save Code</Button>
                </DialogActions>
            </Dialog>
        </div>
    );
}