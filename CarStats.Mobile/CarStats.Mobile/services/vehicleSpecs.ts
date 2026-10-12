import { Vehicle, getVehicleSpecs, updateVehicle } from './api';
import { loadTankSize, saveTankSize } from './tankState';

// כל רכב נבדק פעם אחת בכל הפעלה
const attempted = new Set<number>();

// איתור: השלמת נפח מיכל או סוללה וצריכה (AI)
export async function ensureVehicleSpecs(vehicle: Vehicle): Promise<Vehicle> {
  if (vehicle.tankCapacity > 0 || attempted.has(vehicle.id)) return vehicle;
  attempted.add(vehicle.id);

  const specs = await getVehicleSpecs(vehicle.make, vehicle.model, vehicle.year);
  // ה-AI יכול רק לגלות שרכב חשמלי, לא להפך
  const isElectric = vehicle.isElectric || specs?.isElectric === true;
  const becameElectric = isElectric && !vehicle.isElectric;

  // מיכל שהנהג הקליד גובר על ה-AI
  const localTank = becameElectric ? null : await loadTankSize(vehicle.id);
  // סומכים על הגודל של ה-AI רק כשהוא מסכים איתנו על סוג ההנעה
  const aiCapacity = specs && specs.isElectric === isElectric ? specs.tankCapacity : null;
  const capacity = localTank ?? aiCapacity ?? 0;

  if (!capacity && !becameElectric) return vehicle;

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

export function ensureAllVehicleSpecs(vehicles: Vehicle[]): Promise<Vehicle[]> {
  return Promise.all(vehicles.map(ensureVehicleSpecs));
}
