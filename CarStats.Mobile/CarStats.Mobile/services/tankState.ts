// רק מסך הבית דוגם את המתאם, ושומר כאן את המפלס לשאר המסכים

import AsyncStorage from '@react-native-async-storage/async-storage';
import { FuelType, isFuelType } from '@/utils/fuel';

const levelKey = (vehicleId?: number) => `fuel_level_${vehicleId ?? 'default'}`;
const tankKey  = (vehicleId?: number) => `tank_size_${vehicleId ?? 'default'}`;
const typeKey  = (vehicleId?: number) => `fuel_type_${vehicleId}`;

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
  pct: number;
  // אמת = הרכב דיווח בעצמו; 'האם אגיע' סומך רק על זה
  isReal: boolean;
  at: string;
}

const MAX_AGE_MS = 12 * 60 * 60 * 1000;

// איתור: שמירת מפלס הדלק
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

export async function loadTankLevel(vehicleId?: number): Promise<TankLevel | null> {
  try {
    const raw = await AsyncStorage.getItem(levelKey(vehicleId));
    if (!raw) return null;
    const value = JSON.parse(raw) as TankLevel;
    if (!Number.isFinite(value?.pct)) return null;

    const age = Date.now() - new Date(value.at).getTime();
    if (!Number.isFinite(age) || age > MAX_AGE_MS) return null;

    return value;
  } catch {
    return null;
  }
}

// מזהי רכבים חוזרים: מוחקים נתונים מקומיים של רכב שנמחק
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
