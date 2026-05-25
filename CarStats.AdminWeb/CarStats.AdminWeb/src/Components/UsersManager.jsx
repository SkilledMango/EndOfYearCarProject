import { useEffect, useState } from 'react';
import {
    getUsers, updateUser, addUser, deleteUser,
    getVehiclesForUser, addVehicle, updateVehicle, deleteVehicle
} from '../Services/api';
import {
    Table, TableBody, TableCell, TableContainer, TableHead,
    TableRow, Paper, Button, Dialog, DialogTitle, DialogContent,
    DialogActions, TextField, Typography, Switch, FormControlLabel,
    Select, MenuItem, FormControl, InputLabel, Chip, IconButton, Divider
} from '@mui/material';

const ROLE_LABELS = { 1: 'User', 2: 'Admin', 3: 'SuperAdmin' };
const ROLE_COLORS = { 1: 'default', 2: 'primary', 3: 'error' };

const emptyVehicle = (userId) => ({
    make: '', model: '', year: new Date().getFullYear(),
    licensePlate: '', averageFuelConsumption: 0, appUserId: userId
});

export default function UsersManager() {
    const [users, setUsers] = useState([]);

    // --- User dialog state ---
    const [userOpen, setUserOpen] = useState(false);
    const [editUser, setEditUser] = useState(null);
    const [isCreating, setIsCreating] = useState(false);

    // --- Vehicle dialog state ---
    const [vehicleOpen, setVehicleOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [vehicles, setVehicles] = useState([]);
    const [editVehicle, setEditVehicle] = useState(null);
    const [isCreatingVehicle, setIsCreatingVehicle] = useState(false);

    const loadUsers = async () => {
        const data = await getUsers();
        setUsers(data);
    };

    useEffect(() => { loadUsers(); }, []);

    // ---- USER HANDLERS ----

    const handleAddClick = () => {
        setIsCreating(true);
        setEditUser({ fullName: '', email: '', newPassword: '', role: 1, totalFaultsLogged: 0, isPremiumMember: false });
        setUserOpen(true);
    };

    const handleEditClick = (user) => {
        setIsCreating(false);
        setEditUser({ ...user });
        setUserOpen(true);
    };

    const handleSaveUser = async () => {
        if (isCreating) {
            await addUser(editUser);
        } else {
            await updateUser(editUser.id, editUser);
        }
        setUserOpen(false);
        loadUsers();
    };

    const handleDeleteUser = async (id, name) => {
        if (window.confirm(`Delete ${name}? This will also remove all their vehicles and events.`)) {
            await deleteUser(id);
            loadUsers();
        }
    };

    // ---- VEHICLE HANDLERS ----

    const handleOpenVehicles = async (user) => {
        setSelectedUser(user);
        const data = await getVehiclesForUser(user.id);
        setVehicles(data);
        setEditVehicle(null);
        setIsCreatingVehicle(false);
        setVehicleOpen(true);
    };

    const handleAddVehicle = () => {
        setIsCreatingVehicle(true);
        setEditVehicle(emptyVehicle(selectedUser.id));
    };

    const handleEditVehicle = (v) => {
        setIsCreatingVehicle(false);
        setEditVehicle({ ...v });
    };

    const handleSaveVehicle = async () => {
        if (isCreatingVehicle) {
            await addVehicle(editVehicle);
        } else {
            await updateVehicle(editVehicle.id, editVehicle);
        }
        const updated = await getVehiclesForUser(selectedUser.id);
        setVehicles(updated);
        setEditVehicle(null);
        loadUsers(); // refresh vehicle count in the main table
    };

    const handleDeleteVehicle = async (id) => {
        if (window.confirm('Remove this vehicle? Its event history will be kept.')) {
            await deleteVehicle(id);
            const updated = await getVehiclesForUser(selectedUser.id);
            setVehicles(updated);
            loadUsers();
        }
    };

    return (
        <div style={{ marginTop: '20px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                <Typography variant="h5">User Management</Typography>
                <Button variant="contained" color="primary" onClick={handleAddClick}>
                    + Add User
                </Button>
            </div>

            {/* Users Table */}
            <TableContainer component={Paper}>
                <Table>
                    <TableHead style={{ backgroundColor: '#f5f5f5' }}>
                        <TableRow>
                            <TableCell><b>Driver</b></TableCell>
                            <TableCell><b>Role</b></TableCell>
                            <TableCell><b>Vehicles</b></TableCell>
                            <TableCell><b>Total Faults</b></TableCell>
                            <TableCell><b>Premium</b></TableCell>
                            <TableCell><b>Actions</b></TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {users.map((user) => (
                            <TableRow key={user.id}>
                                <TableCell>
                                    {user.fullName}<br />
                                    <small style={{ color: '#888' }}>{user.email}</small>
                                </TableCell>
                                <TableCell>
                                    <Chip
                                        label={ROLE_LABELS[user.role] ?? 'User'}
                                        color={ROLE_COLORS[user.role] ?? 'default'}
                                        size="small"
                                    />
                                </TableCell>
                                <TableCell>
                                    <Button size="small" variant="outlined" onClick={() => handleOpenVehicles(user)}>
                                        {(user.vehicles?.length ?? 0)} vehicle(s)
                                    </Button>
                                </TableCell>
                                <TableCell>{user.totalFaultsLogged}</TableCell>
                                <TableCell>{user.isPremiumMember ? '✓' : '—'}</TableCell>
                                <TableCell style={{ display: 'flex', gap: '8px' }}>
                                    <Button variant="outlined" size="small" onClick={() => handleEditClick(user)}>
                                        Edit
                                    </Button>
                                    <Button variant="contained" color="error" size="small" onClick={() => handleDeleteUser(user.id, user.fullName)}>
                                        Delete
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* ---- USER EDIT / CREATE DIALOG ---- */}
            <Dialog open={userOpen} onClose={() => setUserOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>{isCreating ? 'Create New User' : 'Edit User'}</DialogTitle>
                {editUser && (
                    <DialogContent style={{ display: 'flex', flexDirection: 'column', gap: '15px', paddingTop: '10px' }}>
                        <TextField label="Full Name" value={editUser.fullName} onChange={(e) => setEditUser({ ...editUser, fullName: e.target.value })} fullWidth />
                        <TextField label="Email Address" type="email" value={editUser.email || ''} onChange={(e) => setEditUser({ ...editUser, email: e.target.value })} fullWidth />
                        <TextField
                            label={isCreating ? 'Set Password' : 'New Password (leave blank to keep current)'}
                            type="password"
                            onChange={(e) => setEditUser({ ...editUser, newPassword: e.target.value })}
                            fullWidth
                            color={isCreating ? 'primary' : 'warning'}
                        />

                        <FormControl fullWidth>
                            <InputLabel>Role</InputLabel>
                            <Select
                                value={editUser.role ?? 1}
                                label="Role"
                                onChange={(e) => setEditUser({ ...editUser, role: e.target.value })}
                            >
                                <MenuItem value={1}>User — Standard driver</MenuItem>
                                <MenuItem value={2}>Admin — Manages DTC & Shops</MenuItem>
                                <MenuItem value={3}>SuperAdmin — Full access</MenuItem>
                            </Select>
                        </FormControl>

                        <TextField label="Total Faults Logged" type="number" value={editUser.totalFaultsLogged ?? 0} onChange={(e) => setEditUser({ ...editUser, totalFaultsLogged: parseInt(e.target.value) })} fullWidth />
                        <FormControlLabel control={<Switch checked={editUser.isPremiumMember ?? false} onChange={(e) => setEditUser({ ...editUser, isPremiumMember: e.target.checked })} />} label="Premium Member" />
                    </DialogContent>
                )}
                <DialogActions>
                    <Button onClick={() => setUserOpen(false)}>Cancel</Button>
                    <Button onClick={handleSaveUser} variant="contained">Save</Button>
                </DialogActions>
            </Dialog>

            {/* ---- VEHICLE MANAGEMENT DIALOG ---- */}
            <Dialog open={vehicleOpen} onClose={() => { setVehicleOpen(false); setEditVehicle(null); }} maxWidth="md" fullWidth>
                <DialogTitle>
                    Vehicles — {selectedUser?.fullName}
                </DialogTitle>
                <DialogContent>
                    {/* Vehicle list */}
                    {vehicles.length === 0 && !editVehicle && (
                        <Typography color="text.secondary" style={{ marginBottom: '12px' }}>
                            No vehicles registered yet.
                        </Typography>
                    )}
                    {vehicles.map((v) => (
                        <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px', padding: '10px', border: '1px solid #eee', borderRadius: '8px' }}>
                            <div style={{ flex: 1 }}>
                                <Typography fontWeight={600}>{v.year} {v.make} {v.model}</Typography>
                                <Typography variant="body2" color="text.secondary">
                                    {v.licensePlate}  ·  {v.averageFuelConsumption} L/100km
                                </Typography>
                            </div>
                            <Button size="small" variant="outlined" onClick={() => handleEditVehicle(v)}>Edit</Button>
                            <Button size="small" variant="contained" color="error" onClick={() => handleDeleteVehicle(v.id)}>Remove</Button>
                        </div>
                    ))}

                    {/* Add / Edit vehicle form */}
                    {editVehicle && (
                        <>
                            <Divider style={{ margin: '16px 0' }} />
                            <Typography variant="subtitle1" fontWeight={600} style={{ marginBottom: '12px' }}>
                                {isCreatingVehicle ? 'Add Vehicle' : 'Edit Vehicle'}
                            </Typography>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <TextField label="Make" value={editVehicle.make} onChange={(e) => setEditVehicle({ ...editVehicle, make: e.target.value })} fullWidth />
                                    <TextField label="Model" value={editVehicle.model} onChange={(e) => setEditVehicle({ ...editVehicle, model: e.target.value })} fullWidth />
                                    <TextField label="Year" type="number" value={editVehicle.year} onChange={(e) => setEditVehicle({ ...editVehicle, year: parseInt(e.target.value) })} style={{ width: '120px' }} />
                                </div>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <TextField label="License Plate" value={editVehicle.licensePlate} onChange={(e) => setEditVehicle({ ...editVehicle, licensePlate: e.target.value })} fullWidth />
                                    <TextField label="Avg Fuel (L/100km)" type="number" value={editVehicle.averageFuelConsumption} onChange={(e) => setEditVehicle({ ...editVehicle, averageFuelConsumption: parseFloat(e.target.value) })} fullWidth />
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <Button variant="contained" onClick={handleSaveVehicle}>Save Vehicle</Button>
                                    <Button onClick={() => setEditVehicle(null)}>Cancel</Button>
                                </div>
                            </div>
                        </>
                    )}
                </DialogContent>
                <DialogActions>
                    {!editVehicle && (
                        <Button onClick={handleAddVehicle} variant="outlined">+ Add Vehicle</Button>
                    )}
                    <Button onClick={() => { setVehicleOpen(false); setEditVehicle(null); }}>Close</Button>
                </DialogActions>
            </Dialog>
        </div>
    );
}
