import { fetchWithTimeout } from './http';

const FE_BASE = 'https://www.fueleconomy.gov/ws/rest';

export interface FEMenuItem {
  text: string;
  value: string;
}

export interface FEVehicleDetails {
  id: number;
  make: string;
  model: string;
  year: number;
  trany: string;
  fuelType: string;
  comb08: number;
  city08: number;
  hwy08: number;
  atvType?: string;
  combE?: number;
}

// ברכב חשמלי comb08 הוא MPGe, ולכן משתמשים בקוט"ש
export function epaElectricInfo(details: FEVehicleDetails): { isElectric: boolean; kwhPer100km: number | null } {
  const isElectric = details.atvType === 'EV' || details.fuelType === 'Electricity';
  if (!isElectric) return { isElectric: false, kwhPer100km: null };
  const kwh = details.combE && details.combE > 0
    ? Math.round((details.combE / 1.609344) * 10) / 10
    : null;
  return { isElectric: true, kwhPer100km: kwh };
}

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

export async function getMakes(year: number): Promise<FEMenuItem[]> {
  const data = await feGet(`/vehicle/menu/make?year=${year}`);
  return normalizeItems(data);
}

export async function getModels(year: number, make: string): Promise<FEMenuItem[]> {
  const data = await feGet(
    `/vehicle/menu/model?year=${year}&make=${encodeURIComponent(make)}`
  );
  return normalizeItems(data);
}

export async function getTrims(year: number, make: string, model: string): Promise<FEMenuItem[]> {
  const data = await feGet(
    `/vehicle/menu/options?year=${year}&make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}`
  );
  return normalizeItems(data);
}

// איתור: צריכת דלק ממאגר EPA
export async function getVehicleDetails(vehicleId: string): Promise<FEVehicleDetails> {
  return feGet(`/vehicle/${vehicleId}`) as Promise<FEVehicleDetails>;
}

export function mpgToL100km(mpg: number): number {
  if (!mpg || mpg <= 0) return 0;
  return Math.round((235.214 / mpg) * 10) / 10;
}

const NRCAN_BASE     = 'https://open.canada.ca/data/api/action/datastore_search';
const NRCAN_2015_24  = 'c98b9dc8-b23f-4cd8-8b19-e892da1e4688';
const NRCAN_2025     = 'd589f2bc-9a85-4f65-be2f-20f17debfcb1';
const NRCAN_2026     = '9df1b18d-d036-4783-a61c-99f1f75b3ac5';

function nrcanResourceId(year: number): string {
  if (year >= 2026) return NRCAN_2026;
  if (year >= 2025) return NRCAN_2025;
  return NRCAN_2015_24;
}

function norm(s: string) {
  return s.toLowerCase().replace(/[\s\-_\.]/g, '');
}

// איתור: צריכת דלק ממאגר NRCan
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

    // 1. התאמה מדויקת של שם הדגם
    let match = records.find(r => getModel(r) === targetNorm);

    // 2. אחד מהשמות מכיל את השני
    if (!match) match = records.find(r => {
      const rn = getModel(r);
      return rn.includes(targetNorm) || targetNorm.includes(rn);
    });

    // 3. הרשומה הראשונה עם נתון תקין לאותו יצרן ושנה
    if (!match) match = records.find(r => getLkm(r) > 0);

    if (!match) return null;

    const lkm = getLkm(match);
    return lkm > 0 ? Math.round(lkm * 10) / 10 : null;
  } catch {
    return null;
  }
}

export function suggestL100kmByFuelType(hebrewFuelType: string): number | null {
  if (!hebrewFuelType) return 8.5;

  if (hebrewFuelType.includes('חשמל') && !hebrewFuelType.includes('בנזין')) return null;

  if (hebrewFuelType.includes('חשמל') && hebrewFuelType.includes('בנזין')) return 2.5;

  if (hebrewFuelType.includes('היברידי') || hebrewFuelType.includes('כלאיים')) return 5.5;

  if (hebrewFuelType.includes('דיזל')) return 6.0;

  if (hebrewFuelType.includes('גז')) return 9.5;

  return 8.5;
}
