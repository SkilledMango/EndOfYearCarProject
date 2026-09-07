/**
 * מצב הדגמה — מחליף את מתאם ה-ESP32.
 *
 * המתאם יושב על נקודת הגישה של הטלפון בכתובת קבועה, ולכן כל מי שלא נמצא
 * באותה רשת — אמולטור, מחשב, טלפון רחוק מהרכב — לא מגיע אליו ומסך האבחון
 * נשאר ריק. כאן מיוצרים נתונים סבירים, כך שאפשר להציג את השעונים, את
 * זרימת הסריקה, את דירוגי החומרה ואת הערכות המחיר גם בלי חומרה.
 *
 * מופעל תמיד ביוזמת המשתמש ומסומן על המסך כהדגמה — עזר להצגה,
 * ולא נפילה שקטה שאפשר לבלבל בינה לבין רכב אמיתי.
 */

import { DtcScanResult, LiveData, ScannerStatus, VinResult } from './scanner';

/**
 * שני קודים מהמילון ואחד שבמכוון אינו בו.
 *
 * P0300 (אדום) ו-P0420 (ירוק) מציגים רשומות אמיתיות עם הסבר ומחיר בשקלים,
 * וביניהם מדגימים את צביעת החומרה. P1450 הוא קוד ייחודי ליצרן ולכן נופל
 * להסבר ה-AI. סריקה אחת מדגימה כך את שני המסלולים.
 */
const DEMO_CODES = ['P0300', 'P0420', 'P1450'];

const START = Date.now();

/** תנודה חלקה בין 0 ל-1, כדי שהשעונים יזוזו כמו מנוע שעובד. */
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
    // מסומן כמדומה מאותה סיבה שהקושחה מסמנת: אסור שמישהו יירשם
    // את הנתונים האלה כקריאות מרכב אמיתי.
    simMode: true,
    connectedClients: 1,
  };
}

export function demoLiveData(): LiveData {
  // טווח מסרק ועד נסיעה, במחזור איטי, כשהמהירות והסל"ד מתואמים
  // כדי שהמספרים ייראו כמו מנוע אחד ולא כארבעה שעונים אקראיים.
  const engine = wave(14_000);

  return {
    rpm:            between(750, 3200, engine),
    speedKmh:       between(0, 90, engine),
    coolantCelsius: between(78, 94, wave(40_000, 3_000)),
    // יורד לאט ונשאר נמוך מספיק כדי להדגים את התראת התדלוק
    fuelPercent:    Math.max(8, 18 - Math.floor((Date.now() - START) / 120_000)),
    engineLoadPct:  between(12, 68, engine),
    valid:          true,
    ageMs:          0,
  };
}

export function demoDtcs(): DtcScanResult {
  return { codes: [...DEMO_CODES] };
}

export function demoVin(): VinResult {
  // אין מספר שלדה: זיהוי שלדה היה מציע "הוסף את הרכב הזה למוסך",
  // הצעה מבלבלת עבור רכב שלא קיים.
  return { vin: null, simMode: true };
}
