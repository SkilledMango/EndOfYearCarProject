import axios from 'axios';

// Ensure this port matches your running C# API!
const API_URL = 'https://localhost:7077/api/dtc'; 

export const getDiagnosticCodes = async () => {
    try {
        const response = await axios.get(API_URL);
        return response.data;
    } catch (error) {
        console.error("Error fetching DTCs:", error);
        return [];
    }
};

// NEW: Function to send a new DTC to the C# backend
export const addDiagnosticCode = async (dtcData) => {
    try {
        const response = await axios.post(API_URL, dtcData);
        return response.data;
    } catch (error) {
        console.error("Error adding new DTC:", error);
        throw error;
    }
};