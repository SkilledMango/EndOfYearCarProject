import axios from 'axios';
import { Platform } from 'react-native';

/**
 * NOTES FOR THE TEAM:
 *  - Android emulator: 10.0.2.2 reaches the host machine (not localhost)
 *  - iOS simulator + web: plain localhost works
 *  - Real device: replace with your machine's LAN IP (e.g. http://192.168.1.42:5279/api)
 *  - Use HTTP in dev to avoid self-signed cert issues
 */
// Production Azure API — used on real devices
// Change back to localhost:5279 temporarily if doing local development
const HOST = 'https://carstats-api-fed6fqe5bkcreme6.israelcentral-01.azurewebsites.net';

export const API_BASE_URL = `${HOST}/api`;

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 8000,
  headers: { 'Content-Type': 'application/json' },
});

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

// TODO: Replace CURRENT_USER_ID with real auth session when login is implemented
export const CURRENT_USER_ID = 1;

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

export const getVehiclesForUser = async (userId: number): Promise<Vehicle[]> => {
  const { data } = await api.get<Vehicle[]>(`/vehicles/user/${userId}`);
  return data;
};
