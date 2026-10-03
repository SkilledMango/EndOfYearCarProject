import { ensureVehicleSpecs } from '@/services/vehicleSpecs';
import { Vehicle, VehicleSpecs, getVehicleSpecs, updateVehicle } from '@/services/api';
import { loadTankSize, saveTankSize } from '@/services/tankState';

jest.mock('@/services/api', () => ({
  getVehicleSpecs: jest.fn(),
  updateVehicle: jest.fn(),
}));
jest.mock('@/services/tankState', () => ({
  loadTankSize: jest.fn(),
  saveTankSize: jest.fn(),
}));

const mockSpecs  = getVehicleSpecs as jest.MockedFunction<typeof getVehicleSpecs>;
const mockUpdate = updateVehicle as jest.MockedFunction<typeof updateVehicle>;
const mockLoad   = loadTankSize as jest.MockedFunction<typeof loadTankSize>;

// every test uses its own id: the service only asks once per car per app session
const car = (id: number, extra: Partial<Vehicle> = {}): Vehicle => ({
  id, make: 'Tesla', model: 'Model 3', year: 2023, licensePlate: '1',
  averageFuelConsumption: 14, isElectric: false, tankCapacity: 0, appUserId: 1,
  ...extra,
});

const specs = (extra: Partial<VehicleSpecs>): VehicleSpecs => ({
  isElectric: null, powertrain: 'unknown', tankCapacity: null, consumption: null, source: 'groq',
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdate.mockResolvedValue();
  mockLoad.mockResolvedValue(null);
});

describe('ensureVehicleSpecs', () => {
  it('fills in the tank size of an older fuel car', async () => {
    mockSpecs.mockResolvedValue(specs({ isElectric: false, powertrain: 'petrol', tankCapacity: 43 }));
    const result = await ensureVehicleSpecs(car(1, { make: 'Toyota', model: 'Corolla' }));
    expect(result.tankCapacity).toBe(43);
    expect(result.isElectric).toBe(false);
    expect(saveTankSize).toHaveBeenCalledWith(43, 1);
  });

  it('can discover that an older car is electric', async () => {
    mockSpecs.mockResolvedValue(specs({ isElectric: true, powertrain: 'electric', tankCapacity: 60, consumption: 14 }));
    const result = await ensureVehicleSpecs(car(2));
    expect(result.isElectric).toBe(true);
    expect(result.tankCapacity).toBe(60);
  });

  it('never turns an electric car back into a fuel car', async () => {
    // the registry said electric; a wrong AI answer must not undo that
    mockSpecs.mockResolvedValue(specs({ isElectric: false, powertrain: 'petrol', tankCapacity: 50 }));
    const result = await ensureVehicleSpecs(car(3, { isElectric: true }));
    expect(result.isElectric).toBe(true);
    expect(result.tankCapacity).toBe(0);          // a litres figure is not a battery size
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('keeps a tank size the driver typed over the AI one', async () => {
    mockLoad.mockResolvedValue(38);
    mockSpecs.mockResolvedValue(specs({ isElectric: false, powertrain: 'petrol', tankCapacity: 50 }));
    const result = await ensureVehicleSpecs(car(4, { make: 'Kia', model: 'Picanto' }));
    expect(result.tankCapacity).toBe(38);
    expect(saveTankSize).not.toHaveBeenCalled();
  });

  it('leaves the car alone when it already has a size, or the AI has no answer', async () => {
    const known = car(5, { tankCapacity: 45 });
    expect(await ensureVehicleSpecs(known)).toBe(known);
    expect(mockSpecs).not.toHaveBeenCalled();

    mockSpecs.mockResolvedValue(null);
    const unknown = car(6);
    expect(await ensureVehicleSpecs(unknown)).toBe(unknown);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('asks about each car only once per session', async () => {
    mockSpecs.mockResolvedValue(null);
    await ensureVehicleSpecs(car(7));
    await ensureVehicleSpecs(car(7));
    expect(mockSpecs).toHaveBeenCalledTimes(1);
  });

  it('returns the car unchanged when the server update fails', async () => {
    mockSpecs.mockResolvedValue(specs({ isElectric: false, powertrain: 'petrol', tankCapacity: 43 }));
    mockUpdate.mockRejectedValue(new Error('offline'));
    const original = car(8, { make: 'Toyota', model: 'Corolla' });
    expect(await ensureVehicleSpecs(original)).toBe(original);
  });
});
