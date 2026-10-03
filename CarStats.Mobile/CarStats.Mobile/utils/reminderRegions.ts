/**
 * העיגולים שתזכורת בטיחות הילדים עוקבת אחריהם: בית, עבודה, או שניהם.
 *
 * כל עיגול נושא שם ("home" / "work"), ומערכת ההפעלה מחזירה את השם כשנכנסים
 * אליו — כך ההתראה יודעת לומר "הגעת הביתה" או "הגעת לעבודה".
 */

import type { LocationRegion } from 'expo-location';

export type ReminderPlace = 'home' | 'work';

/** מרחק ההגעה: מספיק גדול לחניה ברחוב סמוך, מספיק קטן כדי לא לצפצף בדרך. */
export const REMINDER_RADIUS_METERS = 150;

export interface SavedPlaces {
  homeLat: number | null;
  homeLng: number | null;
  workLat: number | null;
  workLng: number | null;
}

/** העיגולים למעקב — רק המקומות שנשמרו. רשימה ריקה = אין מה לעקוב. */
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

/**
 * לאיזה מקום שייך העיגול שנכנסו אליו.
 * null לעיגול בלי שם — כזה שנרשם לפני שנוסף מקום העבודה.
 */
export function placeFromRegion(identifier: string | undefined): ReminderPlace | null {
  return identifier === 'home' || identifier === 'work' ? identifier : null;
}
