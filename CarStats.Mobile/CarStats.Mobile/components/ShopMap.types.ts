/** Shared props for the platform-split ShopMap (native map / web placeholder). */

export interface ShopPin {
  id: number | string; // Google place_id for live shops
  name: string;
  specialty: string;
  latitude: number;
  longitude: number;
}

export interface ShopMapProps {
  /** Shops with usable coordinates (0,0 entries already filtered out) */
  shops: ShopPin[];
  userPos: { lat: number; lng: number } | null;
}
