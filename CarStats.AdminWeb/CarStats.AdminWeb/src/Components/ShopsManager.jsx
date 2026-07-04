import { useEffect, useState } from 'react';
import { getShops, addShop, deleteShop } from '../Services/api';
import { 
    Table, TableBody, TableCell, TableContainer, TableHead, 
    TableRow, Paper, Button, Dialog, DialogTitle, DialogContent, 
    DialogActions, TextField, Typography 
} from '@mui/material';

export default function ShopsManager() {
    const [shops, setShops] = useState([]);
    const [open, setOpen] = useState(false);
    const [newShop, setNewShop] = useState({ name: '', address: '', phoneNumber: '', specialty: '', rating: 0, reviewCount: 0 });

    const loadShops = async () => {
        const data = await getShops();
        setShops(data);
    };

    useEffect(() => { loadShops(); }, []);

    const handleSave = async () => {
        await addShop(newShop);
        setOpen(false);
        loadShops(); 
    };

    const handleDelete = async (id, name) => {
        if (window.confirm(`Are you sure you want to completely delete ${name}?`)) {
            await deleteShop(id);
            loadShops();
        }
    };

    return (
        <div style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                <Typography variant="h5">Mechanic Shops Directory</Typography>
                <Button variant="contained" color="primary" onClick={() => setOpen(true)}>
                    + Add New Shop
                </Button>
            </div>

            <TableContainer component={Paper}>
                <Table>
                    <TableHead style={{ backgroundColor: '#f5f5f5' }}>
                        <TableRow>
                            <TableCell><b>Shop Name</b></TableCell>
                            <TableCell><b>Address</b></TableCell>
                            <TableCell><b>Phone</b></TableCell>
                            <TableCell><b>Specialty</b></TableCell>
                            <TableCell><b>Rating</b></TableCell>
                            <TableCell><b>Actions</b></TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {shops.map((shop) => (
                            <TableRow key={shop.id}>
                                <TableCell>{shop.name}</TableCell>
                                <TableCell>{shop.address}</TableCell>
                                <TableCell>{shop.phoneNumber}</TableCell>
                                <TableCell>{shop.specialty}</TableCell>
                                <TableCell>
                                    {shop.rating > 0 ? `★ ${shop.rating} (${shop.reviewCount})` : '—'}
                                </TableCell>
                                <TableCell>
                                    <Button variant="contained" color="error" size="small" onClick={() => handleDelete(shop.id, shop.name)}>
                                        Delete
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            <Dialog open={open} onClose={() => setOpen(false)}>
                <DialogTitle>Add New Mechanic Shop</DialogTitle>
                <DialogContent style={{ display: 'flex', flexDirection: 'column', gap: '15px', paddingTop: '10px' }}>
                    <TextField label="Shop Name" onChange={(e) => setNewShop({...newShop, name: e.target.value})} fullWidth />
                    <TextField label="Address" onChange={(e) => setNewShop({...newShop, address: e.target.value})} fullWidth />
                    <TextField label="Phone Number" onChange={(e) => setNewShop({...newShop, phoneNumber: e.target.value})} fullWidth />
                    <TextField label="Specialty (e.g., Transmissions)" onChange={(e) => setNewShop({...newShop, specialty: e.target.value})} fullWidth />
                    <TextField label="Rating (0–5, e.g. 4.8)" type="number" inputProps={{ min: 0, max: 5, step: 0.1 }}
                        onChange={(e) => setNewShop({...newShop, rating: parseFloat(e.target.value) || 0})} fullWidth />
                    <TextField label="Number of reviews" type="number" inputProps={{ min: 0 }}
                        onChange={(e) => setNewShop({...newShop, reviewCount: parseInt(e.target.value, 10) || 0})} fullWidth />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpen(false)}>Cancel</Button>
                    <Button onClick={handleSave} variant="contained" color="primary">Save Shop</Button>
                </DialogActions>
            </Dialog>
        </div>
    );
}