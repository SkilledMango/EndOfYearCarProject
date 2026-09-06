/**
 * ShopMap (iOS/Android) — the real map for the mechanic finder.
 * Circular wrench pins per the Stitch mechanic_finder export: filled primary
 * and outlined variants alternate. Frames itself around the pins + user.
 */

import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { createThemedStyles, useTheme } from '@/context/ThemeContext';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { ShopMapProps } from './ShopMap.types';

// Tel Aviv — sensible default region before pins are known
const DEFAULT_REGION = {
  latitude: 32.08,
  longitude: 34.78,
  latitudeDelta: 0.25,
  longitudeDelta: 0.25,
};

export default function ShopMap({ shops, userPos }: ShopMapProps) {
  const { colors: c } = useTheme();
  const styles = useStyles();
  const mapRef = useRef<MapView>(null);
  // On Android fitToCoordinates is a no-op until the map has laid itself out,
  // and it fails silently — the map simply stayed on the Tel Aviv default while
  // the list underneath showed results in Hadera. Waiting for onMapReady is
  // what makes the fit actually take.
  const [mapReady, setMapReady] = useState(false);

  // A pin drawn from child views is rasterised to a bitmap, and while this is
  // true it is re-rasterised on every render pass. Twenty of those allocate
  // faster than the GC frees them and the app dies with an OutOfMemoryError
  // inside the maps renderer. Turning it off outright is not the answer
  // either — the pin then never draws once and the map comes up bare. So it
  // stays on just long enough for the pins to appear, then stops.
  const [trackPins, setTrackPins] = useState(true);

  useEffect(() => {
    if (!mapReady || shops.length === 0) return;
    setTrackPins(true);
    const timer = setTimeout(() => setTrackPins(false), 1500);
    return () => clearTimeout(timer);
  }, [mapReady, shops]);

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
          tracksViewChanges={trackPins}
        >
          {/* Design alternates filled / outlined circular wrench pins */}
          <View style={[styles.pin, i % 2 === 1 && styles.pinOutlined]}>
            <IconSymbol
              name="wrench.fill"
              size={18}
              color={i % 2 === 1 ? c.Dashboard.accentDeep : c.Dashboard.onAccent}
            />
          </View>
        </Marker>
      ))}
    </MapView>
  );
}

const useStyles = createThemedStyles((c) => StyleSheet.create({
  map: { flex: 1 },

  // 40px circles — filled primary / outlined white variants
  pin: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: c.Dashboard.accentDeep,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  pinOutlined: {
    backgroundColor: c.Dashboard.card,
    borderWidth: 2, borderColor: c.Dashboard.accentDeep,
  },
}));
