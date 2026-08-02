/**
 * Fuel-level estimation for cars whose OBD adapter cannot report PID 0x2F.
 *
 * The driver sets a baseline ("I'm at 60%, the tank is 50 litres"), and from
 * there the level is inferred from distance driven and the vehicle's average
 * consumption. Extracted from the home screen so the arithmetic — and its
 * edge cases — can be tested without mounting a component.
 */

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
