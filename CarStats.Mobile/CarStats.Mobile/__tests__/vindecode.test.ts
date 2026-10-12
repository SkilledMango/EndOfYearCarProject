import { vinMatchesVehicle, VinDecodeResult } from '@/services/vindecode';
import { Vehicle } from '@/services/api';

function decoded(make: string, model: string, year: number): VinDecodeResult {
  return { vin: '1HGCM82633A004352', make, model, year };
}

function garage(make: string, model: string, year: number): Vehicle {
  return { id: 1, make, model, year, licensePlate: '12-345-67', averageFuelConsumption: 7, appUserId: 1 } as Vehicle;
}

describe('vinMatchesVehicle', () => {
  it('matches an exact make/model/year', () => {
    expect(vinMatchesVehicle(decoded('Toyota', 'Corolla', 2019), garage('Toyota', 'Corolla', 2019)))
      .toBe(true);
  });

  it('ignores case differences', () => {
    expect(vinMatchesVehicle(decoded('KIA', 'SPORTAGE', 2020), garage('Kia', 'Sportage', 2020)))
      .toBe(true);
  });

  it('ignores spaces, hyphens and underscores', () => {
    expect(vinMatchesVehicle(decoded('Mercedes-Benz', 'C Class', 2018), garage('Mercedes Benz', 'C-Class', 2018)))
      .toBe(true);
  });

  it('matches when one name contains the other', () => {
    expect(vinMatchesVehicle(decoded('Toyota', 'Corolla', 2021), garage('Toyota', 'Corolla Cross', 2021)))
      .toBe(true);
  });

  it('rejects a different year even when make and model agree', () => {
    expect(vinMatchesVehicle(decoded('Toyota', 'Corolla', 2019), garage('Toyota', 'Corolla', 2020)))
      .toBe(false);
  });

  it('rejects a different make', () => {
    expect(vinMatchesVehicle(decoded('Honda', 'Civic', 2019), garage('Toyota', 'Corolla', 2019)))
      .toBe(false);
  });

  it('skips the model check when the VIN decode returned no model', () => {
    expect(vinMatchesVehicle(decoded('Toyota', '', 2019), garage('Toyota', 'Corolla', 2019)))
      .toBe(true);
  });
});
