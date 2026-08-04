/**
 * Tank level and capacity, shared between screens.
 *
 * The fuel reading lives on the home screen — that is where the adapter is
 * polled — but the fuel tab and the trip planner both need it, and neither can
 * poll the car itself. Rather than lifting scanner state into a context that
 * only three screens use, the home screen writes what it knows here and the
 * others read it.
 *
 * Capacity is stored separately from the level because they come from different
 * places: the level is measured (or estimated), the capacity is typed once by
 * the driver on the fuel screen. No API can tell us a car's tank size.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { FuelType, isFuelType } from '@/utils/fuel';

const levelKey = (vehicleId?: number) => `fuel_level_${vehicleId ?? 'default'}`;
const tankKey  = (vehicleId?: number) => `tank_size_${vehicleId ?? 'default'}`;
const typeKey  = (vehicleId?: number) => `fuel_type_${vehicleId}`;

/**
 * Which fuel this car takes. Defaults to 95 — the regulated type, and much the
 * most common here.
 *
 * Shared rather than owned by the fuel screen because the trip planner prices
 * a journey too: a diesel car costed at the petrol price is wrong by about 40%.
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
  } catch { /* the choice just isn't remembered next time */ }
}

export interface TankLevel {
  /** 0–100. */
  pct: number;
  /**
   * True when the car reported it over OBD, false when it is our own estimate.
   * Features that must not act on a guess — the trip planner's "will I make
   * it" — check this rather than trusting the number alone.
   */
  isReal: boolean;
  /** ISO timestamp of the reading, so a stale one can be recognised. */
  at: string;
}

/** How long a stored reading is worth showing. Past this the car has likely moved on. */
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
  } catch { /* the other screens just fall back to showing nothing */ }
}

/** Returns null when nothing is stored or the reading is too old to trust. */
export async function loadTankLevel(vehicleId?: number): Promise<TankLevel | null> {
  try {
    const raw = await AsyncStorage.getItem(levelKey(vehicleId));
    if (!raw) return null;
    const value = JSON.parse(raw) as TankLevel;
    if (!Number.isFinite(value?.pct)) return null;

    const age = Date.now() - new Date(value.at).getTime();
    // NaN age means an unparseable timestamp — treat that as unusable too.
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
