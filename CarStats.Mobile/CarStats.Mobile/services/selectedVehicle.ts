/**
 * הרכב שנבחר במסך המוסך, כדי שגם מסכים אחרים ידעו על איזה רכב מדובר —
 * למשל מוצא המוסכים, שמעלה לראש הרשימה את המוסך המורשה של היצרן.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@carstats_selected_vehicle';

export async function saveSelectedVehicleId(id: number): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, String(id));
  } catch { /* הבחירה פשוט לא תיזכר */ }
}

export async function loadSelectedVehicleId(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const id = raw ? Number(raw) : NaN;
    return Number.isFinite(id) ? id : null;
  } catch {
    return null;
  }
}
