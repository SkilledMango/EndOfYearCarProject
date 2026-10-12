import type { LocationRegion } from 'expo-location';

export type ReminderPlace = 'home' | 'work';

export const REMINDER_RADIUS_METERS = 150;

export interface SavedPlaces {
  homeLat: number | null;
  homeLng: number | null;
  workLat: number | null;
  workLng: number | null;
}

// איתור: תזכורת ילד ברכב - אזורי הבית והעבודה
export function reminderRegions(places: SavedPlaces): LocationRegion[] {
  const regions: LocationRegion[] = [];
  const add = (identifier: ReminderPlace, lat: number | null, lng: number | null) => {
    if (lat == null || lng == null) return;
    regions.push({
      identifier,
      latitude: lat,
      longitude: lng,
      radius: REMINDER_RADIUS_METERS,
      notifyOnEnter: true,
      notifyOnExit: false,
    });
  };
  add('home', places.homeLat, places.homeLng);
  add('work', places.workLat, places.workLng);
  return regions;
}

export function placeFromRegion(identifier: string | undefined): ReminderPlace | null {
  return identifier === 'home' || identifier === 'work' ? identifier : null;
}
