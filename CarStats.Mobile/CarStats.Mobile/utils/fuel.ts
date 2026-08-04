/**
 * Fuel-level estimation for cars whose OBD adapter cannot report PID 0x2F.
 *
 * The driver sets a baseline ("I'm at 60%, the tank is 50 litres"), and from
 * there the level is inferred from distance driven and the vehicle's average
 * consumption. Extracted from the home screen so the arithmetic — and its
 * edge cases — can be tested without mounting a component.
 */

/** The fuel types the app offers. Only 95 is regulated. */
export type FuelType = '95' | '98' | 'diesel';

export const FUEL_TYPES: readonly FuelType[] = ['95', '98', 'diesel'];

/** How each type is written in the UI. */
export const FUEL_TYPE_LABELS: Record<FuelType, string> = {
  '95':     '95',
  '98':     '98',
  diesel:   'Diesel',
};

/**
 * Prices per litre used when the server cannot be reached.
 *
 * Only the 95 figure is authoritative: Israel's Ministry of Energy sets one
 * national maximum for self-service 95 and revises it monthly, so even that
 * goes stale on the first of each month — the live values come from
 * getFuelPrice(). The other two are free-market and vary by station; they are
 * here so an offline estimate shows a plausible cost rather than nothing.
 */
export const FALLBACK_FUEL_PRICES: Record<FuelType, number> = {
  '95':     8.09,
  '98':    10.50,
  diesel:  11.41,
};

/** The regulated price, for callers with no fuel type to hand. */
export const FALLBACK_FUEL_PRICE_ILS = FALLBACK_FUEL_PRICES['95'];

export const isFuelType = (value: string | null | undefined): value is FuelType =>
  FUEL_TYPES.includes(value as FuelType);

/**
 * Cost of a fill-up, rounded to agorot.
 *
 * Returns null for a non-positive or unparseable litre figure so the caller can
 * leave the price field alone rather than writing "0.00" into it.
 */
export function fillUpCost(liters: number, pricePerLitre: number): number | null {
  if (!Number.isFinite(liters) || liters <= 0)             return null;
  if (!Number.isFinite(pricePerLitre) || pricePerLitre <= 0) return null;
  return Math.round(liters * pricePerLitre * 100) / 100;
}

/**
 * The parts of a logged fill-up the cost maths needs. Declared here rather than
 * importing the screen's FillUp so this stays testable on its own; FillUp is
 * structurally compatible.
 */
export interface FuelSpendEntry {
  /** ISO timestamp. */
  date: string;
  /** Total paid, ₪. */
  price: number;
  liters: number;
  /** Consumption for this tank, or null when km driven wasn't logged. */
  l100km: number | null;
}

export interface FuelSpend {
  thisMonth: number;
  thisYear: number;
  /** % change vs last month; null when there is no previous month to compare. */
  monthChangePct: number | null;
}

const monthKey = (d: Date) => d.toISOString().slice(0, 7);

/** Date.UTC normalises month -1, so January correctly steps to last December. */
const prevMonthKey = (d: Date) =>
  monthKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)));

/**
 * What the driver has actually spent on fuel.
 *
 * Compared against UTC month keys because entries are stored with
 * toISOString(); mixing in a local-time "now" would put a fill-up in the wrong
 * bucket for a few hours either side of midnight on the 1st.
 */
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
    // Without a previous month any percentage would be division by zero or a
    // meaningless "up 100%" on the driver's very first month.
    monthChangePct: lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : null,
  };
}

/**
 * Running cost in ₪ per 100km — the figure a driver can compare against another
 * car, where L/100km alone can't be compared across fuel types.
 *
 * Totals cost and distance before dividing rather than averaging each fill-up's
 * ratio, so a big tank counts for more than a splash of fuel. Entries without
 * km driven carry no distance and are skipped.
 */
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
  /** Litres needed to reach full. */
  litres: number;
  /** What those litres cost at the current pump rate, ₪. */
  cost: number;
}

/**
 * What it would cost to fill the tank from here.
 *
 * Returns null when there is nothing meaningful to show: no baseline set (so
 * the level is unknown), no tank size, or a tank already full enough that the
 * answer is noise. Deliberately not clamped into a "₪0" state — a zero reads
 * as free fuel rather than as "you don't need any".
 */
export function costToFillTank(
  tankL: number | null | undefined,
  currentPct: number | null,
  pricePerLitre: number,
): FillCost | null {
  if (currentPct == null) return null;
  if (!tankL || tankL <= 0) return null;
  if (!Number.isFinite(pricePerLitre) || pricePerLitre <= 0) return null;

  const missingPct = 100 - Math.min(100, Math.max(0, currentPct));
  // Under a couple of litres is within the error of an estimated gauge, and
  // "₪3 to fill up" invites a precision this number does not have.
  const litres = (missingPct / 100) * tankL;
  if (litres < 2) return null;

  return { litres: round2(litres), cost: round2(litres * pricePerLitre) };
}

export type TripFuelOutlook =
  | { enough: true;  litresLeft: number; pctLeft: number }
  | { enough: false; shortfallL: number; topUpCost: number };

/**
 * Whether the fuel in the tank covers a planned trip.
 *
 * Answers the question a driver actually asks before setting off — "will I make
 * it, and if not what does topping up cost" — rather than leaving them to
 * compare two numbers themselves.
 *
 * Returns null when any input is unusable, so the caller shows nothing instead
 * of a confident wrong answer about running out of fuel.
 */
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

  // The shortfall is what the trip needs beyond what is in the tank. No reserve
  // is added on top: inventing a safety margin would misstate the arithmetic,
  // and the screen already frames this as an estimate.
  const shortfall = -left;
  return {
    enough:     false,
    shortfallL: round2(shortfall),
    topUpCost:  round2(shortfall * pricePerLitre),
  };
}

export interface FuelBaseline {
  /** Fuel percentage when the user set the baseline, 0–100. */
  pct: number;
  /** Tank capacity in litres. */
  tankL: number;
  /** Accumulated trip km at the moment the baseline was set. */
  tripKm: number;
}

export interface FuelEstimateInput {
  baseline: FuelBaseline | null;
  /** Accumulated trip km right now. Persisted, so it survives a restart. */
  tripKm: number;
  /** Vehicle average consumption in L/100km, if known. */
  avgL100km: number | null | undefined;
}

/**
 * Returns the estimated fuel percentage (0–100, whole numbers), or null when
 * there is nothing to estimate from.
 *
 * Without a consumption figure the baseline is returned unchanged — a stale
 * number is still better than none, and it never reads lower than reality.
 */
export function estimateFuelPercent({
  baseline,
  tripKm,
  avgL100km,
}: FuelEstimateInput): number | null {
  if (!baseline) return null;

  const startPct = clampPercent(baseline.pct);

  // No consumption data — hold at the baseline rather than inventing a slope.
  if (!avgL100km || avgL100km <= 0) return startPct;

  // A zero or missing tank size would make pctDropped infinite and slam the
  // gauge to 0%, which reads as "empty" on a car that may be full.
  if (!baseline.tankL || baseline.tankL <= 0) return startPct;

  // Negative distance means the baseline was set after the current odometer
  // reading; treat that as "no driving yet" rather than as a refuel.
  const kmDriven   = Math.max(0, tripKm - baseline.tripKm);
  const litersUsed = (kmDriven / 100) * avgL100km;
  const pctDropped = (litersUsed / baseline.tankL) * 100;

  return clampPercent(Math.round(startPct - pctDropped));
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}
