/**
 * Fuel estimation. This number drives the gauge and the low-fuel messaging,
 * and it is the fallback for every car that cannot report PID 0x2F — so it is
 * what most users actually see.
 */

import {
  costPer100km,
  costToFillTank,
  estimateFuelPercent,
  fillUpCost,
  fuelSpend,
  FuelBaseline,
  FuelSpendEntry,
  isFuelType,
  tripFuelOutlook,
} from '@/utils/fuel';

const baseline = (over: Partial<FuelBaseline> = {}): FuelBaseline => ({
  pct: 60,
  tankL: 50,
  tripKm: 0,
  ...over,
});

describe('estimateFuelPercent', () => {
  it('returns null when no baseline has been set', () => {
    expect(estimateFuelPercent({ baseline: null, tripKm: 100, avgL100km: 8 })).toBeNull();
  });

  it('returns the baseline before any distance is driven', () => {
    expect(estimateFuelPercent({ baseline: baseline(), tripKm: 0, avgL100km: 8 })).toBe(60);
  });

  it('depletes proportionally to distance and consumption', () => {
    // 100 km at 8 L/100km = 8 L from a 50 L tank = 16 percentage points.
    expect(estimateFuelPercent({ baseline: baseline(), tripKm: 100, avgL100km: 8 })).toBe(44);
  });

  it('measures distance from the baseline, not from zero', () => {
    // Baseline set at 500 km, now at 600 km → 100 km driven, same 16 points.
    const b = baseline({ tripKm: 500 });
    expect(estimateFuelPercent({ baseline: b, tripKm: 600, avgL100km: 8 })).toBe(44);
  });

  it('survives a restart that restored a larger odometer', () => {
    // This is the regression: tripKm used to reset to 0 each launch, so
    // kmDriven came out 0 and the gauge snapped back to the full baseline.
    const b = baseline({ pct: 60, tripKm: 100 });
    expect(estimateFuelPercent({ baseline: b, tripKm: 300, avgL100km: 8 })).toBe(28);
  });

  it('never goes below zero on a long trip', () => {
    expect(estimateFuelPercent({ baseline: baseline(), tripKm: 10_000, avgL100km: 8 })).toBe(0);
  });

  it('never exceeds 100 even from a nonsense baseline', () => {
    expect(estimateFuelPercent({ baseline: baseline({ pct: 150 }), tripKm: 0, avgL100km: 8 }))
      .toBe(100);
  });

  it('holds at the baseline when consumption is unknown', () => {
    expect(estimateFuelPercent({ baseline: baseline(), tripKm: 500, avgL100km: null })).toBe(60);
    expect(estimateFuelPercent({ baseline: baseline(), tripKm: 500, avgL100km: 0 })).toBe(60);
    expect(estimateFuelPercent({ baseline: baseline(), tripKm: 500, avgL100km: undefined })).toBe(60);
  });

  it('holds at the baseline when the tank size is missing', () => {
    // Dividing by a zero tank would make the drop infinite and show 0% —
    // "empty" on a car that might be full.
    expect(estimateFuelPercent({ baseline: baseline({ tankL: 0 }), tripKm: 500, avgL100km: 8 }))
      .toBe(60);
  });

  it('treats an odometer behind the baseline as no driving yet', () => {
    // Would otherwise compute a negative distance and report MORE fuel than
    // the baseline, which is the dangerous direction to be wrong.
    const b = baseline({ tripKm: 500 });
    expect(estimateFuelPercent({ baseline: b, tripKm: 100, avgL100km: 8 })).toBe(60);
  });

  it('returns whole numbers', () => {
    const value = estimateFuelPercent({ baseline: baseline(), tripKm: 37, avgL100km: 7.3 });
    expect(value).toBe(Math.round(value!));
  });
});

/**
 * Fill-up cost. This prefills the "total paid" field, so a wrong answer here
 * quietly writes a bad number into the user's own fuel history.
 */
describe('fillUpCost', () => {
  it('multiplies litres by the pump rate', () => {
    expect(fillUpCost(45, 8.09)).toBe(364.05);
  });

  it('rounds to agorot rather than leaving floating-point dust', () => {
    // 33.3 * 8.09 = 269.397 — must not surface as 269.39699999999999
    expect(fillUpCost(33.3, 8.09)).toBe(269.4);
  });

  it('returns null for litres the user has not typed yet', () => {
    // NaN is what parseFloat('') gives, and the empty field is the initial
    // state of the modal every time it opens.
    expect(fillUpCost(NaN, 8.09)).toBeNull();
    expect(fillUpCost(0, 8.09)).toBeNull();
    expect(fillUpCost(-5, 8.09)).toBeNull();
  });

  it('returns null rather than 0 when the price is unusable', () => {
    // A zero price would prefill "0.00" and read as a free tank of petrol.
    expect(fillUpCost(45, 0)).toBeNull();
    expect(fillUpCost(45, NaN)).toBeNull();
  });
});

describe('isFuelType', () => {
  it('accepts the three types the picker offers', () => {
    expect(isFuelType('95')).toBe(true);
    expect(isFuelType('98')).toBe(true);
    expect(isFuelType('diesel')).toBe(true);
  });

  it('rejects anything else, so stored junk falls back to 95', () => {
    expect(isFuelType('petrol')).toBe(false);
    expect(isFuelType(null)).toBe(false);
    expect(isFuelType(undefined)).toBe(false);
  });
});

/**
 * Running costs. These drive the numbers on the fuel screen, and both are easy
 * to get subtly wrong at a month boundary or on a driver's first month.
 */
const entry = (
  date: string,
  price: number,
  liters: number,
  l100km: number | null = null,
): FuelSpendEntry => ({ date, price, liters, l100km });

describe('fuelSpend', () => {
  const now = new Date('2026-08-15T10:00:00.000Z');

  it('totals the current month, the current year, and compares to last month', () => {
    const spend = fuelSpend([
      entry('2026-08-02T08:00:00.000Z', 300, 40),
      entry('2026-08-11T08:00:00.000Z', 200, 25),
      entry('2026-07-20T08:00:00.000Z', 400, 50),
      entry('2025-08-20T08:00:00.000Z', 999, 99), // last year — excluded
    ], now);

    expect(spend.thisMonth).toBe(500);
    expect(spend.thisYear).toBe(900);          // 500 + July's 400
    expect(spend.monthChangePct).toBeCloseTo(25); // 500 vs 400
  });

  it('steps back across a year boundary for January', () => {
    // December is "last month" for January — a naive month-1 gives "2026-00".
    const spend = fuelSpend([
      entry('2026-01-05T08:00:00.000Z', 100, 12),
      entry('2025-12-28T08:00:00.000Z', 200, 25),
    ], new Date('2026-01-15T10:00:00.000Z'));

    expect(spend.thisMonth).toBe(100);
    expect(spend.monthChangePct).toBeCloseTo(-50);
  });

  it('reports no change on the first month rather than dividing by zero', () => {
    const spend = fuelSpend([entry('2026-08-02T08:00:00.000Z', 300, 40)], now);
    expect(spend.monthChangePct).toBeNull();
    expect(spend.thisMonth).toBe(300);
  });

  it('is zero, not NaN, with nothing logged', () => {
    const spend = fuelSpend([], now);
    expect(spend).toEqual({ thisMonth: 0, thisYear: 0, monthChangePct: null });
  });
});

describe('costPer100km', () => {
  it('divides total cost by total distance', () => {
    // 40L at 8 L/100km = 500km for ₪320 -> ₪64 per 100km
    expect(costPer100km([entry('2026-08-02T08:00:00.000Z', 320, 40, 8)])).toBe(64);
  });

  it('weights by distance instead of averaging the ratios', () => {
    // 500km at ₪64/100km and 100km at ₪100/100km.
    // Weighted: (320 + 100) / 600km * 100 = ₪70. Mean of ratios would be ₪82.
    expect(costPer100km([
      entry('2026-08-02T08:00:00.000Z', 320, 40, 8),
      entry('2026-08-09T08:00:00.000Z', 100, 10, 10),
    ])).toBe(70);
  });

  it('skips fill-ups with no km logged, which carry no distance', () => {
    expect(costPer100km([
      entry('2026-08-02T08:00:00.000Z', 320, 40, 8),
      entry('2026-08-09T08:00:00.000Z', 500, 60, null),
    ])).toBe(64);
  });

  it('returns null rather than Infinity when no entry has distance', () => {
    expect(costPer100km([entry('2026-08-02T08:00:00.000Z', 320, 40, null)])).toBeNull();
    expect(costPer100km([])).toBeNull();
  });
});

/**
 * Cost to fill. Shown next to a real price, so it must stay silent whenever the
 * tank level is unknown rather than quoting a number built on a default.
 */
describe('costToFillTank', () => {
  it('prices the litres missing from the tank', () => {
    // 50L tank at 40% -> 30L missing -> 30 * 8.09
    expect(costToFillTank(50, 40, 8.09)).toEqual({ litres: 30, cost: 242.7 });
  });

  it('says nothing when no baseline has been set', () => {
    // estimateFuelPercent returns null without a baseline; a fill cost derived
    // from the 55L default would be invented, not measured.
    expect(costToFillTank(50, null, 8.09)).toBeNull();
  });

  it('says nothing for a tank that is already full enough', () => {
    // 1L short on a 50L tank is inside the error of an estimated gauge.
    expect(costToFillTank(50, 98, 8.09)).toBeNull();
  });

  it('says nothing without a usable tank size or price', () => {
    expect(costToFillTank(0, 40, 8.09)).toBeNull();
    expect(costToFillTank(null, 40, 8.09)).toBeNull();
    expect(costToFillTank(50, 40, 0)).toBeNull();
  });

  it('treats an out-of-range percentage as empty rather than going negative', () => {
    expect(costToFillTank(50, -20, 10)).toEqual({ litres: 50, cost: 500 });
  });
});

/**
 * Trip fuel outlook. This tells a driver whether they can reach a destination,
 * so a false "you have enough" is the worst thing it could do.
 */
describe('tripFuelOutlook', () => {
  it('reports what is left when the tank covers the trip', () => {
    // 50L tank at 80% = 40L; a 25L trip leaves 15L, 30% of the tank.
    expect(tripFuelOutlook(50, 80, 25, 8.09)).toEqual({
      enough: true, litresLeft: 15, pctLeft: 30,
    });
  });

  it('prices the shortfall when it does not', () => {
    // 50L tank at 20% = 10L against a 25L trip -> 15L short.
    expect(tripFuelOutlook(50, 20, 25, 8)).toEqual({
      enough: false, shortfallL: 15, topUpCost: 120,
    });
  });

  it('counts an exactly-sufficient tank as enough', () => {
    // The boundary must not report a shortfall of zero litres.
    expect(tripFuelOutlook(50, 50, 25, 8)).toEqual({
      enough: true, litresLeft: 0, pctLeft: 0,
    });
  });

  it('says nothing without a tank size or a level', () => {
    expect(tripFuelOutlook(null, 80, 25, 8)).toBeNull();
    expect(tripFuelOutlook(50, null, 25, 8)).toBeNull();
    expect(tripFuelOutlook(50, undefined, 25, 8)).toBeNull();
  });

  it('says nothing when the trip or price is unusable', () => {
    expect(tripFuelOutlook(50, 80, 0, 8)).toBeNull();
    expect(tripFuelOutlook(50, 80, NaN, 8)).toBeNull();
    expect(tripFuelOutlook(50, 80, 25, 0)).toBeNull();
  });
});
