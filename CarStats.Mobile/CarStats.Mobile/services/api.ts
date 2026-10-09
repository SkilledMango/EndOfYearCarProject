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
  /** ל-100 ק"מ: ליטרים ברכב דלק, קוט"ש ברכב חשמלי. */
  averageFuelConsumption: number;
  /** רכב חשמלי מחליף את ממשק הדלק בממשק סוללה וטעינה. */
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

/** יצרן, דגם ושנה — מספיק כדי שהסבר ה-AI יתאים לרכב עצמו. */
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
  /** הרכב שעליו נסרקה התקלה. null כשהרכב כבר נמחק מהמוסך. */
  vehicle?: CarIdentity | null;
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
  isElectric: boolean;
  tankCapacity: number;
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
  /** תעריף החשמל הביתי לקוט"ש, לרכב חשמלי. */
  electricityPerKwhILS?: number;
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

/**
 * הכתובות שמתאמים דיווחו עליהן מהרשת של הטלפון הזה.
 * המתאם מדווח לשרת איפה הוא בנקודת הגישה, והשרת מזהה את הטלפון לפי אותה
 * כתובת ציבורית — כך האפליקציה מוצאת את המתאם בלי שאף אחד יקליד כתובת.
 * לעולם לא זורקת שגיאה: בלי אינטרנט פשוט חוזרת רשימה ריקה.
 */
export const getNearbyScanners = async (): Promise<string[]> => {
  try {
    const { data } = await api.get<{ addresses: string[] }>('/scanner/nearby', { timeout: 8000 });
    return Array.isArray(data.addresses) ? data.addresses : [];
  } catch {
    return [];
  }
};

// ----- שאלות AI, דרך השרת -----
//
// השרת שואל קודם את Groq ואם המכסה שלו נגמרה — את Gemini, ושומר כל תשובה
// במטמון. המפתחות יושבים רק בשרת ולא בתוך האפליקציה.

/** מה ה-AI יודע על דגם מסוים. כל שדה יכול להיות null כשהמודל לא בטוח. */
export interface VehicleSpecs {
  isElectric: boolean | null;
  /** electric | plugin_hybrid | hybrid | diesel | petrol | unknown */
  powertrain: string;
  /** מיכל בליטרים, או סוללה בקוט"ש ברכב חשמלי. */
  tankCapacity: number | null;
  /** ליטר ל-100 ק"מ, או קוט"ש ל-100 ק"מ ברכב חשמלי. */
  consumption: number | null;
  /** איזה ספק ענה: groq, gemini-flash-lite, gemini-flash או none. */
  source: string;
}

/**
 * חשמלי או דלק, גודל מיכל/סוללה וצריכה, בבקשה אחת.
 * לעולם לא זורקת שגיאה: הזיהוי הוא עזר, והנהג תמיד יכול להקליד בעצמו.
 */
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

/** הסבר AI לקוד תקלה. זורקת שגיאה — הקורא מתרגם אותה לסיבה שאפשר להציג. */
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
