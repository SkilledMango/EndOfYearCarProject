import axios from 'axios';
import { Platform } from 'react-native';

/**
 * NOTES FOR THE TEAM:
 *  - Production API is hosted on Somee (HTTPS works on the *.somee.com domain).
 *  - For local development against your own machine, temporarily switch HOST to:
 *      Android emulator:  http://10.0.2.2:5279   (10.0.2.2 reaches the host)
 *      iOS sim / web:     http://localhost:5279
 *      Real device:       http://<your-LAN-IP>:5279
 */
// Production Somee API — used on real devices
const HOST = 'https://CarProject.somee.com';

export const API_BASE_URL = `${HOST}/api`;

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 8000,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Attaches (or clears) the JWT session token on every API request.
 * Called by AuthContext when a session starts, restores, or ends —
 * nothing else should touch auth headers.
 */
export const setAuthToken = (token: string | null) => {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
};

// ----- Enums & Types (mirror the C# models) -----

export enum SeverityLevel {
  Green = 1,
  Yellow = 2,
  Red = 3,
}

export enum UserRole {
  User = 1,
  Admin = 2,
  SuperAdmin = 3,
}

export interface Vehicle {
  id: number;
  make: string;
  model: string;
  year: number;
  licensePlate: string;
  averageFuelConsumption: number;
  appUserId: number;
}

export interface AppUser {
  id: number;
  fullName: string;
  email: string;
  role: UserRole;
  totalFaultsLogged: number;
  isPremiumMember: boolean;
  vehicles: Vehicle[];
}

/** What /auth/login and /auth/verify-code return: a bearer token + its user. */
export interface AuthSession {
  token: string;
  user: AppUser;
}

export interface MechanicShop {
  id: number;
  name: string;
  address: string;
  phoneNumber: string;
  specialty: string;
  rating: number;      // 0 = not rated yet (chip hidden)
  reviewCount: number;
  latitude: number;    // 0,0 = unknown — geocoded from address on-device
  longitude: number;
}

export interface DiagnosticCode {
  id: number;
  errorCode: string;
  humanTitle: string;
  description: string;
  severity: SeverityLevel;
  estimatedCostMin: number;
  estimatedCostMax: number;
}

export interface DtcTranslation {
  humanTitle: string;
  description: string;
  severity: SeverityLevel;
  estimatedCostMin: number;
  estimatedCostMax: number;
}

export interface VehicleEventEnriched {
  id: number;
  rawErrorCode: string;
  timestamp: string;
  isAcknowledged: boolean;
  translation: DtcTranslation | null;
}

export interface ReportDtcResponse {
  status: string;
  translation?: DiagnosticCode;
  message?: string;
  severity?: SeverityLevel;
}

// ----- API Functions -----

export const getUser = async (userId: number): Promise<AppUser> => {
  const { data } = await api.get<AppUser>(`/users/${userId}`);
  return data;
};

export const reportDtc = async (
  rawCode: string,
  userId?: number,
  vehicleId?: number,
): Promise<ReportDtcResponse> => {
  const { data } = await api.post<ReportDtcResponse>('/mobile/report-dtc', { rawCode, userId, vehicleId });
  return data;
};

export const updateVehicle = async (id: number, vehicleData: Partial<Vehicle>): Promise<void> => {
  await api.put(`/vehicles/${id}`, { ...vehicleData, id });
};

export const getUserEvents = async (userId: number): Promise<VehicleEventEnriched[]> => {
  const { data } = await api.get<VehicleEventEnriched[]>(`/mobile/events/${userId}`);
  return data;
};

export interface CreateVehicleDto {
  make: string;
  model: string;
  year: number;
  licensePlate: string;
  averageFuelConsumption: number;
  appUserId: number;
}

export const createVehicle = async (dto: CreateVehicleDto): Promise<Vehicle> => {
  const { data } = await api.post<Vehicle>('/vehicles', dto);
  return data;
};

export const getShops = async (): Promise<MechanicShop[]> => {
  const { data } = await api.get<MechanicShop[]>('/shops');
  return data;
};
