import axios from 'axios';

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

/** A live car-repair shop from Google Places (via the API's /navigation proxy). */
export interface NearbyShop {
  placeId: string;
  name: string;
  address: string;
  rating: number;      // 0 = not rated on Google (chip hidden)
  reviewCount: number;
  latitude: number;
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

export const getNearbyShops = async (lat: number, lng: number): Promise<NearbyShop[]> => {
  const { data } = await api.get<NearbyShop[]>('/navigation/nearby-shops', {
    params: { lat, lng },
  });
  return data;
};

export const getShopPhone = async (placeId: string): Promise<string | null> => {
  const { data } = await api.get<{ phone: string | null }>('/navigation/shop-phone', {
    params: { placeId },
  });
  return data.phone;
};

export interface GeocodedAddress {
  latitude:  number;
  longitude: number;
  /** Google's tidied-up version of what the user typed. */
  formattedAddress: string;
}

/**
 * Turns a typed address into coordinates.
 *
 * Returns null when the address cannot be found — a typo is a normal outcome,
 * not an error worth throwing over. Network and server failures still throw.
 */
export const geocodeAddress = async (address: string): Promise<GeocodedAddress | null> => {
  try {
    const { data } = await api.get<GeocodedAddress>('/navigation/geocode', {
      params: { address },
    });
    return data;
  } catch (err: any) {
    if (err?.response?.status === 404) return null;
    throw err;
  }
};
