/**
 * משלים לרכבים שכבר במוסך את מה שה-AI יודע עליהם: חשמלי או דלק, וגודל
 * המיכל או הסוללה.
 *
 * רכבים חדשים מקבלים את זה כבר בחלון ההוספה. כאן מטופלים הרכבים שנוספו
 * לפני שהתכונה הייתה קיימת, כדי שגם הם יקבלו גודל מיכל בלי שהנהג יקליד.
 */

import { Vehicle, getVehicleSpecs, updateVehicle } from './api';
import { loadTankSize, saveTankSize } from './tankState';

// כל רכב נבדק פעם אחת בכל הפעלה, גם כשה-AI לא ידע לענות — אחרת כל רענון
// של מסך הבית היה שואל שוב על אותו רכב ושורף מכסה לשווא
const attempted = new Set<number>();

/**
 * מחזירה את הרכב עם הנתונים שהושלמו, או את אותו רכב אם אין מה להשלים.
 * לעולם לא זורקת שגיאה.
 */
export async function ensureVehicleSpecs(vehicle: Vehicle): Promise<Vehicle> {
  if (vehicle.tankCapacity > 0 || attempted.has(vehicle.id)) return vehicle;
  attempted.add(vehicle.id);

  const specs = await getVehicleSpecs(vehicle.make, vehicle.model, vehicle.year);
  // ה-AI יכול רק לגלות שרכב ישן הוא חשמלי, ולא להפוך רכב חשמלי בחזרה לדלק:
  // הסימון החשמלי הגיע מהמרשם או מהנהג עצמו, ושניהם אמינים יותר מניחוש
  const isElectric = vehicle.isElectric || specs?.isElectric === true;
  const becameElectric = isElectric && !vehicle.isElectric;

  // מיכל שהנהג כבר הקליד גובר על ה-AI — אלא אם הרכב התגלה כחשמלי,
  // ואז מספר הליטרים שלו חסר משמעות כגודל סוללה
  const localTank = becameElectric ? null : await loadTankSize(vehicle.id);
  // סומכים על הגודל של ה-AI רק כשהוא מסכים איתנו על סוג ההנעה
  const aiCapacity = specs && specs.isElectric === isElectric ? specs.tankCapacity : null;
  const capacity = localTank ?? aiCapacity ?? 0;

  if (!capacity && !becameElectric) return vehicle;   // אין שום דבר חדש

  const updated: Vehicle = { ...vehicle, isElectric, tankCapacity: capacity };
  // רכב שהתגלה כחשמלי מחזיק צריכה בליטרים — מחליפים בקוט"ש של ה-AI
  if (becameElectric && specs?.consumption) updated.averageFuelConsumption = specs.consumption;

  try {
    await updateVehicle(vehicle.id, updated);
  } catch {
    return vehicle;
  }
  if (localTank == null && capacity > 0) await saveTankSize(capacity, vehicle.id);
  return updated;
}

/** כמו ensureVehicleSpecs לכל המוסך, במקביל. */
export function ensureAllVehicleSpecs(vehicles: Vehicle[]): Promise<Vehicle[]> {
  return Promise.all(vehicles.map(ensureVehicleSpecs));
}
