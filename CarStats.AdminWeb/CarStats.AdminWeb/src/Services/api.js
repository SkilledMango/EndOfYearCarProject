import axios from 'axios';

const BASE_URL = 'https://CarProject.somee.com/api';
const DTC_URL = `${BASE_URL}/dtc`;
const USERS_URL = `${BASE_URL}/users`;
const VEHICLES_URL = `${BASE_URL}/vehicles`;

// --- AUTH (admin panel login + JWT session token) ---

const TOKEN_KEY = 'carstats_admin_token';

// All panel requests go through this instance, which attaches the JWT the
// API handed out at login. Without it every endpoint returns 401.
const http = axios.create({ baseURL: BASE_URL });
http.interceptors.request.use((config) => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

// Role values mirror the C# UserRole enum
export const ROLE_ADMIN = 2;
export const ROLE_SUPERADMIN = 3;

/**
 * Logs in against the shared /auth/login endpoint and stores the session
 * token for all subsequent panel requests.
 * Throws an Error with a user-readable message on failure.
 * Only Admin / SuperAdmin accounts are allowed into the panel.
 */
export const login = async (email, password) => {
    let response;
    try {
        // Plain axios - no stale token should ride along on a login attempt
        response = await axios.post(`${BASE_URL}/auth/login`, { email, password });
    } catch (error) {
        // Keep the original axios error as `cause` — without it the real
        // status, URL and network detail are lost, and a failed login looks
        // identical in the console whether the server said 401 or was simply
        // unreachable.
        const status = error?.response?.status;
        if (status === 401) throw new Error('Incorrect email or password.', { cause: error });
        if (status === 403) throw new Error('This account has not verified its email yet.', { cause: error });
        throw new Error('Could not reach the server. Please try again.', { cause: error });
    }
    const { token, user } = response.data;
    if (user.role !== ROLE_ADMIN && user.role !== ROLE_SUPERADMIN) {
        throw new Error('This account does not have admin access.');
    }
    localStorage.setItem(TOKEN_KEY, token);
    return user;
};

/** Clears the stored session token (App calls this on logout). */
export const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
};

/** True if a session token exists - used to restore the session on refresh. */
export const hasToken = () => Boolean(localStorage.getItem(TOKEN_KEY));

// --- ANALYTICS STATS ---

export const getStats = async () => {
    try {
        const response = await http.get(`${BASE_URL}/stats`);
        return response.data;
    } catch (error) {
        console.error("Error fetching stats:", error);
        return null;
    }
};

// --- DIAGNOSTIC CODES (DTC) SERVICES ---

export const getDiagnosticCodes = async () => {
    try {
        const response = await http.get(DTC_URL);
        return response.data;
    } catch (error) {
        console.error("Error fetching DTCs:", error);
        return [];
    }
};

export const addDiagnosticCode = async (dtcData) => {
    try {
        const response = await http.post(DTC_URL, dtcData);
        return response.data;
    } catch (error) {
        console.error("Error adding new DTC:", error);
        throw error;
    }
};

// --- USER MANAGEMENT SERVICES ---

export const getUsers = async () => {
    try {
        const response = await http.get(USERS_URL);
        return response.data;
    } catch (error) {
        console.error("Error fetching users:", error);
        return [];
    }
};

export const updateUser = async (id, userData) => {
    try {
        const response = await http.put(`${USERS_URL}/${id}`, userData);
        return response.data;
    } catch (error) {
        console.error(`Error updating user ${id}:`, error);
        throw error;
    }
};

export const addUser = async (userData) => {
    try {
        const response = await http.post(USERS_URL, userData);
        return response.data;
    } catch (error) {
        console.error("Error creating user:", error);
        throw error;
    }
};
// --- DELETE SERVICES ---

export const deleteDiagnosticCode = async (id) => {
    try {
        await http.delete(`${DTC_URL}/${id}`);
    } catch (error) {
        console.error(`Error deleting DTC ${id}:`, error);
        throw error;
    }
};

export const deleteUser = async (id) => {
    try {
        await http.delete(`${USERS_URL}/${id}`);
    } catch (error) {
        console.error(`Error deleting user ${id}:`, error);
        throw error;
    }
};

// --- VEHICLE SERVICES ---

export const getVehiclesForUser = async (userId) => {
    try {
        const response = await http.get(`${VEHICLES_URL}/user/${userId}`);
        return response.data;
    } catch (error) {
        console.error(`Error fetching vehicles for user ${userId}:`, error);
        return [];
    }
};

export const addVehicle = async (vehicleData) => {
    try {
        const response = await http.post(VEHICLES_URL, vehicleData);
        return response.data;
    } catch (error) {
        console.error("Error adding vehicle:", error);
        throw error;
    }
};

export const updateVehicle = async (id, vehicleData) => {
    try {
        const response = await http.put(`${VEHICLES_URL}/${id}`, vehicleData);
        return response.data;
    } catch (error) {
        console.error(`Error updating vehicle ${id}:`, error);
        throw error;
    }
};

export const deleteVehicle = async (id) => {
    try {
        await http.delete(`${VEHICLES_URL}/${id}`);
    } catch (error) {
        console.error(`Error deleting vehicle ${id}:`, error);
        throw error;
    }
};