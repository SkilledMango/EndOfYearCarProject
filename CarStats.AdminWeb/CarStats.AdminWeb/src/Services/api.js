import axios from 'axios';

const BASE_URL = 'https://localhost:7077/api';
const DTC_URL = `${BASE_URL}/dtc`;
const SHOPS_URL = `${BASE_URL}/shops`;
const USERS_URL = `${BASE_URL}/users`;

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