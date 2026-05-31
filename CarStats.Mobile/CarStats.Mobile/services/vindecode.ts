/**
 * vindecode.ts
 *
 * Decodes a 17-char VIN using the free NHTSA vPIC API.
 * No API key required.
 *
 * Endpoint:
 *   GET https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/{VIN}?format=json
 *
 * The API covers:
 *  - All US-manufactured vehicles
 *  - Most imported vehicles (Kia, Hyundai, Toyota, Mercedes-Benz, BMW, etc.)
 *    — identified via the WMI (first 3 chars of VIN, a global ISO 3779 standard)
 *
 * Note: for non-US-market models (e.g. EU diesels), NHTSA may return the make
 * and year correctly but leave model as generic (e.g. "E-Class" instead of "E220d").
 * That's still enough to detect the car and suggest adding it to the garage.
 */

import { Vehicle } from './api';

const NHTSA_BASE = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin';

export interface VinDecodeResult {
  vin:   string;
  make:  string;   // e.g. "KIA", "MERCEDES-BENZ" (NHTSA returns uppercase)
  model: string;   // e.g. "Sportage", "E-Class"
  year:  number;
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Decodes a VIN string into make / model / year.
 * Returns null if the VIN is invalid or NHTSA doesn't recognise it.
 */
export async function decodeVin(vin: string): Promise<VinDecodeResult | null> {
  if (!vin || vin.length !== 17) return null;

  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`${NHTSA_BASE}/${encodeURIComponent(vin)}?format=json`, {
      headers: { Accept: 'application/json' },
      signal:  controller.signal,
    });
    if (!res.ok) return null;

    const json = await res.json();
    // NHTSA returns an array of {Variable, Value, ValueId, VariableId} objects
    const results: { Variable: string; Value: string }[] = json?.Results ?? [];

    const get = (name: string) =>
      (results.find(r => r.Variable === name)?.Value ?? '').trim();

    const make     = get('Make');
    const model    = get('Model');
    const yearStr  = get('Model Year');
    const year     = parseInt(yearStr, 10);
    const errorCode = get('Error Code');  // "0" = no error

    // NHTSA returns error code "0" for clean decodes; non-zero means partial
    // We still proceed if we got at least a make and year
    if (!make || !year) return null;

    // Title-case the make so "KIA" → "Kia", "MERCEDES-BENZ" → "Mercedes-Benz"
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
  } finally {
    clearTimeout(timer);
  }
}

// ─── Matching helper ──────────────────────────────────────────────────────────

/**
 * Returns true if a decoded VIN result matches a vehicle already in the garage.
 * Uses fuzzy matching because NHTSA make/model strings may differ from what
 * the user entered (e.g. "Kia" vs "KIA", "Sportage" vs "sportage").
 */
export function vinMatchesVehicle(decoded: VinDecodeResult, vehicle: Vehicle): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[\s\-_]/g, '');

  const makeMatch =
    norm(decoded.make).includes(norm(vehicle.make)) ||
    norm(vehicle.make).includes(norm(decoded.make));

  const modelMatch =
    !decoded.model ||                                    // if NHTSA didn't return a model, skip check
    norm(decoded.model).includes(norm(vehicle.model)) ||
    norm(vehicle.model).includes(norm(decoded.model));

  const yearMatch = decoded.year === vehicle.year;

  return makeMatch && modelMatch && yearMatch;
}
