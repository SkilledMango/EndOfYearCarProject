/**
 * מפלס הדלק וגודל המיכל, משותפים בין המסכים.
 *
 * רק מסך הבית דוגם את המתאם, אבל מסך הדלק ומתכנן הנסיעה צריכים את הנתון
 * ואינם יכולים לדגום בעצמם. לכן מסך הבית כותב לכאן והאחרים קוראים.
 *
 * הקיבולת נשמרת בנפרד מהמפלס כי מקורותיהם שונים: המפלס נמדד או מוערך,
 * והקיבולת מוקלדת פעם אחת ע"י הנהג — אין ממשק שיודע לתת גודל מיכל.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { FuelType, isFuelType } from '@/utils/fuel';

const levelKey = (vehicleId?: number) => `fuel_level_${vehicleId ?? 'default'}`;
const tankKey  = (vehicleId?: number) => `tank_size_${vehicleId ?? 'default'}`;
const typeKey  = (vehicleId?: number) => `fuel_type_${vehicleId}`;

/**
 * סוג הדלק של הרכב. ברירת המחדל היא 95, הסוג המפוקח והנפוץ ביותר.
 *
 * משותף ולא שייך למסך הדלק, כי גם מתכנן הנסיעה מתמחר נסיעה:
 * רכב דיזל שמתומחר במחיר בנזין שגוי בכ-40 אחוז.
 */
export async function loadFuelType(vehicleId?: number): Promise<FuelType> {
  try {
    const raw = await AsyncStorage.getItem(typeKey(vehicleId));
    return isFuelType(raw) ? raw : '95';
  } catch {
    return '95';
  }
}

export async function saveFuelType(fuelType: FuelType, vehicleId?: number): Promise<void> {
  try {
    await AsyncStorage.setItem(typeKey(vehicleId), fuelType);
  } catch { /* הבחירה פשוט לא תיזכר בפעם הבאה */ }
}

export interface TankLevel {
  /** אחוז, בין 0 ל-100. */
  pct: number;
  /**
   * אמת כשהרכב עצמו דיווח את המפלס, שקר כשזו ההערכה שלנו.
   * תכונות שאסור להן להסתמך על ניחוש, כמו "האם אגיע", בודקות את הדגל הזה
   * ולא מסתפקות במספר.
   */
  isReal: boolean;
  /** חותמת הזמן של הקריאה, כדי לזהות קריאה ישנה מדי. */
  at: string;
}

/** כמה זמן קריאה שמורה עדיין שווה הצגה. אחרי זה הרכב כנראה כבר נסע. */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

export async function saveTankLevel(
  pct: number | null,
  isReal: boolean,
  vehicleId?: number,
): Promise<void> {
  if (pct == null || !Number.isFinite(pct)) return;
  try {
    const value: TankLevel = {
      pct: Math.min(100, Math.max(0, pct)),
      isReal,
      at: new Date().toISOString(),
    };
    await AsyncStorage.setItem(levelKey(vehicleId), JSON.stringify(value));
  } catch { /* המסכים האחרים פשוט לא יציגו כלום */ }
}

/** מחזירה null כשאין נתון שמור או שהוא ישן מכדי לסמוך עליו. */
export async function loadTankLevel(vehicleId?: number): Promise<TankLevel | null> {
  try {
    const raw = await AsyncStorage.getItem(levelKey(vehicleId));
    if (!raw) return null;
    const value = JSON.parse(raw) as TankLevel;
    if (!Number.isFinite(value?.pct)) return null;

    const age = Date.now() - new Date(value.at).getTime();
    // גיל שאינו מספר מעיד על חותמת זמן פגומה, וגם היא נחשבת בלתי שמישה
    if (!Number.isFinite(age) || age > MAX_AGE_MS) return null;

    return value;
  } catch {
    return null;
  }
}

/**
 * מוחק את כל מה ששמור מקומית עבור רכב מסוים, אחרי שהוא נמחק מהמוסך.
 *
 * מזהי רכבים מגיעים ממסד הנתונים ויכולים לחזור על עצמם, אז בלי המחיקה הזו
 * רכב חדש היה יכול לרשת את יומן התדלוקים ואת גודל המיכל של רכב שנמחק.
 *
 * הרשימה כאן היא המקום היחיד שמכיר את כל המפתחות ששייכים לרכב — שלושה מהם
 * נכתבים בקובץ הזה, ושלושת האחרים במסך הבית ובלשונית הדלק.
 */
export async function clearVehicleData(vehicleId: number): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      levelKey(vehicleId),
      tankKey(vehicleId),
      typeKey(vehicleId),
      `fuel_fillups_${vehicleId}`,
      `fuel_baseline_${vehicleId}`,
      `trip_km_${vehicleId}`,
    ]);
  } catch { /* המחיקה בשרת כבר הצליחה — שאריות מקומיות לא שוברות כלום */ }
}

export async function saveTankSize(tankL: number, vehicleId?: number): Promise<void> {
  if (!Number.isFinite(tankL) || tankL <= 0) return;
  try {
    await AsyncStorage.setItem(tankKey(vehicleId), String(tankL));
  } catch { /* the driver is asked again next time */ }
}

/**
 * Tank capacity in litres, or null if never set.
 *
 * Falls back to the capacity inside an older fuel baseline so drivers who set
 * one before this key existed do not have to type it again.
 */
export async function loadTankSize(vehicleId?: number): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(tankKey(vehicleId));
    const direct = Number(raw);
    if (Number.isFinite(direct) && direct > 0) return direct;

    const legacy = await AsyncStorage.getItem(`fuel_baseline_${vehicleId ?? 'default'}`);
    if (!legacy) return null;
    const tankL = Number(JSON.parse(legacy)?.tankL);
    return Number.isFinite(tankL) && tankL > 0 ? tankL : null;
  } catch {
    return null;
  }
}
