import { fuelTileNote } from '@/utils/fuel';

describe('fuelTileNote', () => {
  it('blames the car only when the car itself said it has no fuel level', () => {
    expect(fuelTileNote({ isElectric: false, fuelSupported: false, hasEstimate: false }))
      .toBe("⚠ This car doesn't report its fuel level over OBD-II");
  });

  it('a missing reading from a car that may report it is "waiting", not "unsupported"', () => {
    for (const fuelSupported of [true, null, undefined]) {
      const note = fuelTileNote({ isElectric: false, fuelSupported, hasEstimate: false });
      expect(note).toBe("Waiting for the car's fuel level reading…");
      expect(note).not.toMatch(/doesn't report/);
    }
  });

  it('says when an estimate is shown instead', () => {
    expect(fuelTileNote({ isElectric: false, fuelSupported: false, hasEstimate: true }))
      .toMatch(/using estimate$/);
    expect(fuelTileNote({ isElectric: false, fuelSupported: null, hasEstimate: true }))
      .toBe("Waiting for the car's fuel level reading — using estimate");
  });

  it('talks about the battery for an electric car', () => {
    expect(fuelTileNote({ isElectric: true, fuelSupported: false, hasEstimate: false }))
      .toBe("⚠ This car doesn't report its battery level over OBD-II");
  });
});
