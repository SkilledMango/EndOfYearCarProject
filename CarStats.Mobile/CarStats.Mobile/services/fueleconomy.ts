/**
 * fueleconomy.ts
 * Wrapper for the free US DOE / EPA FuelEconomy.gov API.
 * No API key required.
 *
 * Docs: https://www.fueleconomy.gov/feg/ws/index.shtml
 *
 * All endpoints accept JSON via:  Accept: application/json
 *
 * NOTE: The API is US-market data (MPG). We convert to L/100km.
 * Real-world consumption may differ slightly by region/fuel quality,
 * but it is accurate enough as a default for the vehicle profile.
 */

import { fetchWithTimeout } from './http';

const FE_BASE = 'https://www.fueleconomy.gov/ws/rest';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FEMenuItem {
  text: string;   // human label  (e.g. "Kia", "Sportage")
  value: string;  // machine value (same for makes/models; vehicle ID for options)
}

export interface FEVehicleDetails {
  id: number;
  make: string;
  model: string;
  year: number;
  trany: string;       // transmission description
  fuelType: string;
  /** Combined city/highway MPG (US gallons) */
  comb08: number;
  city08: number;
  hwy08: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** The API returns a single object instead of an array when there is only one result. */
function normalizeItems(raw: unknown): FEMenuItem[] {
  if (!raw || typeof raw !== 'object') return [];
  const wrapper = raw as Record<string, unknown>;
  if (!wrapper.menuItem) return [];
  return Array.isArray(wrapper.menuItem)
    ? (wrapper.menuItem as FEMenuItem[])
    : [wrapper.menuItem as FEMenuItem];
}

async function feGet(path: string): Promise<unknown> {
  const res = await fetchWithTimeout(`${FE_BASE}${path}`, 6000);
  if (!res.ok) throw new Error(`FuelEconomy.gov error ${res.status} on ${path}`);
  return res.json();
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * All car makes sold in the US for a given model year.
 * Example: getMakes(2018) → [{ text: "Acura", value: "Acura" }, ...]
 */
export async function getMakes(year: number): Promise<FEMenuItem[]> {
  const data = await feGet(`/vehicle/menu/make?year=${year}`);
  return normalizeItems(data);
}

/**
 * All models for a given year + make.
 * Example: getModels(2018, "Kia") → [{ text: "Sportage", value: "Sportage" }, ...]
 */
export async function getModels(year: number, make: string): Promise<FEMenuItem[]> {
  const data = await feGet(
    `/vehicle/menu/model?year=${year}&make=${encodeURIComponent(make)}`
  );
  return normalizeItems(data);
}

/**
 * Specific trims/engines for a year + make + model.
 * The `value` field is the numeric vehicle ID used to fetch full details.
 * Example: { text: "2018 Kia Sportage FWD 4-cyl, 2.4 L, Auto", value: "39978" }
 */
export async function getTrims(year: number, make: string, model: string): Promise<FEMenuItem[]> {
  const data = await feGet(
    `/vehicle/menu/options?year=${year}&make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}`
  );
  return normalizeItems(data);
}

/**
 * Full EPA details for a specific vehicle ID (from getTrims value).
 */
export async function getVehicleDetails(vehicleId: string): Promise<FEVehicleDetails> {
  return feGet(`/vehicle/${vehicleId}`) as Promise<FEVehicleDetails>;
}

/**
 * Convert US MPG (miles per US gallon) to L/100km.
 * Formula: 235.214 / MPG
 */
export function mpgToL100km(mpg: number): number {
  if (!mpg || mpg <= 0) return 0;
  return Math.round((235.214 / mpg) * 10) / 10;
}

// ─── NRCan (Natural Resources Canada) — global coverage via CKAN ─────────────
//
// Same CKAN API as the Israeli vehicle registry. Covers all cars sold in Canada,
// including European brands (petrol variants) and all Asian/US brands.
// Returns L/100km directly — no MPG conversion needed.
//
// Note: European diesel models (E220d, 320d, Golf TDI…) are not sold in Canada
// so they won't appear here — use suggestL100kmByFuelType() as the final fallback.
//
// Dataset resource IDs:
//   2015–2024: c98b9dc8-b23f-4cd8-8b19-e892da1e4688
//   2025:      d589f2bc-9a85-4f65-be2f-20f17debfcb1
//   2026:      9df1b18d-d036-4783-a61c-99f1f75b3ac5

const NRCAN_BASE     = 'https://open.canada.ca/data/api/action/datastore_search';
const NRCAN_2015_24  = 'c98b9dc8-b23f-4cd8-8b19-e892da1e4688';
const NRCAN_2025     = 'd589f2bc-9a85-4f65-be2f-20f17debfcb1';
const NRCAN_2026     = '9df1b18d-d036-4783-a61c-99f1f75b3ac5';

function nrcanResourceId(year: number): string {
  if (year >= 2026) return NRCAN_2026;
  if (year >= 2025) return NRCAN_2025;
  return NRCAN_2015_24;
}

/** Normalise a model/trim string for fuzzy matching: lowercase, strip spaces/dashes */
function norm(s: string) {
  return s.toLowerCase().replace(/[\s\-_\.]/g, '');
}

/**
 * Look up combined fuel consumption (L/100km) from the NRCan open dataset.
 * Covers cars sold in Canada — good for European petrol variants and all
 * Asian / American models.
 *
 * @param make  English make name, e.g. "Mercedes-Benz"
 * @param model Commercial model string from the Israeli registry, e.g. "C200"
 * @param year  Model year
 * @returns L/100km combined, or null if not found
 */
export async function getNRCanL100km(
  make: string,
  model: string,
  year: number,
): Promise<number | null> {
  try {
    const resourceId = nrcanResourceId(year);
    const filters    = encodeURIComponent(JSON.stringify({
      'Make':       make,
      'Model year': String(year),
    }));
    const url = `${NRCAN_BASE}?resource_id=${resourceId}&filters=${filters}&limit=50`;

    const res = await fetchWithTimeout(url, 8000);
    if (!res.ok) return null;

    const json = await res.json();
    if (!json.success) return null;

    const records: Record<string, unknown>[] = json?.result?.records ?? [];
    if (records.length === 0) return null;

    const targetNorm = norm(model);

    const getModel = (r: Record<string, unknown>) => norm(String(r['Model'] ?? ''));
    const getLkm   = (r: Record<string, unknown>) =>
      parseFloat(String(r['Combined (L/100 km)'] ?? ''));

    // 1. Exact model match
    let match = records.find(r => getModel(r) === targetNorm);

    // 2. Model contains target or vice-versa
    if (!match) match = records.find(r => {
      const rn = getModel(r);
      return rn.includes(targetNorm) || targetNorm.includes(rn);
    });

    // 3. First record with valid fuel data (best-effort for this make/year)
    if (!match) match = records.find(r => getLkm(r) > 0);

    if (!match) return null;

    const lkm = getLkm(match);
    return lkm > 0 ? Math.round(lkm * 10) / 10 : null;
  } catch {
    return null;   // network error or unexpected format — fail silently
  }
}

// ─── Gemini AI fuel lookup ────────────────────────────────────────────────────
//
// Uses Google Gemini 2.0 Flash (free tier) to look up WLTP combined fuel
// consumption for any car model worldwide. Works for European diesels,
// obscure trims, and cars not in EPA/NRCan.
// (gemini-1.5-flash was retired by Google for new API projects — do not use.)
//
// Get a free key at: https://aistudio.google.com  (takes ~30 seconds)

// Loaded from .env (gitignored). Set EXPO_PUBLIC_GEMINI_API_KEY in your .env file.
// See .env.example for the format. If blank, Gemini lookup is silently skipped.
const GEMINI_API_KEY: string = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

/**
 * Asks Gemini for the WLTP combined fuel consumption (L/100km) of a specific car.
 * Returns null if no key is configured, or if the model is unknown / electric.
 */
export async function getGeminiL100km(
  make:            string,
  model:           string,
  year:            number,
  hebrewFuelType:  string = '',
): Promise<number | null> {
  if (!GEMINI_API_KEY) return null;

  // Build a hint if we know the fuel type from the Israeli registry
  const fuelHint =
    hebrewFuelType.includes('דיזל')     ? ' (diesel engine)'
    : hebrewFuelType.includes('היברידי') ? ' (hybrid)'
    : hebrewFuelType.includes('חשמל') && !hebrewFuelType.includes('בנזין') ? ' (electric)'
    : '';

  const prompt =
    `What is the official WLTP combined fuel consumption in L/100km for ` +
    `a ${year} ${make} ${model}${fuelHint}? ` +
    `Reply with ONLY the number, for example: 5.2. ` +
    `If the car is electric or you don't know, reply: unknown`;

  try {
    const res = await fetchWithTimeout(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, 8000, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body:    JSON.stringify({
        contents:         [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 16 },
      }),
    });

    if (!res.ok) return null;
    const json = await res.json();
    const text: string =
      (json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();

    if (!text || text.toLowerCase().includes('unknown')) return null;

    // Extract the first number from the response (handles "5.2 L/100km" etc.)
    const match = text.match(/[\d]+\.?[\d]*/);
    if (!match) return null;
    const num = parseFloat(match[0]);
    // Sanity check: real cars are 2–35 L/100km
    return isFinite(num) && num >= 2 && num <= 35 ? Math.round(num * 10) / 10 : null;
  } catch {
    return null;
  }
}

// ─── Smart fuel-type defaults ─────────────────────────────────────────────────
//
// Last-resort fallback when no API has data (e.g. European diesel models not
// sold in North America). Uses the Israeli registry's sug_delek_nm field.
// Returns null for full-electric vehicles (L/100km is meaningless for them).

/**
 * Returns a reasonable L/100km estimate based on the Hebrew fuel-type string
 * from the Israeli vehicle registry (sug_delek_nm).
 *
 * Returns null for full-electric vehicles (use kWh/100km instead).
 */
export function suggestL100kmByFuelType(hebrewFuelType: string): number | null {
  if (!hebrewFuelType) return 8.5;

  // Full electric (חשמל without בנזין = pure BEV)
  if (hebrewFuelType.includes('חשמל') && !hebrewFuelType.includes('בנזין')) return null;

  // Plug-in hybrid (חשמל/בנזין)
  if (hebrewFuelType.includes('חשמל') && hebrewFuelType.includes('בנזין')) return 2.5;

  // Conventional hybrid (היברידי / כלאיים)
  if (hebrewFuelType.includes('היברידי') || hebrewFuelType.includes('כלאיים')) return 5.5;

  // Diesel (דיזל) — European average for common Israeli models
  if (hebrewFuelType.includes('דיזל')) return 6.0;

  // LPG / natural gas (גז)
  if (hebrewFuelType.includes('גז')) return 9.5;

  // Default: petrol (בנזין)
  return 8.5;
}
