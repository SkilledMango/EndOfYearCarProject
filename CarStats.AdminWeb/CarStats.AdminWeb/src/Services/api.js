import axios from 'axios';

const BASE_URL = 'https://CarProject.somee.com/api';
const DTC_URL = `${BASE_URL}/dtc`;
const SHOPS_URL = `${BASE_URL}/shops`;
const USERS_URL = `${BASE_URL}/users`;
const VEHICLES_URL = `${BASE_URL}/vehicles`;

// --- AUTH (admin panel login) ---

// Role values mirror the C# UserRole enum
export const ROLE_ADMIN = 2;
export const ROLE_SUPERADMIN = 3;

/**
 * Logs in against the shared /auth/login endpoint.
 * Throws an Error with a user-readable message on failure.
 * Only Admin / SuperAdmin accounts are allowed into the panel.
 */
export const login = async (email, password) => {
    let response;
    try {
        response = await axios.post(`${BASE_URL}/auth/login`, { email, password });
    } catch (error) {
        const status = error?.response?.status;
        if (status === 401) throw new Error('Incorrect email or password.');
        if (status === 403) throw new Error('This account has not verified its email yet.');
        throw new Error('Could not reach the server. Please try again.');
    }
    const user = response.data;
    if (user.role !== ROLE_ADMIN && user.role !== ROLE_SUPERADMIN) {
        throw new Error('This account does not have admin access.');
    }
    return user;
};

// --- ANALYTICS STATS ---

export const getStats = async () => {
    try {
        const response = await axios.get(`${BASE_URL}/stats`);
        return response.data;
    } catch (error) {
        console.error("Error fetching stats:", error);
        return null;
    }
};

// --- DIAGNOSTIC CODES (DTC) SERVICES ---

export const getDiagnosticCodes = async () => {
    try {
        const response = await axios.get(DTC_URL);
        return response.data;
    } catch (error) {
        console.error("Error fetching DTCs:", error);
        return [];
    }
};

export const addDiagnosticCode = async (dtcData) => {
    try {
        const response = await axios.post(DTC_URL, dtcData);
        return response.data;
    } catch (error) {
        console.error("Error adding new DTC:", error);
        throw error;
    }
};

// --- MECHANIC SHOPS SERVICES ---

export const getShops = async () => {
    try {
        const response = await axios.get(SHOPS_URL);
        return response.data;
    } catch (error) {
        console.error("Error fetching shops:", error);
        return [];
    }
};

export const addShop = async (shopData) => {
    try {
        const response = await axios.post(SHOPS_URL, shopData);
        return response.data;
    } catch (error) {
        console.error("Error adding new shop:", error);
        throw error;
    }
};

// --- USER MANAGEMENT SERVICES ---

export const getUsers = async () => {
    try {
        const response = await axios.get(USERS_URL);
        return response.data;
    } catch (error) {
        console.error("Error fetching users:", error);
        return [];
    }
};

export const updateUser = async (id, userData) => {
    try {
        const response = await axios.put(`${USERS_URL}/${id}`, userData);
        return response.data;
    } catch (error) {
        console.error(`Error updating user ${id}:`, error);
        throw error;
    }
};

export const addUser = async (userData) => {
    try {
        const response = await axios.post(USERS_URL, userData);
        return response.data;
    } catch (error) {
        console.error("Error creating user:", error);
        throw error;
    }
};
// --- DELETE SERVICES ---

export const deleteDiagnosticCode = async (id) => {
    try {
        await axios.delete(`${DTC_URL}/${id}`);
    } catch (error) {
        console.error(`Error deleting DTC ${id}:`, error);
        throw error;
    }
};

export const deleteShop = async (id) => {
    try {
        await axios.delete(`${SHOPS_URL}/${id}`);
    } catch (error) {
        console.error(`Error deleting shop ${id}:`, error);
        throw error;
    }
};

export const deleteUser = async (id) => {
    try {
        await axios.delete(`${USERS_URL}/${id}`);
    } catch (error) {
        console.error(`Error deleting user ${id}:`, error);
        throw error;
    }
};

// --- VEHICLE SERVICES ---

export const getVehiclesForUser = async (userId) => {
    try {
        const response = await axios.get(`${VEHICLES_URL}/user/${userId}`);
        return response.data;
    } catch (error) {
        console.error(`Error fetching vehicles for user ${userId}:`, error);
        return [];
    }
};

export const addVehicle = async (vehicleData) => {
    try {
        const response = await axios.post(VEHICLES_URL, vehicleData);
        return response.data;
    } catch (error) {
        console.error("Error adding vehicle:", error);
        throw error;
    }
};

export const updateVehicle = async (id, vehicleData) => {
    try {
        const response = await axios.put(`${VEHICLES_URL}/${id}`, vehicleData);
        return response.data;
    } catch (error) {
        console.error(`Error updating vehicle ${id}:`, error);
        throw error;
    }
};

export const deleteVehicle = async (id) => {
    try {
        await axios.delete(`${VEHICLES_URL}/${id}`);
    } catch (error) {
        console.error(`Error deleting vehicle ${id}:`, error);
        throw error;
    }
};