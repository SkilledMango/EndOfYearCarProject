/**
 * התקשורת מול מתאם ה-OBD-II מבוסס ESP32.
 *
 * נקודות הקצה של המתאם:
 *   GET /status     → מצב החיבור
 *   GET /live-data  → נתוני מנוע חיים
 *   GET /dtcs       → מערך קודי התקלה
 */

import { fetchWithTimeout } from './http';
import { demoDtcs, demoLiveData, demoStatus, demoVin } from './demoScanner';

// כתובת קבועה שנקבעת בקושחה. המתאם מתחבר לנקודת הגישה של הטלפון,
// ולכן אין צורך להחליף רשתות ואין צורך בשום מנגנון גילוי.
const SCANNER_BASE_URL = 'http://192.168.148.100';

/** כמה מילישניות לחכות לפני שבקשה נחשבת ככישלון */
const FETCH_TIMEOUT_MS = 3000;

// ─── טיפוסים ─────────────────────────────────────────────────────────────────

export interface LiveData {
  rpm: number;
  speedKmh: number;
  coolantCelsius: number;
  /** null כשהרכב לא תומך ב-PID 0x2F ולא מדווח מפלס דלק */
  fuelPercent: number | null;
  engineLoadPct: number;
  /** אמת כשהמתאם מקבל הודעות CAN אמיתיות */
  valid: boolean;
  /** גיל הקריאה במילישניות */
  ageMs: number;
}

export interface ScannerStatus {
  device: string;
  ssid: string;
  ip: string;
  uptimeSeconds: number;
  /** אמת כשלא זוהה רכב אמיתי והנתונים מדומים */
  simMode: boolean;
  connectedClients: number;
}

export interface DtcScanResult {
  codes: string[];
}

export interface VinResult {
  /** מספר שלדה בן 17 תווים, או null אם אינו נתמך או שהרכב לא מחובר */
  vin: string | null;
  simMode: boolean;
}

// ─── מצב הדגמה ───────────────────────────────────────────────────────────────
//
// כשהוא דלוק, כל הפונקציות כאן מחזירות נתונים מדומים במקום לפנות למתאם.
// נשמר כמשתנה במודול ולא בהקשר של React, כי אלה פונקציות רגילות שנקראות
// מכמה מסכים, והעברת ספק דרך כולן בשביל בוליאני אחד הייתה גרועה יותר.

let demoMode = false;

/** מדליק או מכבה את מצב ההדגמה. */
export function setDemoMode(on: boolean): void {
  demoMode = on;
}

/** אמת כל עוד ההדגמה מחליפה את המתאם. */
export function isDemoMode(): boolean {
  return demoMode;
}

// ─── הפונקציות שפונות למתאם ──────────────────────────────────────────────────

/**
 * בדיקת חיים של המתאם.
 * זורקת שגיאה אם אי אפשר להגיע אליו.
 */
export async function getScannerStatus(): Promise<ScannerStatus> {
  if (demoMode) return demoStatus();
  const res = await fetchWithTimeout(`${SCANNER_BASE_URL}/status`, FETCH_TIMEOUT_MS);
  if (!res.ok) throw new Error(`Scanner /status returned ${res.status}`);
  return res.json() as Promise<ScannerStatus>;
}

/**
 * מחזירה את קריאות החיישנים האחרונות מהרכב.
 * המתאם מרענן אותן בערך פעם בשנייה בלולאה שלו.
 * זורקת שגיאה אם אי אפשר להגיע אליו.
 */
export async function getLiveData(): Promise<LiveData> {
  if (demoMode) return demoLiveData();
  const res = await fetchWithTimeout(`${SCANNER_BASE_URL}/live-data`, FETCH_TIMEOUT_MS);
  if (!res.ok) throw new Error(`Scanner /live-data returned ${res.status}`);
  return res.json() as Promise<LiveData>;
}

/**
 * מפעילה סריקת תקלות חדשה ומחזירה את הקודים הגולמיים.
 * לדוגמה: { codes: ["P0300", "P0420"] }
 * זורקת שגיאה אם אי אפשר להגיע למתאם.
 */
export async function scanDtcs(): Promise<DtcScanResult> {
  if (demoMode) return demoDtcs();
  const res = await fetchWithTimeout(`${SCANNER_BASE_URL}/dtcs`, FETCH_TIMEOUT_MS);
  if (!res.ok) throw new Error(`Scanner /dtcs returned ${res.status}`);
  return res.json() as Promise<DtcScanResult>;
}

/**
 * שולפת את מספר השלדה מהמתאם, פעם אחת לכל חיבור.
 * מחזירה null אם הרכב לא תומך בכך או במצב הדגמה.
 * לעולם לא זורקת שגיאה: זיהוי השלדה הוא בונוס ולא תנאי.
 */
export async function getVehicleVin(): Promise<VinResult> {
  if (demoMode) return demoVin();
  const res = await fetchWithTimeout(`${SCANNER_BASE_URL}/vin`, FETCH_TIMEOUT_MS);
  if (!res.ok) throw new Error(`Scanner /vin returned ${res.status}`);
  return res.json() as Promise<VinResult>;
}

/**
 * בדיקה מהירה אם המתאם נגיש. מחזירה אמת אם הוא ענה בזמן הקצוב.
 * לעולם לא זורקת שגיאה.
 */
export async function isScannerReachable(): Promise<boolean> {
  if (demoMode) return true;
  try {
    const status = await getScannerStatus();
    return !!status.device;
  } catch {
    return false;
  }
}
