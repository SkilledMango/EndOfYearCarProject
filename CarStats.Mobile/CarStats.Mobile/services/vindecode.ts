/**
 * פענוח מספר שלדה בן 17 תווים מול שירות NHTSA האמריקאי. חינמי, בלי מפתח.
 *
 * השירות מכסה רכבים מתוצרת ארה"ב וגם רוב הרכבים המיובאים, כי שלושת התווים
 * הראשונים של מספר השלדה הם תקן עולמי שמזהה את היצרן.
 *
 * לדגמים שאינם נמכרים בארה"ב הוא עשוי להחזיר יצרן ושנה נכונים אבל דגם כללי.
 * גם זה מספיק כדי לזהות את הרכב ולהציע להוסיף אותו למוסך.
 */

import { Vehicle } from './api';
import { fetchWithTimeout } from './http';

const NHTSA_BASE = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin';

export interface VinDecodeResult {
  vin:   string;
  make:  string;   // היצרן, מוחזר באותיות גדולות
  model: string;   // הדגם
  year:  number;
}

// ─── הפונקציה הראשית ─────────────────────────────────────────────────────────

/**
 * מפענחת מספר שלדה ליצרן, דגם ושנה.
 * מחזירה null אם המספר אינו תקין או שהשירות לא מזהה אותו.
 */
export async function decodeVin(vin: string): Promise<VinDecodeResult | null> {
  if (!vin || vin.length !== 17) return null;

  try {
    const res = await fetchWithTimeout(`${NHTSA_BASE}/${encodeURIComponent(vin)}?format=json`, 8000);
    if (!res.ok) return null;

    const json = await res.json();
    // התשובה מגיעה כמערך של זוגות שם ערך
    const results: { Variable: string; Value: string }[] = json?.Results ?? [];

    const get = (name: string) =>
      (results.find(r => r.Variable === name)?.Value ?? '').trim();

    const make     = get('Make');
    const model    = get('Model');
    const yearStr  = get('Model Year');
    const year     = parseInt(yearStr, 10);

    // הפענוח יכול להיות חלקי; מספיק שקיבלנו יצרן ושנה
    if (!make || !year) return null;

    // המרת שם היצרן לאות גדולה בתחילת מילה בלבד
    const titleMake = make
      .toLowerCase()
      .split('-')
      .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
      .join('-');

    const titleModel = model
      ? model.charAt(0).toUpperCase() + model.slice(1).toLowerCase()
      : '';

    return { vin, make: titleMake, model: titleModel, year };
  } catch {
    return null;
  }
}

// ─── עזר להשוואה ─────────────────────────────────────────────────────────────

/**
 * בודקת אם השלדה שפוענחה מתאימה לרכב שכבר קיים במוסך.
 * ההשוואה גמישה, כי הכתיב שהשירות מחזיר עשוי להיות שונה ממה שהמשתמש הקליד.
 */
export function vinMatchesVehicle(decoded: VinDecodeResult, vehicle: Vehicle): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[\s\-_]/g, '');

  const makeMatch =
    norm(decoded.make).includes(norm(vehicle.make)) ||
    norm(vehicle.make).includes(norm(decoded.make));

  const modelMatch =
    !decoded.model ||                                    // אם לא הוחזר דגם, מדלגים על הבדיקה
    norm(decoded.model).includes(norm(vehicle.model)) ||
    norm(vehicle.model).includes(norm(decoded.model));

  const yearMatch = decoded.year === vehicle.year;

  return makeMatch && modelMatch && yearMatch;
}
