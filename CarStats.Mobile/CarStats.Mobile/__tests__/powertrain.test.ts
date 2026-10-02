import {
  capacityLabel,
  consumptionUnit,
  electricFromRegistry,
  energyUnit,
  isPlausibleCapacity,
} from '@/utils/powertrain';

describe('electricFromRegistry', () => {
  it('recognises a fully electric car', () => {
    expect(electricFromRegistry('חשמל')).toBe(true);
  });

  it('treats petrol and diesel as fuel cars', () => {
    expect(electricFromRegistry('בנזין')).toBe(false);
    expect(electricFromRegistry('דיזל')).toBe(false);
  });

  it('treats a plug-in hybrid as a fuel car — it still refuels at a pump', () => {
    expect(electricFromRegistry('חשמל/בנזין')).toBe(false);
  });

  it('returns null when the registry has no fuel type, so the next source decides', () => {
    expect(electricFromRegistry('')).toBeNull();
    expect(electricFromRegistry('   ')).toBeNull();
    expect(electricFromRegistry(undefined)).toBeNull();
  });
});

describe('units', () => {
  it('swaps litres for kWh on an electric car', () => {
    expect(energyUnit(true)).toBe('kWh');
    expect(energyUnit(false)).toBe('L');
    expect(consumptionUnit(true)).toBe('kWh/100km');
    expect(consumptionUnit(false)).toBe('L/100km');
    expect(capacityLabel(true)).toBe('Battery size');
    expect(capacityLabel(false)).toBe('Tank size');
  });
});

describe('isPlausibleCapacity', () => {
  it('accepts real tank and battery sizes', () => {
    expect(isPlausibleCapacity(50, false)).toBe(true);
    expect(isPlausibleCapacity(75, true)).toBe(true);
  });

  it('rejects sizes no real car has', () => {
    expect(isPlausibleCapacity(5, false)).toBe(false);
    expect(isPlausibleCapacity(500, true)).toBe(false);
    expect(isPlausibleCapacity(NaN, false)).toBe(false);
  });

  it('judges the same number differently for each powertrain', () => {
    // 15 is a tiny battery but no fuel tank is that small
    expect(isPlausibleCapacity(15, true)).toBe(true);
    expect(isPlausibleCapacity(15, false)).toBe(false);
  });
});
