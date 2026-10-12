export const FALLBACK_ELECTRICITY_PER_KWH = 0.65;

// איתור: זיהוי רכב חשמלי
// null כשהשדה ריק; פלאג-אין היברידי נחשב רכב דלק
export function electricFromRegistry(hebrewFuelType: string | null | undefined): boolean | null {
  const fuel = (hebrewFuelType ?? '').trim();
  if (!fuel) return null;
  return fuel.includes('חשמל') && !fuel.includes('בנזין') && !fuel.includes('דיזל');
}

export const energyUnit = (isElectric: boolean): string => (isElectric ? 'kWh' : 'L');

export const consumptionUnit = (isElectric: boolean): string =>
  isElectric ? 'kWh/100km' : 'L/100km';

export const capacityLabel = (isElectric: boolean): string =>
  isElectric ? 'Battery size' : 'Tank size';

export const levelLabel = (isElectric: boolean): string => (isElectric ? 'Battery' : 'Fuel');

export function isPlausibleCapacity(value: number, isElectric: boolean): boolean {
  if (!Number.isFinite(value)) return false;
  return isElectric ? value >= 10 && value <= 200 : value >= 20 && value <= 150;
}
