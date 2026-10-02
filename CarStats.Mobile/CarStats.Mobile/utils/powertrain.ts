/**
 * חשמלי או דלק — זיהוי, ויחידות התצוגה שנגזרות ממנו.
 *
 * רכב חשמלי לא שונה רק בתווית: ליטרים הופכים לקוט"ש, תדלוק לטעינה ומיכל
 * לסוללה. כל המסכים שואלים כאן איך לקרוא לדברים, כדי שאף מסך לא יכתוב
 * "ליטר" ליד טסלה.
 */

/** תעריף חשמל ביתי לקוט"ש כולל מע"מ, כשהשרת לא זמין. */
export const FALLBACK_ELECTRICITY_PER_KWH = 0.65;

/**
 * מה מרשם הרכב הישראלי אומר על הרכב.
 *
 * מחזירה null כשהשדה ריק, ואז ההחלטה עוברת למקור הבא (EPA ואז AI).
 * פלאג-אין היברידי ("חשמל/בנזין") נחשב רכב דלק: הוא מתדלק בתחנה.
 */
export function electricFromRegistry(hebrewFuelType: string | null | undefined): boolean | null {
  const fuel = (hebrewFuelType ?? '').trim();
  if (!fuel) return null;
  return fuel.includes('חשמל') && !fuel.includes('בנזין') && !fuel.includes('דיזל');
}

/** יחידת האנרגיה: "kWh" או "L". */
export const energyUnit = (isElectric: boolean): string => (isElectric ? 'kWh' : 'L');

/** יחידת הצריכה, למשל "kWh/100km". */
export const consumptionUnit = (isElectric: boolean): string =>
  isElectric ? 'kWh/100km' : 'L/100km';

/** "Battery size" או "Tank size". */
export const capacityLabel = (isElectric: boolean): string =>
  isElectric ? 'Battery size' : 'Tank size';

/** מה נמדד באחוזים: סוללה או מיכל. */
export const levelLabel = (isElectric: boolean): string => (isElectric ? 'Battery' : 'Fuel');

/**
 * האם גודל מיכל/סוללה שהוקלד סביר לרכב אמיתי.
 * אותם טווחים שהשרת בודק בתשובות ה-AI.
 */
export function isPlausibleCapacity(value: number, isElectric: boolean): boolean {
  if (!Number.isFinite(value)) return false;
  return isElectric ? value >= 10 && value <= 200 : value >= 20 && value <= 150;
}
