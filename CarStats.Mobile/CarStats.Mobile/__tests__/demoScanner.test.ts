import { demoDtcs, demoLiveData } from '@/services/demoScanner';

describe('demo mode matches the car type', () => {
  it('a fuel car gets engine and exhaust codes', () => {
    expect(demoDtcs().codes).toEqual(['P0300', 'P0420', 'P1450']);
  });

  it('an electric car gets battery and high-voltage codes, never engine ones', () => {
    const { codes } = demoDtcs(true);
    expect(codes).toEqual(['P0AA6', 'P0A80', 'P0A9C']);
    expect(codes.every(c => c.startsWith('P0A'))).toBe(true);
  });

  it('an electric motor does not idle — standing still means 0 rpm', () => {
    for (let i = 0; i < 20; i++) {
      const d = demoLiveData(true);
      expect(d.rpm).toBe(d.speedKmh * 85);
      expect(d.coolantCelsius).toBeLessThanOrEqual(34);   // battery temperature, not engine coolant
    }
  });

  it('a fuel engine idles above zero', () => {
    expect(demoLiveData().rpm).toBeGreaterThanOrEqual(750);
  });
});
