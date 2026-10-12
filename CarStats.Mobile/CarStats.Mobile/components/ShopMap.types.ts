export interface ShopPin {
  id: number | string;
  name: string;
  specialty: string;
  latitude: number;
  longitude: number;
  highlighted?: boolean;
}

export interface ShopMapProps {
  shops: ShopPin[];
  userPos: { lat: number; lng: number } | null;
}
