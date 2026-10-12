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
    expect(estimateFuelPercent({ baseline: baseline(), tripKm: 100, avgL100km: 8 })).toBe(44);
  });

  it('measures distance from the baseline, not from zero', () => {
    const b = baseline({ tripKm: 500 });
    expect(estimateFuelPercent({ baseline: b, tripKm: 600, avgL100km: 8 })).toBe(44);
  });

  it('survives a restart that restored a larger odometer', () => {
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
    expect(estimateFuelPercent({ baseline: baseline({ tankL: 0 }), tripKm: 500, avgL100km: 8 }))
      .toBe(60);
  });

  it('treats an odometer behind the baseline as no driving yet', () => {
    const b = baseline({ tripKm: 500 });
    expect(estimateFuelPercent({ baseline: b, tripKm: 100, avgL100km: 8 })).toBe(60);
  });

  it('returns whole numbers', () => {
    const value = estimateFuelPercent({ baseline: baseline(), tripKm: 37, avgL100km: 7.3 });
    expect(value).toBe(Math.round(value!));
  });
});

describe('fillUpCost', () => {
  it('multiplies litres by the pump rate', () => {
    expect(fillUpCost(45, 8.09)).toBe(364.05);
  });

  it('rounds to agorot rather than leaving floating-point dust', () => {
    expect(fillUpCost(33.3, 8.09)).toBe(269.4);
  });

  it('returns null for litres the user has not typed yet', () => {
    expect(fillUpCost(NaN, 8.09)).toBeNull();
    expect(fillUpCost(0, 8.09)).toBeNull();
    expect(fillUpCost(-5, 8.09)).toBeNull();
  });

  it('returns null rather than 0 when the price is unusable', () => {
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
      entry('2025-08-20T08:00:00.000Z', 999, 99),
    ], now);

    expect(spend.thisMonth).toBe(500);
    expect(spend.thisYear).toBe(900);
    expect(spend.monthChangePct).toBeCloseTo(25);
  });

  it('steps back across a year boundary for January', () => {
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
    expect(costPer100km([entry('2026-08-02T08:00:00.000Z', 320, 40, 8)])).toBe(64);
  });

  it('weights by distance instead of averaging the ratios', () => {
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

describe('costToFillTank', () => {
  it('prices the litres missing from the tank', () => {
    expect(costToFillTank(50, 40, 8.09)).toEqual({ litres: 30, cost: 242.7 });
  });

  it('says nothing when no baseline has been set', () => {
    expect(costToFillTank(50, null, 8.09)).toBeNull();
  });

  it('says nothing for a tank that is already full enough', () => {
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

describe('tripFuelOutlook', () => {
  it('reports what is left when the tank covers the trip', () => {
    expect(tripFuelOutlook(50, 80, 25, 8.09)).toEqual({
      enough: true, litresLeft: 15, pctLeft: 30,
    });
  });

  it('prices the shortfall when it does not', () => {
    expect(tripFuelOutlook(50, 20, 25, 8)).toEqual({
      enough: false, shortfallL: 15, topUpCost: 120,
    });
  });

  it('counts an exactly-sufficient tank as enough', () => {
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
