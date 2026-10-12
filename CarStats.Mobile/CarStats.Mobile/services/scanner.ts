import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchWithTimeout } from './http';
import { demoDtcs, demoLiveData, demoStatus, demoVin } from './demoScanner';
import { candidateAddresses, firstHit } from '@/utils/scannerDiscovery';
import { getNearbyScanners } from './api';

const FETCH_TIMEOUT_MS = 3000;
const DTC_TIMEOUT_MS   = 8000;

// המתאם תופס את הכתובת 100. בהוטספוט של הטלפון

const ADDRESS_KEY = '@carstats_scanner_address';

export const DEFAULT_SCANNER_ADDRESS = '192.168.148.100';

let scannerAddress = DEFAULT_SCANNER_ADDRESS;

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

export interface LiveData {
  rpm: number;
  speedKmh: number;
  coolantCelsius: number;
  fuelPercent: number | null;
  // מה הרכב אמר: false = אין לו מפלס דלק, null = לא ידוע
  fuelSupported?: boolean | null;
  engineLoadPct: number;
  valid: boolean;
  ageMs: number;
}

export interface ScannerStatus {
  device: string;
  ssid: string;
  ip: string;
  uptimeSeconds: number;
  simMode: boolean;
  connectedClients: number;
  setupMode?: boolean;
}

export interface DtcScanResult {
  codes: string[];
}

export interface VinResult {
  vin: string | null;
  simMode: boolean;
}

let demoMode = false;
let demoElectric = false;

// איתור: הפעלת מצב הדגמה
export function setDemoMode(on: boolean): void {
  demoMode = on;
}

export function setDemoElectric(electric: boolean): void {
  demoElectric = electric;
}

export function isDemoMode(): boolean {
  return demoMode;
}

export async function getScannerStatus(): Promise<ScannerStatus> {
  if (demoMode) return demoStatus();
  const res = await fetchWithTimeout(`${await baseUrl()}/status`, FETCH_TIMEOUT_MS);
  if (!res.ok) throw new Error(`Scanner /status returned ${res.status}`);
  return res.json() as Promise<ScannerStatus>;
}

// איתור: קריאת נתונים חיים מהמתאם - סל"ד, מהירות, טמפרטורה
export async function getLiveData(): Promise<LiveData> {
  if (demoMode) return demoLiveData(demoElectric);
  const res = await fetchWithTimeout(`${await baseUrl()}/live-data`, FETCH_TIMEOUT_MS);
  if (!res.ok) throw new Error(`Scanner /live-data returned ${res.status}`);
  return res.json() as Promise<LiveData>;
}

// איתור: קריאת קודי תקלה מהמתאם (אפליקציה)
export async function scanDtcs(): Promise<DtcScanResult> {
  if (demoMode) return demoDtcs(demoElectric);
  // זמן ארוך יותר: המתאם אוסף תשובות מכל מחשבי הרכב
  const res = await fetchWithTimeout(`${await baseUrl()}/dtcs`, DTC_TIMEOUT_MS);
  if (!res.ok) throw new Error(`Scanner /dtcs returned ${res.status}`);
  return res.json() as Promise<DtcScanResult>;
}

// איתור: קריאת מספר שלדה (VIN) מהמתאם
export async function getVehicleVin(): Promise<VinResult> {
  if (demoMode) return demoVin();
  const res = await fetchWithTimeout(`${await baseUrl()}/vin`, FETCH_TIMEOUT_MS);
  if (!res.ok) throw new Error(`Scanner /vin returned ${res.status}`);
  return res.json() as Promise<VinResult>;
}

// איתור: בדיקה אם המתאם מחובר
export async function isScannerReachable(): Promise<boolean> {
  if (demoMode) return true;
  try {
    const status = await getScannerStatus();
    if (status.device) return true;
  } catch { /* הכתובת השמורה לא ענתה — אולי המתאם עבר רשת */ }
  return (await locateViaServer()) != null;
}

/** קצר בכוונה: נבדקות מאות כתובות, ורובן פשוט לא קיימות. */
const PROBE_TIMEOUT_MS = 1500;
const PROBE_BATCH      = 32;

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

async function isCarStatsScanner(address: string): Promise<boolean> {
  const status = await checkScannerAt(address);
  return !!status && !status.setupMode;
}

// איתור: איתור המתאם דרך השרת (אפליקציה)
async function locateViaServer(): Promise<string | null> {
  const reported = await getNearbyScanners();
  if (reported.length === 0) return null;
  const hit = await firstHit(reported, isCarStatsScanner);
  if (hit) await setScannerAddress(hit);
  return hit;
}

// איתור: חיפוש המתאם ברשת
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

export const SETUP_NETWORK_ADDRESS = '192.168.4.1';

// איתור: שליחת פרטי ההוטספוט למתאם
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
