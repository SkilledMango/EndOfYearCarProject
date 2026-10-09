/**
 * התקשורת מול מתאם ה-OBD-II מבוסס ESP32.
 *
 * נקודות הקצה של המתאם:
 *   GET  /status      → מצב החיבור (עונה גם במצב הגדרה, עם setupMode)
 *   GET  /live-data   → נתוני מנוע חיים
 *   GET  /dtcs        → מערך קודי התקלה
 *   POST /hotspot     → שם וסיסמה של נקודת גישה חדשה; המתאם עובר אליה
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchWithTimeout } from './http';
import { demoDtcs, demoLiveData, demoStatus, demoVin } from './demoScanner';
import { candidateAddresses, firstHit } from '@/utils/scannerDiscovery';
import { getNearbyScanners } from './api';

/** כמה מילישניות לחכות לפני שבקשה נחשבת ככישלון */
const FETCH_TIMEOUT_MS = 3000;

// ─── כתובת המתאם ─────────────────────────────────────────────────────────────
//
// המתאם מתחבר לנקודת הגישה של הטלפון ותופס בה את הכתובת 100. של הרשת.
// הרשת עצמה משתנה בין טלפונים — ובאנדרואיד חדש גם בין הפעלות — ולכן
// הכתובת לא מוצגת לנהג בכלל: המתאם מדווח לשרת איפה הוא, והאפליקציה
// שואלת את השרת כשהכתובת השמורה מפסיקה לענות (ראו isScannerReachable).

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
  /** אמת כשהמתאם פתח את רשת ההגדרה וממתין לנקודת גישה */
  setupMode?: boolean;
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
    if (status.device) return true;
  } catch { /* הכתובת השמורה לא ענתה — אולי המתאם עבר רשת */ }
  return (await locateViaServer()) != null;
}

// ─── איתור המתאם על נקודת גישה חדשה ──────────────────────────────────────────

/** קצר בכוונה: נבדקות מאות כתובות, ורובן פשוט לא קיימות. */
const PROBE_TIMEOUT_MS = 1500;
const PROBE_BATCH      = 32;

/**
 * מצב המתאם בכתובת הזו, או null אם עונה שם משהו אחר או כלום.
 * לעולם לא זורקת שגיאה.
 */
export async function checkScannerAt(address: string): Promise<ScannerStatus | null> {
  try {
    const res = await fetchWithTimeout(`http://${address}/status`, PROBE_TIMEOUT_MS);
    if (!res.ok) return null;
    const status = await res.json();
    return status?.device === 'carstats-scanner' ? (status as ScannerStatus) : null;
  } catch {
    return null;
  }
}

/** אמת רק כשבכתובת עונה מתאם CarStats רגיל, ולא סתם מכשיר אחר ברשת. */
async function isCarStatsScanner(address: string): Promise<boolean> {
  const status = await checkScannerAt(address);
  return !!status && !status.setupMode;
}

/**
 * שואלת את השרת איפה המתאם דיווח שהוא נמצא, בודקת שהוא באמת עונה שם,
 * ושומרת את הכתובת. null כשאין דיווח או שאף כתובת לא ענתה.
 */
async function locateViaServer(): Promise<string | null> {
  const reported = await getNearbyScanners();
  if (reported.length === 0) return null;
  const hit = await firstHit(reported, isCarStatsScanner);
  if (hit) await setScannerAddress(hit);
  return hit;
}

/**
 * מחפשת את המתאם ושומרת את הכתובת שנמצאה. מחזירה אותה, או null.
 * onProgress מקבל כמה כתובות נבדקו מתוך כמה, בשביל פס התקדמות.
 */
export async function findScanner(
  onProgress?: (checked: number, total: number) => void,
): Promise<string | null> {
  // הדרך המהירה: הכתובת שהמתאם עצמו דיווח עליה לשרת
  const reported = await locateViaServer();
  if (reported) {
    onProgress?.(1, 1);
    return reported;
  }

  // אין אינטרנט, או מתאם עם קושחה ישנה — סריקה של הכתובות האפשריות
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

// ─── העברת המתאם לנקודת גישה חדשה ────────────────────────────────────────────

/**
 * הכתובת של המתאם ברשת ההגדרה שלו, "CarStats-Setup".
 * זו כתובת ברירת המחדל של ESP32 כנקודת גישה, והיא אותה כתובת בכל מתאם.
 */
export const SETUP_NETWORK_ADDRESS = '192.168.4.1';

/**
 * שולחת למתאם שם וסיסמה של נקודת גישה. המתאם שומר אותם, מאתחל את עצמו
 * ומתחבר אליה. לא צריך אינטרנט: זו הודעה ישירה מהטלפון למתאם.
 * זורקת שגיאה עם הודעה קריאה כשמשהו נכשל.
 */
export async function sendHotspotToScanner(address: string, ssid: string, pass: string): Promise<void> {
  let res: Response;
  try {
    res = await fetchWithTimeout(`http://${address}/hotspot`, FETCH_TIMEOUT_MS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ssid, pass }),
    });
  } catch {
    throw new Error('The scanner stopped answering. Make sure you are still on its WiFi and try again.');
  }
  if (res.status === 404) {
    throw new Error('This scanner has older firmware. Flash the latest CarStats.ESP32 firmware first.');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `The scanner answered with an error (${res.status}).`);
  }
}
