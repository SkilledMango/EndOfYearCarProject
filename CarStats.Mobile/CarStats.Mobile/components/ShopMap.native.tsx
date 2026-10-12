import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import type { ShopMapProps } from './ShopMap.types';

// הסיכות הן תמונות: באנדרואיד סיכה שבנויה מרכיבים נחתכת
const PIN_SHOP     = require('@/assets/images/pin-shop.png');
const PIN_SHOP_ALT = require('@/assets/images/pin-shop-alt.png');
const PIN_BRAND    = require('@/assets/images/pin-brand.png');

const DEFAULT_REGION = {
  latitude: 32.08,
  longitude: 34.78,
  latitudeDelta: 0.25,
  longitudeDelta: 0.25,
};

// איתור: המפה עם סיכות המוסכים
export default function ShopMap({ shops, userPos }: ShopMapProps) {
  const mapRef = useRef<MapView>(null);
  // באנדרואיד ממסגרים את המפה רק אחרי שהיא מוכנה
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!mapReady || shops.length === 0) return;
    const coords = shops.map(s => ({ latitude: s.latitude, longitude: s.longitude }));
    if (userPos) coords.push({ latitude: userPos.lat, longitude: userPos.lng });
    mapRef.current?.fitToCoordinates(coords, {
      edgePadding: { top: 60, bottom: 60, left: 60, right: 60 },
      animated: false,
    });
  }, [mapReady, shops, userPos]);

  return (
    <MapView
      ref={mapRef}
      style={styles.map}
      initialRegion={DEFAULT_REGION}
      onMapReady={() => setMapReady(true)}
      showsUserLocation
      showsMyLocationButton={false}
      toolbarEnabled={false}
    >
      {shops.map((shop, i) => (
        <Marker
          key={shop.id}
          coordinate={{ latitude: shop.latitude, longitude: shop.longitude }}
          title={shop.name}
          description={shop.specialty}
          anchor={{ x: 0.5, y: 0.5 }}
          image={shop.highlighted ? PIN_BRAND : i % 2 === 1 ? PIN_SHOP_ALT : PIN_SHOP}
          zIndex={shop.highlighted ? 1 : 0}
        />
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
});
