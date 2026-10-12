import { DtcScanResult, LiveData, ScannerStatus, VinResult } from './scanner';

// קודי הדגמה לרכב דלק: שניים מהמילון ואחד שלא, להסבר AI
const DEMO_CODES = ['P0300', 'P0420', 'P1450'];

// קודי הדגמה לרכב חשמלי: סוללה ומתח גבוה
const DEMO_EV_CODES = ['P0AA6', 'P0A80', 'P0A9C'];

const START = Date.now();

function wave(periodMs: number, offset = 0): number {
  const t = (Date.now() - START + offset) / periodMs;
  return (Math.sin(t * Math.PI * 2) + 1) / 2;
}

function between(lo: number, hi: number, w: number): number {
  return Math.round(lo + (hi - lo) * w);
}

export function demoStatus(): ScannerStatus {
  return {
    device: 'CarStats Demo Adapter',
    ssid: 'demo',
    ip: '0.0.0.0',
    uptimeSeconds: Math.floor((Date.now() - START) / 1000),
    simMode: true,
    connectedClients: 1,
  };
}

// איתור: מצב הדגמה - נתונים חיים מדומים
export function demoLiveData(electric = false): LiveData {
  const engine = wave(14_000);

  if (electric) {
    // מנוע חשמלי: סל"ד צמוד למהירות, וטמפרטורת סוללה במקום נוזל קירור
    const speed = between(0, 90, engine);
    return {
      rpm:            speed * 85,
      speedKmh:       speed,
      coolantCelsius: between(26, 34, wave(40_000, 3_000)),
      fuelPercent:    Math.max(8, 18 - Math.floor((Date.now() - START) / 120_000)),
      engineLoadPct:  between(5, 60, engine),
      valid:          true,
      ageMs:          0,
    };
  }

  return {
    rpm:            between(750, 3200, engine),
    speedKmh:       between(0, 90, engine),
    coolantCelsius: between(78, 94, wave(40_000, 3_000)),
    fuelPercent:    Math.max(8, 18 - Math.floor((Date.now() - START) / 120_000)),
    engineLoadPct:  between(12, 68, engine),
    valid:          true,
    ageMs:          0,
  };
}

// איתור: מצב הדגמה - קודי התקלה (בנזין או חשמלי)
export function demoDtcs(electric = false): DtcScanResult {
  return { codes: [...(electric ? DEMO_EV_CODES : DEMO_CODES)] };
}

export function demoVin(): VinResult {
  return { vin: null, simMode: true };
}
