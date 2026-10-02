/**
 * שרשרת איתור נתוני צריכת הדלק של רכב.
 *
 * הקובץ עובד מול שני מקורות, לפי הסדר: EPA האמריקאי ומאגר NRCan הקנדי.
 * אם שניהם לא מכירים את הדגם, חלון הוספת הרכב שואל את ה-AI דרך השרת
 * (getVehicleSpecs), ואם גם זה נכשל — יש הערכה לפי סוג הדלק בלבד.
 *
 * שני המקורות הראשונים חינמיים ואינם דורשים מפתח. נתוני EPA הם בגלונים
 * למייל ולכן מומרים לליטר ל-100 ק"מ.
 */

import { fetchWithTimeout } from './http';

const FE_BASE = 'https://www.fueleconomy.gov/ws/rest';

// ─── טיפוסים ─────────────────────────────────────────────────────────────────

export interface FEMenuItem {
  text: string;   // התווית שהמשתמש רואה
  value: string;  // הערך הפנימי; עבור גימור זהו מזהה הרכב
}

export interface FEVehicleDetails {
  id: number;
  make: string;
  model: string;
  year: number;
  trany: string;       // תיאור תיבת ההילוכים
  fuelType: string;
  /** צריכה משולבת עיר ובין-עירוני, במיילים לגלון */
  comb08: number;
  city08: number;
  hwy08: number;
  /** "EV" ברכב חשמלי מלא */
  atvType?: string;
  /** צריכת חשמל משולבת בקוט"ש ל-100 מייל, ברכבים חשמליים */
  combE?: number;
}

/**
 * מה רשומת EPA אומרת על חשמלי.
 *
 * ברכב חשמלי comb08 הוא MPGe — מספר שהמרה שלו לליטרים יוצאת חסרת משמעות
 * (טסלה הייתה מקבלת 1.8 ליטר ל-100). לכן קוראים את combE ומחשבים קוט"ש.
 */
export function epaElectricInfo(details: FEVehicleDetails): { isElectric: boolean; kwhPer100km: number | null } {
  const isElectric = details.atvType === 'EV' || details.fuelType === 'Electricity';
  if (!isElectric) return { isElectric: false, kwhPer100km: null };
  const kwh = details.combE && details.combE > 0
    ? Math.round((details.combE / 1.609344) * 10) / 10
    : null;
  return { isElectric: true, kwhPer100km: kwh };
}

// ─── עזרים ───────────────────────────────────────────────────────────────────

/** כשיש תוצאה אחת בלבד השירות מחזיר אובייקט במקום מערך. */
function normalizeItems(raw: unknown): FEMenuItem[] {
  if (!raw || typeof raw !== 'object') return [];
  const wrapper = raw as Record<string, unknown>;
  if (!wrapper.menuItem) return [];
  return Array.isArray(wrapper.menuItem)
    ? (wrapper.menuItem as FEMenuItem[])
    : [wrapper.menuItem as FEMenuItem];
}

async function feGet(path: string): Promise<unknown> {
  const res = await fetchWithTimeout(`${FE_BASE}${path}`, 6000);
  if (!res.ok) throw new Error(`FuelEconomy.gov error ${res.status} on ${path}`);
  return res.json();
}

// ─── הפונקציות הציבוריות ─────────────────────────────────────────────────────

/**
 * כל היצרנים שנמכרו בארה"ב בשנת דגם נתונה.
 */
export async function getMakes(year: number): Promise<FEMenuItem[]> {
  const data = await feGet(`/vehicle/menu/make?year=${year}`);
  return normalizeItems(data);
}

/**
 * כל הדגמים של יצרן מסוים באותה שנה.
 */
export async function getModels(year: number, make: string): Promise<FEMenuItem[]> {
  const data = await feGet(
    `/vehicle/menu/model?year=${year}&make=${encodeURIComponent(make)}`
  );
  return normalizeItems(data);
}

/**
 * רמות הגימור והמנועים של דגם מסוים.
 * שדה value הוא מזהה הרכב שדרכו שולפים את הפרטים המלאים.
 */
export async function getTrims(year: number, make: string, model: string): Promise<FEMenuItem[]> {
  const data = await feGet(
    `/vehicle/menu/options?year=${year}&make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}`
  );
  return normalizeItems(data);
}

/**
 * הפרטים המלאים של רכב מסוים לפי המזהה שהתקבל מרשימת הגימורים.
 */
export async function getVehicleDetails(vehicleId: string): Promise<FEVehicleDetails> {
  return feGet(`/vehicle/${vehicleId}`) as Promise<FEVehicleDetails>;
}

/**
 * המרה ממיילים לגלון לליטר ל-100 ק"מ.
 */
export function mpgToL100km(mpg: number): number {
  if (!mpg || mpg <= 0) return 0;
  return Math.round((235.214 / mpg) * 10) / 10;
}

// ─── המקור השני: מאגר NRCan הקנדי ────────────────────────────────────────────
//
// אותו סוג ממשק כמו מרשם הרכב הישראלי. מכסה את כל הרכבים שנמכרו בקנדה,
// כולל מותגים אירופיים בגרסאות בנזין, ומחזיר ליטר ל-100 ק"מ ישירות.
//
// דגמי דיזל אירופיים לא נמכרים בקנדה ולכן לא יופיעו כאן; עבורם נופלים
// להערכה לפי סוג הדלק.
//
// מזהי מקורות הנתונים לפי שנה:
//   2015–2024: c98b9dc8-b23f-4cd8-8b19-e892da1e4688
//   2025:      d589f2bc-9a85-4f65-be2f-20f17debfcb1
//   2026:      9df1b18d-d036-4783-a61c-99f1f75b3ac5

const NRCAN_BASE     = 'https://open.canada.ca/data/api/action/datastore_search';
const NRCAN_2015_24  = 'c98b9dc8-b23f-4cd8-8b19-e892da1e4688';
const NRCAN_2025     = 'd589f2bc-9a85-4f65-be2f-20f17debfcb1';
const NRCAN_2026     = '9df1b18d-d036-4783-a61c-99f1f75b3ac5';

function nrcanResourceId(year: number): string {
  if (year >= 2026) return NRCAN_2026;
  if (year >= 2025) return NRCAN_2025;
  return NRCAN_2015_24;
}

/** מנרמל מחרוזת דגם להשוואה גמישה: אותיות קטנות, בלי רווחים ומקפים. */
function norm(s: string) {
  return s.toLowerCase().replace(/[\s\-_\.]/g, '');
}

/**
 * שולפת צריכה משולבת מהמאגר הקנדי.
 *
 * @param make  שם היצרן באנגלית
 * @param model שם הדגם המסחרי כפי שהוא במרשם הישראלי
 * @param year  שנת הדגם
 * @returns ליטר ל-100 ק"מ, או null אם לא נמצא
 */
export async function getNRCanL100km(
  make: string,
  model: string,
  year: number,
): Promise<number | null> {
  try {
    const resourceId = nrcanResourceId(year);
    const filters    = encodeURIComponent(JSON.stringify({
      'Make':       make,
      'Model year': String(year),
    }));
    const url = `${NRCAN_BASE}?resource_id=${resourceId}&filters=${filters}&limit=50`;

    const res = await fetchWithTimeout(url, 8000);
    if (!res.ok) return null;

    const json = await res.json();
    if (!json.success) return null;

    const records: Record<string, unknown>[] = json?.result?.records ?? [];
    if (records.length === 0) return null;

    const targetNorm = norm(model);

    const getModel = (r: Record<string, unknown>) => norm(String(r['Model'] ?? ''));
    const getLkm   = (r: Record<string, unknown>) =>
      parseFloat(String(r['Combined (L/100 km)'] ?? ''));

    // 1. התאמה מדויקת של שם הדגם
    let match = records.find(r => getModel(r) === targetNorm);

    // 2. אחד מהשמות מכיל את השני
    if (!match) match = records.find(r => {
      const rn = getModel(r);
      return rn.includes(targetNorm) || targetNorm.includes(rn);
    });

    // 3. הרשומה הראשונה עם נתון תקין לאותו יצרן ושנה
    if (!match) match = records.find(r => getLkm(r) > 0);

    if (!match) return null;

    const lkm = getLkm(match);
    return lkm > 0 ? Math.round(lkm * 10) / 10 : null;
  } catch {
    return null;   // שגיאת רשת או פורמט לא צפוי — נכשל בשקט
  }
}

// ─── גיבוי אחרון: הערכה לפי סוג דלק ──────────────────────────────────────────
//
// משמש כשאף מקור לא הכיר את הדגם. מתבסס על שדה סוג הדלק מהמרשם הישראלי.
// מחזיר null לרכב חשמלי מלא, שעבורו ליטר ל-100 ק"מ חסר משמעות.

/**
 * מחזירה הערכה סבירה לפי סוג הדלק שרשום במרשם.
 * מחזירה null לרכב חשמלי מלא.
 */
export function suggestL100kmByFuelType(hebrewFuelType: string): number | null {
  if (!hebrewFuelType) return 8.5;

  // חשמלי מלא
  if (hebrewFuelType.includes('חשמל') && !hebrewFuelType.includes('בנזין')) return null;

  // היברידי נטען
  if (hebrewFuelType.includes('חשמל') && hebrewFuelType.includes('בנזין')) return 2.5;

  // היברידי רגיל
  if (hebrewFuelType.includes('היברידי') || hebrewFuelType.includes('כלאיים')) return 5.5;

  // דיזל — ממוצע אירופי לדגמים הנפוצים בישראל
  if (hebrewFuelType.includes('דיזל')) return 6.0;

  // גז
  if (hebrewFuelType.includes('גז')) return 9.5;

  // ברירת מחדל: בנזין
  return 8.5;
}
