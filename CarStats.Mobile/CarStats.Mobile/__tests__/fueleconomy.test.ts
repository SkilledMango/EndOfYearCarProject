/**
 * Fuel-economy conversions and the Hebrew fuel-type fallback.
 *
 * These feed the consumption figure the whole fuel estimate is built on, so a
 * wrong number here propagates silently into the range and refuel warnings.
 */

import { mpgToL100km, suggestL100kmByFuelType } from '@/services/fueleconomy';

describe('mpgToL100km', () => {
  it('converts using the standard 235.214 constant', () => {
    // 30 US MPG ≈ 7.8 L/100km
    expect(mpgToL100km(30)).toBeCloseTo(7.8, 1);
    // 25 US MPG ≈ 9.4 L/100km
    expect(mpgToL100km(25)).toBeCloseTo(9.4, 1);
  });

  it('rounds to one decimal place', () => {
    const value = mpgToL100km(23);
    expect(value).toBe(Math.round(value * 10) / 10);
  });

  it('returns 0 rather than Infinity for zero MPG', () => {
    // Guards a divide-by-zero that would otherwise render "Infinity L/100km".
    expect(mpgToL100km(0)).toBe(0);
  });

  it('returns 0 for negative or missing input', () => {
    expect(mpgToL100km(-5)).toBe(0);
    expect(mpgToL100km(NaN)).toBe(0);
    expect(mpgToL100km(undefined as unknown as number)).toBe(0);
  });

  it('is monotonic — better MPG always means fewer litres', () => {
    expect(mpgToL100km(40)).toBeLessThan(mpgToL100km(20));
  });
});

describe('suggestL100kmByFuelType', () => {
  it('returns null for a full-electric vehicle', () => {
    // BEVs have no L/100km; null tells the caller to skip litre-based estimates.
    expect(suggestL100kmByFuelType('חשמל')).toBeNull();
  });

  it('does NOT treat a plug-in hybrid as full electric', () => {
    // Both strings contain חשמל — the בנזין check is what separates them.
    expect(suggestL100kmByFuelType('חשמל/בנזין')).toBe(2.5);
  });

  it('recognises both spellings of conventional hybrid', () => {
    expect(suggestL100kmByFuelType('היברידי')).toBe(5.5);
    expect(suggestL100kmByFuelType('כלאיים')).toBe(5.5);
  });

  it('recognises diesel and gas', () => {
    expect(suggestL100kmByFuelType('דיזל')).toBe(6.0);
    expect(suggestL100kmByFuelType('גז')).toBe(9.5);
  });

  it('defaults to petrol for a plain or unrecognised type', () => {
    expect(suggestL100kmByFuelType('בנזין')).toBe(8.5);
    expect(suggestL100kmByFuelType('something unexpected')).toBe(8.5);
  });

  it('defaults to petrol for an empty string', () => {
    expect(suggestL100kmByFuelType('')).toBe(8.5);
  });
});
