import { faultParams } from '@/utils/faultRoute';
import { cacheKey } from '@/services/dtcLookup';

jest.mock('@react-native-async-storage/async-storage', () => ({}));
jest.mock('@/services/api', () => ({ SeverityLevel: {}, explainFaultCode: jest.fn() }));

const tucson = { make: 'Hyundai', model: 'Tucson', year: 2019 };

describe('faultParams', () => {
  it('passes the car along when it is known', () => {
    expect(faultParams('P1326', tucson)).toEqual({ code: 'P1326', make: 'Hyundai', model: 'Tucson', year: '2019' });
  });

  it('sends only the code when there is no car — the screen works as before', () => {
    expect(faultParams('P1326')).toEqual({ code: 'P1326' });
    expect(faultParams('P1326', null)).toEqual({ code: 'P1326' });
  });

  it('ignores a half-known car instead of sending a broken one', () => {
    expect(faultParams('P1326', { make: 'Hyundai', model: '', year: 2019 })).toEqual({ code: 'P1326' });
    expect(faultParams('P1326', { make: 'Hyundai', model: 'Tucson', year: 0 })).toEqual({ code: 'P1326' });
  });
});

describe('cacheKey', () => {
  it('keeps the old key for explanations without a car', () => {
    expect(cacheKey('p1326')).toBe('@carstats_dtc_ai_P1326');
  });

  it('gives each car its own explanation of the same code', () => {
    const hyundai = cacheKey('P1326', tucson);
    const toyota  = cacheKey('P1326', { make: 'Toyota', model: 'Corolla', year: 2019 });
    expect(hyundai).not.toBe(toyota);
    expect(hyundai).not.toBe(cacheKey('P1326'));
  });

  it('does not care about letter case', () => {
    expect(cacheKey('p1326', { make: 'hyundai', model: 'tucson', year: 2019 })).toBe(cacheKey('P1326', tucson));
  });
});
