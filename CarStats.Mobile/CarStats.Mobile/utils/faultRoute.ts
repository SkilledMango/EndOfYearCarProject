import type { CarIdentity } from '@/services/api';

// type ולא interface: הנתב של expo-router דורש אובייקט פתוח
export type FaultParams = {
  code: string;
  make?: string;
  model?: string;
  year?: string;
};

export function faultParams(code: string, car?: CarIdentity | null): FaultParams {
  if (!car?.make || !car.model || !(car.year > 0)) return { code };
  return { code, make: car.make, model: car.model, year: String(car.year) };
}
