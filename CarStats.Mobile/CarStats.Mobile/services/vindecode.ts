import { Vehicle } from './api';
import { fetchWithTimeout } from './http';

const NHTSA_BASE = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin';

export interface VinDecodeResult {
  vin:   string;
  make:  string;
  model: string;
  year:  number;
}

// איתור: פענוח מספר שלדה (VIN)
export async function decodeVin(vin: string): Promise<VinDecodeResult | null> {
  if (!vin || vin.length !== 17) return null;

  try {
    const res = await fetchWithTimeout(`${NHTSA_BASE}/${encodeURIComponent(vin)}?format=json`, 8000);
    if (!res.ok) return null;

    const json = await res.json();
    const results: { Variable: string; Value: string }[] = json?.Results ?? [];

    const get = (name: string) =>
      (results.find(r => r.Variable === name)?.Value ?? '').trim();

    const make     = get('Make');
    const model    = get('Model');
    const yearStr  = get('Model Year');
    const year     = parseInt(yearStr, 10);

    // הפענוח יכול להיות חלקי; מספיק שקיבלנו יצרן ושנה
    if (!make || !year) return null;

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

export function vinMatchesVehicle(decoded: VinDecodeResult, vehicle: Vehicle): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[\s\-_]/g, '');

  const makeMatch =
    norm(decoded.make).includes(norm(vehicle.make)) ||
    norm(vehicle.make).includes(norm(decoded.make));

  const modelMatch =
    !decoded.model ||
    norm(decoded.model).includes(norm(vehicle.model)) ||
    norm(vehicle.model).includes(norm(decoded.model));

  const yearMatch = decoded.year === vehicle.year;

  return makeMatch && modelMatch && yearMatch;
}
