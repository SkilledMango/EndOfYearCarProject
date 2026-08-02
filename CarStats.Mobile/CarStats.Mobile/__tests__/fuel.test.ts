/**
 * Fuel estimation. This number drives the gauge and the low-fuel messaging,
 * and it is the fallback for every car that cannot report PID 0x2F — so it is
 * what most users actually see.
 */

import { estimateFuelPercent, FuelBaseline } from '@/utils/fuel';

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
