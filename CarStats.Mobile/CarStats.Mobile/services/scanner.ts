/**
 * התקשורת מול מתאם ה-OBD-II מבוסס ESP32.
 *
 * נקודות הקצה של המתאם:
 *   GET  /status      → מצב החיבור
 *   GET  /live-data   → נתוני מנוע חיים
 *   GET  /dtcs        → מערך קודי התקלה
 *   POST /forget-wifi → שכחת נקודת הגישה ופתיחת רשת ההגדרה מחדש
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchWithTimeout } from './http';
import { demoDtcs, demoLiveData, demoStatus, demoVin } from './demoScanner';
import { candidateAddresses, firstHit } from '@/utils/scannerDiscovery';

/** כמה מילישניות לחכות לפני שבקשה נחשבת ככישלון */
const FETCH_TIMEOUT_MS = 3000;

// ─── כתובת המתאם ─────────────────────────────────────────────────────────────
//
// המתאם מתחבר לנקודת הגישה של הטלפון ותופס בה תמיד את הכתובת 100. של
// הרשת (או את האחרונה ברשת קטנה, כמו 172.20.10.14 באייפון). לכל טלפון
// רשת אחרת, ולכן הכתובת נשמרת כהגדרה ולא קבועה בקוד.

const ADDRESS_KEY = '@carstats_scanner_address';

/** הכתובת שהמתאם תופס על נקודת הגישה של הטלפון המקורי. */
export const DEFAULT_SCANNER_ADDRESS = '192.168.148.100';

let scannerAddress = DEFAULT_SCANNER_ADDRESS;

// נטענת פעם אחת בטעינת המודול; כל פנייה למתאם מחכה לה
const addressLoaded: Promise<void> = AsyncStorage.getItem(ADDRESS_KEY)
  .then(saved => { if (saved) scannerAddress = saved; })
  .catch(() => { /* אין כתובת שמורה — נשארים עם ברירת המחדל */ });

const baseUrl = async () => {
  await addressLoaded;
  return `http://${scannerAddress}`;
};

export async function getScannerAddress(): Promise<string> {
  await addressLoaded;
  return scannerAddress;
}

/** אמת לכתובת IP או לשם מארח, בלי פרוטוקול ובלי נתיב. */
export const isValidScannerAddress = (address: string): boolean =>
  /^[a-z0-9.\-]{3,63}$/i.test(address.trim());

export async function setScannerAddress(address: string): Promise<void> {
  scannerAddress = address.trim();
  try {
    await AsyncStorage.setItem(ADDRESS_KEY, scannerAddress);
  } catch { /* הכתובת תעבוד עד סגירת האפליקציה */ }
}

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
  const res = await fetchWithTimeout(`${await baseUrl()}/status`, FETCH_TIMEOUT_MS);
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
  const res = await fetchWithTimeout(`${await baseUrl()}/live-data`, FETCH_TIMEOUT_MS);
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
  const res = await fetchWithTimeout(`${await baseUrl()}/dtcs`, FETCH_TIMEOUT_MS);
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
  const res = await fetchWithTimeout(`${await baseUrl()}/vin`, FETCH_TIMEOUT_MS);
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

// ─── איתור המתאם על נקודת גישה חדשה ──────────────────────────────────────────

/** קצר בכוונה: נבדקות מאות כתובות, ורובן פשוט לא קיימות. */
const PROBE_TIMEOUT_MS = 1500;
const PROBE_BATCH      = 32;

/** אמת רק כשבכתובת עונה מתאם CarStats, ולא סתם מכשיר אחר ברשת. */
async function isCarStatsScanner(address: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`http://${address}/status`, PROBE_TIMEOUT_MS);
    if (!res.ok) return false;
    const status = await res.json();
    return status?.device === 'carstats-scanner';
  } catch {
    return false;
  }
}

/**
 * מחפשת את המתאם ושומרת את הכתובת שנמצאה. מחזירה אותה, או null.
 * onProgress מקבל כמה כתובות נבדקו מתוך כמה, בשביל פס התקדמות.
 */
export async function findScanner(
  onProgress?: (checked: number, total: number) => void,
): Promise<string | null> {
  const candidates = candidateAddresses(await getScannerAddress());

  for (let i = 0; i < candidates.length; i += PROBE_BATCH) {
    const batch = candidates.slice(i, i + PROBE_BATCH);
    const hit = await firstHit(batch, isCarStatsScanner);
    onProgress?.(Math.min(i + PROBE_BATCH, candidates.length), candidates.length);
    if (hit) {
      await setScannerAddress(hit);
      return hit;
    }
  }
  return null;
}

/**
 * גורמת למתאם לשכוח את נקודת הגישה ולפתוח שוב את רשת ההגדרה.
 * זורקת שגיאה עם הודעה קריאה אם המתאם לא נגיש או שהקושחה ישנה.
 */
export async function forgetScannerWifi(): Promise<void> {
  let res: Response;
  try {
    res = await fetchWithTimeout(`${await baseUrl()}/forget-wifi`, FETCH_TIMEOUT_MS, { method: 'POST' });
  } catch {
    throw new Error('The scanner is not reachable. Make sure it is powered and on this phone\'s hotspot.');
  }
  if (res.status === 404) {
    throw new Error('This scanner has older firmware. Flash the latest CarStats.ESP32 firmware first.');
  }
  if (!res.ok) throw new Error(`The scanner answered with an error (${res.status}).`);
}
