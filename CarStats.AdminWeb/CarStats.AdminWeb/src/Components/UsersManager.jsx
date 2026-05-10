import { useEffect, useState } from 'react';
import { getUsers, updateUser, addUser, deleteUser } from '../services/api';
import { 
    Table, TableBody, TableCell, TableContainer, TableHead, 
    TableRow, Paper, Button, Dialog, DialogTitle, DialogContent, 
    DialogActions, TextField, Typography, Switch, FormControlLabel 
} from '@mui/material';

export default function UsersManager() {
    const [users, setUsers] = useState([]);
    const [open, setOpen] = useState(false);
    const [editUser, setEditUser] = useState(null);
    const [isCreating, setIsCreating] = useState(false);

    const loadUsers = async () => {
        const data = await getUsers();
        setUsers(data);
    };

    useEffect(() => { loadUsers(); }, []);

    // Opens popup to EDIT an existing user
    const handleEditClick = (user) => {
        setIsCreating(false);
        setEditUser(user);
        setOpen(true);
    };

    // Opens popup to CREATE a new user
    const handleAddClick = () => {
        setIsCreating(true);
        setEditUser({
            fullName: '', email: '', newPassword: '', vehicleModel: '', 
            licensePlate: '', averageFuelConsumption: 0, totalFaultsLogged: 0, isPremiumMember: false
        });
        setOpen(true);
    };

    const handleSave = async () => {
        if (isCreating) {
            await addUser(editUser); // Send to POST
        } else {
            await updateUser(editUser.id, editUser); // Send to PUT
        }
        setOpen(false);
        loadUsers(); 
    };

    const handleDelete = async (id, name) => {
        // Standard safety check so you don't misclick
        if (window.confirm(`Are you sure you want to completely delete ${name}? This cannot be undone.`)) {
            await deleteUser(id);
            loadUsers(); // Instantly refresh the table
        }
    };

    return (
        <div style={{ marginTop: '20px' }}>
            {/* NEW TOP BAR WITH BUTTON */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                <Typography variant="h5">Watch & Edit User Stats</Typography>
                <Button variant="contained" color="primary" onClick={handleAddClick}>
                    + Add User
                </Button>
            </div>

            <TableContainer component={Paper}>
                <Table>
                    <TableHead style={{ backgroundColor: '#f5f5f5' }}>
                        <TableRow>
                            <TableCell><b>Driver Name</b></TableCell>
                            <TableCell><b>Vehicle</b></TableCell>
                            <TableCell><b>Avg Fuel (L/100km)</b></TableCell>
                            <TableCell><b>Total Faults</b></TableCell>
                            <TableCell><b>Actions</b></TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {users.map((user) => (
                            <TableRow key={user.id}>
                                <TableCell>{user.fullName}<br/><small>{user.email}</small></TableCell>
                                <TableCell>{user.vehicleModel} ({user.licensePlate})</TableCell>
                                <TableCell>{user.averageFuelConsumption}</TableCell>
                                <TableCell>{user.totalFaultsLogged}</TableCell>
                                <TableCell style={{ display: 'flex', gap: '10px' }}>
                                    <Button variant="outlined" size="small" onClick={() => handleEditClick(user)}>
                                        Edit
                                    </Button>
                                    <Button variant="contained" color="error" size="small" onClick={() => handleDelete(user.id, user.fullName)}>
                                        Delete
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* SHARED EDIT / CREATE DIALOG */}
            <Dialog open={open} onClose={() => setOpen(false)}>
                <DialogTitle>{isCreating ? "Create New User" : "Edit User Stats"}</DialogTitle>
                {editUser && (
                    <DialogContent style={{ display: 'flex', flexDirection: 'column', gap: '15px', paddingTop: '10px' }}>
                        <TextField label="Full Name" value={editUser.fullName} onChange={(e) => setEditUser({...editUser, fullName: e.target.value})} fullWidth />
                        <TextField label="Email Address" type="email" value={editUser.email || ''} onChange={(e) => setEditUser({...editUser, email: e.target.value})} fullWidth />
                        
                        <TextField 
                            label={isCreating ? "Set Password" : "Set New Password (Leave blank to keep current)"} 
                            type="password" 
                            onChange={(e) => setEditUser({...editUser, newPassword: e.target.value})} 
                            fullWidth 
                            color={isCreating ? "primary" : "warning"}
                        />

                        <TextField label="Vehicle Model" value={editUser.vehicleModel} onChange={(e) => setEditUser({...editUser, vehicleModel: e.target.value})} fullWidth />
                        <TextField label="License Plate" value={editUser.licensePlate} onChange={(e) => setEditUser({...editUser, licensePlate: e.target.value})} fullWidth />
                        <TextField label="Avg Fuel Consumption" type="number" value={editUser.averageFuelConsumption} onChange={(e) => setEditUser({...editUser, averageFuelConsumption: parseFloat(e.target.value)})} fullWidth />
                        <TextField label="Total Faults Logged" type="number" value={editUser.totalFaultsLogged} onChange={(e) => setEditUser({...editUser, totalFaultsLogged: parseInt(e.target.value)})} fullWidth />
                        <FormControlLabel control={<Switch checked={editUser.isPremiumMember} onChange={(e) => setEditUser({...editUser, isPremiumMember: e.target.checked})} />} label="Premium Member" />
                    </DialogContent>
                )}
                <DialogActions>
                    <Button onClick={() => setOpen(false)}>Cancel</Button>
                    <Button onClick={handleSave} variant="contained" color="primary">Save User</Button>
                </DialogActions>
            </Dialog>
        </div>
    );
}