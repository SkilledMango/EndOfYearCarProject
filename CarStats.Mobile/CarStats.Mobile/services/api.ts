import axios from 'axios';

// איתור: כתובת השרת באפליקציה
// לפיתוח מקומי מחליפים זמנית את HOST (אמולטור: http://10.0.2.2:5279)
const HOST = 'https://CarProject.somee.com';

export const API_BASE_URL = `${HOST}/api`;

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
});

// איתור: צירוף הטוקן לכל בקשה לשרת
export const setAuthToken = (token: string | null) => {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
};

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
  /** ל-100 ק"מ: ליטרים ברכב דלק, קוט"ש ברכב חשמלי. */
  averageFuelConsumption: number;
  isElectric: boolean;
  /** מיכל בליטרים או סוללה בקוט"ש. 0 = עוד לא ידוע. */
  tankCapacity: number;
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

export interface AuthSession {
  token: string;
  user: AppUser;
}

export interface NearbyShop {
  placeId: string;
  name: string;
  address: string;
  rating: number;
  reviewCount: number;
  latitude: number;
  longitude: number;
  isBrandService?: boolean;
}

export type ShopKind = 'fuel' | 'electric';

export interface DiagnosticCode {
  id: number;
  errorCode: string;
  humanTitle: string;
  description: string;
  severity: SeverityLevel;
  actionRequired?: string;
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

export interface CarIdentity {
  make: string;
  model: string;
  year: number;
}

export interface VehicleEventEnriched {
  id: number;
  rawErrorCode: string;
  timestamp: string;
  isAcknowledged: boolean;
  translation: DtcTranslation | null;
  vehicle?: CarIdentity | null;
}

export interface ReportDtcResponse {
  status: string;
  translation?: DiagnosticCode;
  message?: string;
  severity?: SeverityLevel;
}

export const getUser = async (userId: number): Promise<AppUser> => {
  const { data } = await api.get<AppUser>(`/users/${userId}`);
  return data;
};

// איתור: שליחת קוד תקלה לשרת (אפליקציה)
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
  isElectric: boolean;
  tankCapacity: number;
  appUserId: number;
}

export const createVehicle = async (dto: CreateVehicleDto): Promise<Vehicle> => {
  const { data } = await api.post<Vehicle>('/vehicles', dto);
  return data;
};

export const deleteVehicle = async (id: number): Promise<void> => {
  await api.delete(`/vehicles/${id}`);
};

// איתור: בקשת מוסכים קרובים מהשרת (אפליקציה)
export const getNearbyShops = async (
  lat: number, lng: number,
  options: { kind?: ShopKind; make?: string; makeHe?: string } = {},
): Promise<NearbyShop[]> => {
  const { data } = await api.get<NearbyShop[]>('/navigation/nearby-shops', {
    params: { lat, lng, kind: options.kind, make: options.make, makeHe: options.makeHe },
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
  formattedAddress: string;
}

export const geocodeAddress = async (address: string): Promise<GeocodedAddress | null> => {
  try {
    const { data } = await api.get<GeocodedAddress>('/navigation/geocode', {
      params: { address },
    });
    return data;
  } catch (err: any) {
    // ה-404 שלנו מגיע עם שדה status; 404 של נתיב חסר לא.
    const body = err?.response?.data;
    if (err?.response?.status === 404 && body && typeof body.status === 'string') {
      return null;
    }
    throw err;
  }
};

export const getDiagnosticCodes = async (): Promise<DiagnosticCode[]> => {
  const { data } = await api.get<DiagnosticCode[]>('/dtc');
  return data;
};

export interface FuelPriceEntry {
  fuelType: string;
  pricePerLitreILS: number;
  isOfficial: boolean;
}

export interface FuelPrice {
  pricePerLitreILS: number;
  effectiveFrom: string;
  fuelType: string;
  prices: FuelPriceEntry[];
  electricityPerKwhILS?: number;
}

export const getFuelPrice = async (): Promise<FuelPrice | null> => {
  try {
    const { data } = await api.get<FuelPrice>('/fuelprice');
    return data.pricePerLitreILS > 0 ? data : null;
  } catch {
    return null;
  }
};

export const getNearbyScanners = async (): Promise<string[]> => {
  try {
    const { data } = await api.get<{ addresses: string[] }>('/scanner/nearby', { timeout: 8000 });
    return Array.isArray(data.addresses) ? data.addresses : [];
  } catch {
    return [];
  }
};

// שאלות AI עוברות דרך השרת (Groq ואז Gemini, עם מטמון)

export interface VehicleSpecs {
  isElectric: boolean | null;
  powertrain: string;
  tankCapacity: number | null;
  consumption: number | null;
  source: string;
  estimated?: boolean;
}

export const getVehicleSpecs = async (
  make: string, model: string, year: number, fuelTypeHint?: string,
): Promise<VehicleSpecs | null> => {
  try {
    const { data } = await api.post<VehicleSpecs>(
      '/ai/vehicle-specs',
      { make, model, year, fuelTypeHint: fuelTypeHint || undefined },
      // התשובה הראשונה לדגם חדש עוברת דרך מודל שפה ולוקחת כמה שניות
      { timeout: 30000 },
    );
    return data.source === 'none' ? null : data;
  } catch {
    return null;
  }
};

export interface AiFaultResponse {
  title: string;
  description: string;
  action: string;
  severity: string;
  source: string;
}

export const explainFaultCode = async (
  code: string,
  vehicle?: CarIdentity,
): Promise<AiFaultResponse> => {
  const { data } = await api.post<AiFaultResponse>(
    '/ai/explain-fault',
    { code, make: vehicle?.make, model: vehicle?.model, year: vehicle?.year },
    { timeout: 30000 },
  );
  return data;
};
