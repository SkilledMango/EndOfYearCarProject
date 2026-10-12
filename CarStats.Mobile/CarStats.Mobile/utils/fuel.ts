// Fuel-level estimate for cars that don't report PID 0x2F

export type FuelType = '95' | '98' | 'diesel';

export const FUEL_TYPES: readonly FuelType[] = ['95', '98', 'diesel'];

export const FUEL_TYPE_LABELS: Record<FuelType, string> = {
  '95':     '95',
  '98':     '98',
  diesel:   'Diesel',
};

export const FALLBACK_FUEL_PRICES: Record<FuelType, number> = {
  '95':     8.27,
  '98':    10.50,
  diesel:  11.41,
};

export const FALLBACK_FUEL_PRICE_ILS = FALLBACK_FUEL_PRICES['95'];

export const isFuelType = (value: string | null | undefined): value is FuelType =>
  FUEL_TYPES.includes(value as FuelType);

export function fillUpCost(liters: number, pricePerLitre: number): number | null {
  if (!Number.isFinite(liters) || liters <= 0)             return null;
  if (!Number.isFinite(pricePerLitre) || pricePerLitre <= 0) return null;
  return Math.round(liters * pricePerLitre * 100) / 100;
}

export interface FuelSpendEntry {
  date: string;
  price: number;
  liters: number;
  l100km: number | null;
}

export interface FuelSpend {
  thisMonth: number;
  thisYear: number;
  monthChangePct: number | null;
}

const monthKey = (d: Date) => d.toISOString().slice(0, 7);

/** Date.UTC normalises month -1, so January correctly steps to last December. */
const prevMonthKey = (d: Date) =>
  monthKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)));

// איתור: חישוב הוצאות דלק החודש והשנה
// Month keys are UTC, because entries are stored with toISOString()
export function fuelSpend(entries: FuelSpendEntry[], now: Date = new Date()): FuelSpend {
  const thisMonthKey = monthKey(now);
  const lastMonthKey = prevMonthKey(now);
  const yearKey      = thisMonthKey.slice(0, 4);

  let thisMonth = 0;
  let lastMonth = 0;
  let thisYear  = 0;

  for (const e of entries) {
    if (!(e.price > 0)) continue;
    if (e.date.startsWith(thisMonthKey)) thisMonth += e.price;
    if (e.date.startsWith(lastMonthKey)) lastMonth += e.price;
    if (e.date.startsWith(yearKey))      thisYear  += e.price;
  }

  return {
    thisMonth: round2(thisMonth),
    thisYear:  round2(thisYear),
    monthChangePct: lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : null,
  };
}

// איתור: עלות ל-100 ק"מ
// ₪ per 100km: comparable across fuel types
export function costPer100km(entries: FuelSpendEntry[]): number | null {
  let cost = 0;
  let km   = 0;

  for (const e of entries) {
    if (e.l100km == null || !(e.l100km > 0)) continue;
    if (!(e.liters > 0) || !(e.price > 0))   continue;
    km   += (e.liters / e.l100km) * 100;
    cost += e.price;
  }

  return km > 0 ? round2((cost / km) * 100) : null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface FillCost {
  litres: number;
  cost: number;
}

// איתור: כמה עולה מיכל מלא או טעינה מלאה
export function costToFillTank(
  tankL: number | null | undefined,
  currentPct: number | null,
  pricePerLitre: number,
): FillCost | null {
  if (currentPct == null) return null;
  if (!tankL || tankL <= 0) return null;
  if (!Number.isFinite(pricePerLitre) || pricePerLitre <= 0) return null;

  const missingPct = 100 - Math.min(100, Math.max(0, currentPct));
  const litres = (missingPct / 100) * tankL;
  if (litres < 2) return null;

  return { litres: round2(litres), cost: round2(litres * pricePerLitre) };
}

export type TripFuelOutlook =
  | { enough: true;  litresLeft: number; pctLeft: number }
  | { enough: false; shortfallL: number; topUpCost: number };

// איתור: האם יש מספיק דלק לנסיעה
export function tripFuelOutlook(
  tankL: number | null | undefined,
  tankPct: number | null | undefined,
  tripFuelL: number,
  pricePerLitre: number,
): TripFuelOutlook | null {
  if (!tankL || tankL <= 0) return null;
  if (tankPct == null || !Number.isFinite(tankPct)) return null;
  if (!Number.isFinite(tripFuelL) || tripFuelL <= 0) return null;
  if (!Number.isFinite(pricePerLitre) || pricePerLitre <= 0) return null;

  const inTank = (Math.min(100, Math.max(0, tankPct)) / 100) * tankL;
  const left   = inTank - tripFuelL;

  if (left >= 0) {
    return {
      enough:     true,
      litresLeft: round2(left),
      pctLeft:    Math.round((left / tankL) * 100),
    };
  }

  const shortfall = -left;
  return {
    enough:     false,
    shortfallL: round2(shortfall),
    topUpCost:  round2(shortfall * pricePerLitre),
  };
}

export interface FuelBaseline {
  pct: number;
  tankL: number;
  tripKm: number;
}

export interface FuelEstimateInput {
  baseline: FuelBaseline | null;
  tripKm: number;
  avgL100km: number | null | undefined;
}

// איתור: הערכת מפלס הדלק
export function estimateFuelPercent({
  baseline,
  tripKm,
  avgL100km,
}: FuelEstimateInput): number | null {
  if (!baseline) return null;

  const startPct = clampPercent(baseline.pct);

  // No consumption data — hold at the baseline rather than inventing a slope.
  if (!avgL100km || avgL100km <= 0) return startPct;

  // A zero or missing tank size would make the drop infinite
  if (!baseline.tankL || baseline.tankL <= 0) return startPct;

  // Negative distance means no driving yet
  const kmDriven   = Math.max(0, tripKm - baseline.tripKm);
  const litersUsed = (kmDriven / 100) * avgL100km;
  const pctDropped = (litersUsed / baseline.tankL) * 100;

  return clampPercent(Math.round(startPct - pctDropped));
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

// Says "the car doesn't report it" only when the car itself said so
export function fuelTileNote({ isElectric, fuelSupported, hasEstimate }: {
  isElectric: boolean;
  fuelSupported: boolean | null | undefined;
  hasEstimate: boolean;
}): string {
  const level = isElectric ? 'battery level' : 'fuel level';
  if (fuelSupported === false) {
    return hasEstimate
      ? `⚠ This car doesn't report its ${level} over OBD-II — using estimate`
      : `⚠ This car doesn't report its ${level} over OBD-II`;
  }
  return hasEstimate
    ? `Waiting for the car's ${level} reading — using estimate`
    : `Waiting for the car's ${level} reading…`;
}
