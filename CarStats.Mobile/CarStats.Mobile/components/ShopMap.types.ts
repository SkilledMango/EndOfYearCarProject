/** מאפיינים משותפים לשתי גרסאות המפה: הנייטיב והווב. */

export interface ShopPin {
  id: number | string; // המזהה של Google עבור מוסך אמיתי
  name: string;
  specialty: string;
  latitude: number;
  longitude: number;
}

export interface ShopMapProps {
  /** מוסכים עם קואורדינטות תקינות בלבד */
  shops: ShopPin[];
  userPos: { lat: number; lng: number } | null;
}
