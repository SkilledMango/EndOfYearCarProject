import axios from 'axios';

/**
 * הלקוח של השרת: כתובת בסיס אחת, טוקן אחד וכל הטיפוסים המשותפים.
 *
 * לפיתוח מול מחשב מקומי יש להחליף זמנית את HOST:
 *   אמולטור אנדרואיד:  http://10.0.2.2:5279
 *   סימולטור iOS / ווב: http://localhost:5279
 *   מכשיר אמיתי:        http://<כתובת ה-LAN שלך>:5279
 */
// שרת הייצור, זה שמכשירים אמיתיים פונים אליו
const HOST = 'https://CarProject.somee.com';

export const API_BASE_URL = `${HOST}/api`;

export const api = axios.create({
  baseURL: API_BASE_URL,
  // Somee's free tier puts the site to sleep when nobody has used it, and the
  // first request after that has to wait for it to start again. Eight seconds
  // was not enough for that: the very first sign-in of the day failed with
  // "could not reach the server" while a second attempt straight after
  // answered in about a second. Everything here is a deliberate tap rather
  // than a background poll, so waiting longer on the rare cold one is better
  // than telling the driver the server is down when it is not.
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * מצרף או מנקה את טוקן הסשן בכל בקשה לשרת.
 * נקרא רק מ-AuthContext בתחילת סשן, בשחזורו ובסיומו.
 */
export const setAuthToken = (token: string | null) => {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
};

// ----- טיפוסים, מקבילים למודלים ב-C# בשרת -----

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

/** מה שמוחזר מהתחברות ומאימות קוד: טוקן והמשתמש שלו. */
export interface AuthSession {
  token: string;
  user: AppUser;
}

/** מוסך חי מ-Google Places, דרך הפרוקסי בשרת. */
export interface NearbyShop {
  placeId: string;
  name: string;
  address: string;
  rating: number;      // אפס = אין דירוג ב-Google, והתג מוסתר
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
  /** מה שהנהג אמור לעשות בפועל. */
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

// ----- הפונקציות שפונות לשרת -----

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

/**
 * מוחקת רכב מהמוסך של המשתמש המחובר.
 * השרת דוחה את הקריאה אם הרכב אינו שלו, ולכן ניחוש מזהה לא ימחק רכב של אחר.
 */
export const deleteVehicle = async (id: number): Promise<void> => {
  await api.delete(`/vehicles/${id}`);
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
  /** הגרסה המסודרת של Google לכתובת שהוקלדה. */
  formattedAddress: string;
}

/**
 * ממירה כתובת שהוקלדה לקואורדינטות.
 *
 * מחזירה null רק כשאין באמת התאמה, כי שגיאת הקלדה היא תוצאה רגילה.
 * כל שאר המקרים נזרקים כשגיאה — כולל המצב שבו נקודת הקצה עצמה חסרה בשרת,
 * שגם הוא מחזיר 404 ואסור לבלבל בינו לבין "כתובת לא נמצאה".
 */
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

/**
 * כל מילון קודי התקלה. קטן מספיק כדי למשוך אותו במלואו ולסנן במכשיר,
 * וכך אין צורך בנקודת קצה נפרדת לכל קוד.
 */
export const getDiagnosticCodes = async (): Promise<DiagnosticCode[]> => {
  const { data } = await api.get<DiagnosticCode[]>('/dtc');
  return data;
};

export interface FuelPriceEntry {
  fuelType: string;
  pricePerLitreILS: number;
  /** אמת רק עבור 95, סוג הדלק היחיד המפוקח בישראל. */
  isOfficial: boolean;
}

export interface FuelPrice {
  /** מחיר ה-95 המפוקח, לקוראים שלא מבדילים בין סוגי דלק. */
  pricePerLitreILS: number;
  /** התאריך שממנו המחיר המפוקח בתוקף. */
  effectiveFrom: string;
  fuelType: string;
  prices: FuelPriceEntry[];
}

/**
 * מחיר הבנזין הארצי הנוכחי.
 *
 * מגיע מהשרת ולא מקבוע בקוד, כי משרד האנרגיה מעדכן אותו בכל תחילת חודש
 * ומחיר שמהודר לתוך האפליקציה ניתן לתיקון רק בגרסה חדשה.
 *
 * לעולם לא זורקת שגיאה: הערכת נסיעה לפי מחיר מעט ישן עדיפה בהרבה על מסך
 * שנשבר בגלל שליפת מחיר. הקוראים נופלים לערך הגיבוי.
 */
export const getFuelPrice = async (): Promise<FuelPrice | null> => {
  try {
    const { data } = await api.get<FuelPrice>('/fuelprice');
    return data.pricePerLitreILS > 0 ? data : null;
  } catch {
    return null;
  }
};
