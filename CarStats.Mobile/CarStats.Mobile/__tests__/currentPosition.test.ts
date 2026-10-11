import * as Location from 'expo-location';
import { getCurrentPosition, resetAccuracyPromptForTests } from '@/services/currentPosition';

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getCurrentPositionAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
}));

const getPos = Location.getCurrentPositionAsync as jest.Mock;
const getLast = Location.getLastKnownPositionAsync as jest.Mock;
const fix = { coords: { latitude: 32.43, longitude: 34.93 } };
const recentFix = { coords: { latitude: 32.44, longitude: 34.92 } };

beforeEach(() => {
  getPos.mockReset();
  getLast.mockReset().mockResolvedValue(null);   // no recent fix unless a test says so
  resetAccuracyPromptForTests();
});

describe('getCurrentPosition', () => {
  it('asks normally first, so Android can offer to turn on Location Accuracy', async () => {
    getPos.mockResolvedValueOnce(fix);
    await expect(getCurrentPosition()).resolves.toBe(fix);
    expect(getPos).toHaveBeenCalledTimes(1);
    expect(getPos.mock.calls[0][0].mayShowUserSettingsDialog).toBeUndefined();
  });

  it('after "No thanks", still gets a fix from the GPS alone', async () => {
    getPos.mockRejectedValueOnce(new Error('settings unsatisfied')).mockResolvedValueOnce(fix);
    await expect(getCurrentPosition()).resolves.toBe(fix);
    expect(getPos).toHaveBeenCalledTimes(2);
    expect(getPos.mock.calls[1][0].mayShowUserSettingsDialog).toBe(false);
  });

  it('does not show the prompt again once it was declined', async () => {
    getPos.mockRejectedValueOnce(new Error('settings unsatisfied')).mockResolvedValue(fix);
    await getCurrentPosition();
    getPos.mockClear();

    await getCurrentPosition();
    expect(getPos).toHaveBeenCalledTimes(1);
    expect(getPos.mock.calls[0][0].mayShowUserSettingsDialog).toBe(false);
  });

  it('after "No thanks", a fix from the last two minutes is used at once instead of waiting for the GPS', async () => {
    getPos.mockRejectedValueOnce(new Error('settings unsatisfied'));
    getLast.mockResolvedValueOnce(recentFix);
    await expect(getCurrentPosition()).resolves.toBe(recentFix);
    expect(getLast.mock.calls[0][0].maxAge).toBe(2 * 60 * 1000);
    expect(getPos).toHaveBeenCalledTimes(1);   // only the declined attempt
  });

  it('gives up on a GPS that never answers, so the caller can use the last known spot', async () => {
    jest.useFakeTimers();
    try {
      getPos.mockRejectedValueOnce(new Error('settings unsatisfied'))
        .mockReturnValueOnce(new Promise(() => {}));   // GPS that never answers
      const result = getCurrentPosition();
      const assertion = expect(result).rejects.toThrow('No GPS fix in time');
      await jest.advanceTimersByTimeAsync(10_000);
      await assertion;
    } finally {
      jest.useRealTimers();
    }
  });
});
