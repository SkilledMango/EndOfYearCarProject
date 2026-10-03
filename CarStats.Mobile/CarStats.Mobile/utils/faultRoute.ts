/**
 * הפרמטרים לפתיחת מסך פירוט התקלה.
 *
 * הקוד חובה. הרכב אופציונלי: כשהוא ידוע, הסבר ה-AI מתאים לקודי היצרן שלו
 * (P1326 ביונדאי הוא תקלה אחרת לגמרי מ-P1326 בטויוטה). בלי רכב המסך
 * מתנהג בדיוק כמו קודם ומחזיר הסבר כללי.
 */

import type { CarIdentity } from '@/services/api';

// type ולא interface: הנתב של expo-router דורש אובייקט פתוח
export type FaultParams = {
  code: string;
  make?: string;
  model?: string;
  year?: string;
};

export function faultParams(code: string, car?: CarIdentity | null): FaultParams {
  if (!car?.make || !car.model || !(car.year > 0)) return { code };
  return { code, make: car.make, model: car.model, year: String(car.year) };
}
