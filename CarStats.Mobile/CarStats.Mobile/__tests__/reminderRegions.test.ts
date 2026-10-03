import { REMINDER_RADIUS_METERS, placeFromRegion, reminderRegions } from '@/utils/reminderRegions';

const none = { homeLat: null, homeLng: null, workLat: null, workLng: null };
const home = { homeLat: 32.4332, homeLng: 34.9318 };
const work = { workLat: 32.0741, workLng: 34.7922 };

describe('reminderRegions', () => {
  it('watches nothing when no place is saved', () => {
    expect(reminderRegions(none)).toEqual([]);
  });

  it('watches only home, the way the reminder worked before', () => {
    const regions = reminderRegions({ ...none, ...home });
    expect(regions).toHaveLength(1);
    expect(regions[0]).toMatchObject({
      identifier: 'home', latitude: 32.4332, longitude: 34.9318,
      radius: REMINDER_RADIUS_METERS, notifyOnEnter: true, notifyOnExit: false,
    });
  });

  it('watches only work when that is the one saved', () => {
    const regions = reminderRegions({ ...none, ...work });
    expect(regions.map(r => r.identifier)).toEqual(['work']);
  });

  it('watches home and work together', () => {
    const regions = reminderRegions({ ...home, ...work });
    expect(regions.map(r => r.identifier)).toEqual(['home', 'work']);
  });

  it('ignores a half-saved place', () => {
    expect(reminderRegions({ ...none, workLat: 32.07 })).toEqual([]);
  });
});

describe('placeFromRegion', () => {
  it('tells home and work apart', () => {
    expect(placeFromRegion('home')).toBe('home');
    expect(placeFromRegion('work')).toBe('work');
  });

  it('returns null for an old circle saved without a name', () => {
    expect(placeFromRegion(undefined)).toBeNull();
    expect(placeFromRegion('3f2a9c-auto-generated')).toBeNull();
  });
});
