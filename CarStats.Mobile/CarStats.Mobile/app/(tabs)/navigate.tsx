/**
 * Mechanic Finder — map + "Nearby Mechanics" bottom sheet.
 * Layout and values follow design/stitch_carstats_diagnostic_suite/mechanic_finder:
 * full-bleed map with circular wrench pins, and a rounded-top sheet listing
 * shops with specialty, star-rating chip, distance, and Call / Directions.
 * Shops come from the API; distances from the phone's location; coordinates
 * missing in the DB are geocoded from the address on-device.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MechanicShop, getShops } from '@/services/api';
import { Dashboard, Fuel, Severity } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';

// Tel Aviv — sensible default region when location permission is denied
const DEFAULT_REGION = {
  latitude: 32.08,
  longitude: 34.78,
  latitudeDelta: 0.25,
  longitudeDelta: 0.25,
};

const GEOCODE_CACHE_KEY = 'shop_geocode_cache_v1';

interface LocatedShop extends MechanicShop {
  distanceKm: number | null;
}

/** Great-circle distance in km. */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function MechanicFinderScreen() {
  const [shops, setShops]         = useState<LocatedShop[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [myPos, setMyPos]         = useState<{ lat: number; lng: number } | null>(null);
  const mapRef = useRef<MapView>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      // Ask for location first (non-fatal if denied — distances just hide)
      let pos: { lat: number; lng: number } | null = null;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          pos = { lat: loc.coords.latitude, lng: loc.coords.longitude };
          setMyPos(pos);
        }
      } catch { /* location unavailable */ }

      const raw = await getShops();

      // Fill in missing coordinates by geocoding the address on-device,
      // cached so each address is only geocoded once.
      let cache: Record<string, { lat: number; lng: number }> = {};
      try {
        cache = JSON.parse((await AsyncStorage.getItem(GEOCODE_CACHE_KEY)) ?? '{}');
      } catch { /* corrupted cache — rebuild */ }
      let cacheDirty = false;

      const located: LocatedShop[] = [];
      for (const shop of raw) {
        let lat = shop.latitude;
        let lng = shop.longitude;
        if (lat === 0 && lng === 0 && shop.address.trim()) {
          const cached = cache[shop.address];
          if (cached) {
            ({ lat, lng } = cached);
          } else {
            try {
              const results = await Location.geocodeAsync(shop.address);
              if (results[0]) {
                lat = results[0].latitude;
                lng = results[0].longitude;
                cache[shop.address] = { lat, lng };
                cacheDirty = true;
              }
            } catch { /* geocoder unavailable — pin stays hidden */ }
          }
        }
        located.push({
          ...shop,
          latitude: lat,
          longitude: lng,
          distanceKm: pos && !(lat === 0 && lng === 0)
            ? haversineKm(pos.lat, pos.lng, lat, lng)
            : null,
        });
      }
      if (cacheDirty) {
        try { await AsyncStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache)); } catch {}
      }

      located.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
      setShops(located);
    } catch { /* API unreachable — keep previous list */ }
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pinned = useMemo(
    () => shops.filter(s => !(s.latitude === 0 && s.longitude === 0)),
    [shops],
  );

  // Frame the map around the pins (and the user) once they're known
  useEffect(() => {
    if (pinned.length === 0) return;
    const coords = pinned.map(s => ({ latitude: s.latitude, longitude: s.longitude }));
    if (myPos) coords.push({ latitude: myPos.lat, longitude: myPos.lng });
    mapRef.current?.fitToCoordinates(coords, {
      edgePadding: { top: 60, bottom: 60, left: 60, right: 60 },
      animated: false,
    });
  }, [pinned, myPos]);

  const call = (shop: MechanicShop) => {
    if (shop.phoneNumber) Linking.openURL(`tel:${shop.phoneNumber}`);
  };

  const directions = (shop: LocatedShop) => {
    const dest = !(shop.latitude === 0 && shop.longitude === 0)
      ? `${shop.latitude},${shop.longitude}`
      : shop.address;
    Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving`,
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={Dashboard.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ── Map ── */}
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={DEFAULT_REGION}
        showsUserLocation
        showsMyLocationButton={false}
        toolbarEnabled={false}
      >
        {pinned.map((shop, i) => (
          <Marker
            key={shop.id}
            coordinate={{ latitude: shop.latitude, longitude: shop.longitude }}
            title={shop.name}
            description={shop.specialty}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            {/* Design alternates filled / outlined circular wrench pins */}
            <View style={[styles.pin, i % 2 === 1 && styles.pinOutlined]}>
              <IconSymbol
                name="wrench.fill"
                size={18}
                color={i % 2 === 1 ? Dashboard.accentDeep : '#FFFFFF'}
              />
            </View>
          </Marker>
        ))}
      </MapView>

      {/* ── Bottom sheet ── */}
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Nearby Mechanics</Text>
          <Text style={styles.sheetCount}>{shops.length} found</Text>
        </View>
        <ScrollView
          contentContainerStyle={styles.sheetList}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Dashboard.accent} />
          }
        >
          {shops.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🔧</Text>
              <Text style={styles.emptyText}>No mechanics listed yet.</Text>
              <Text style={styles.emptySubtext}>Shops added in the admin panel will appear here.</Text>
            </View>
          ) : (
            shops.map((shop, i) => (
              <View key={shop.id} style={styles.shopCard}>
                <View style={[
                  styles.shopAccentBar,
                  { backgroundColor: i % 2 === 0 ? Dashboard.accentDeep : Severity.green },
                ]} />
                <View style={styles.shopHeader}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={styles.shopName} numberOfLines={1}>{shop.name.trim()}</Text>
                    <Text style={styles.shopSpecialty}>Specialty: {shop.specialty || 'General'}</Text>
                  </View>
                  {shop.rating > 0 && (
                    <View style={styles.ratingChip}>
                      <IconSymbol name="star.fill" size={14} color={Fuel.starAmber} />
                      <Text style={styles.ratingValue}>
                        {shop.rating.toFixed(1)}{' '}
                        <Text style={styles.ratingCount}>({shop.reviewCount})</Text>
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.distanceRow}>
                  <IconSymbol name="location.fill" size={14} color={Dashboard.textSecondary} />
                  <Text style={styles.distanceText}>
                    {shop.distanceKm != null
                      ? `${shop.distanceKm.toFixed(1)} km away`
                      : shop.address}
                  </Text>
                </View>
                <View style={styles.actionsRow}>
                  <Pressable style={styles.callBtn} onPress={() => call(shop)}>
                    <IconSymbol name="phone.fill" size={20} color={Dashboard.accentDeep} />
                    <Text style={styles.callBtnText}>Call</Text>
                  </Pressable>
                  <Pressable style={styles.directionsBtn} onPress={() => directions(shop)}>
                    <IconSymbol name="arrow.triangle.turn.up.right.diamond.fill" size={20} color="#FFFFFF" />
                    <Text style={styles.directionsBtnText}>Directions</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </View>
  );
}

// ─── Styles (values from the mechanic_finder Stitch export) ───────────────────

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: Dashboard.bg },
  centered:       { justifyContent: 'center', alignItems: 'center' },
  map:            { flex: 1 },

  // Map pins: 40px circles — filled primary / outlined white variants
  pin:            {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Dashboard.accentDeep,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  pinOutlined:    {
    backgroundColor: Dashboard.card,
    borderWidth: 2, borderColor: Dashboard.accentDeep,
  },

  // Bottom sheet
  sheet:          {
    height: '52%',
    backgroundColor: Dashboard.card,
    borderTopLeftRadius: 12, borderTopRightRadius: 12,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 24, shadowOffset: { width: 0, height: -8 },
    elevation: 12,
  },
  sheetHandle:    {
    width: 48, height: 4, borderRadius: 2,
    backgroundColor: Dashboard.cardBorder,
    alignSelf: 'center', marginVertical: 12,
  },
  sheetHeader:    {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    paddingHorizontal: 20, paddingBottom: 16,
  },
  sheetTitle:     { fontSize: 20, lineHeight: 28, fontWeight: '600', color: Dashboard.textPrimary },
  sheetCount:     { fontSize: 14, lineHeight: 20, color: Dashboard.textSecondary },
  sheetList:      { paddingHorizontal: 20, paddingBottom: 32, gap: 16 },

  // Shop cards
  shopCard:       {
    backgroundColor: Dashboard.card,
    borderRadius: 8,
    borderWidth: 1, borderColor: Dashboard.cardBorder,
    padding: 16,
    overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  shopAccentBar:  { position: 'absolute', left: 0, top: 0, bottom: 0, width: 2 },
  shopHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  shopName:       { fontSize: 24, lineHeight: 26, fontWeight: '700', color: Dashboard.textPrimary, marginBottom: 4 },
  shopSpecialty:  { fontSize: 14, lineHeight: 20, color: Dashboard.textSecondary },
  ratingChip:     {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Dashboard.bg,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4,
  },
  ratingValue:    { fontSize: 12, fontWeight: '600', color: Dashboard.textPrimary },
  ratingCount:    { fontWeight: '400', color: Dashboard.textSecondary },
  distanceRow:    { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 16 },
  distanceText:   { fontSize: 14, lineHeight: 20, color: Dashboard.textSecondary, flex: 1 },

  actionsRow:     { flexDirection: 'row', gap: 12 },
  callBtn:        {
    flex: 1, height: 48, borderRadius: 8,
    backgroundColor: Fuel.chipBg,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  callBtnText:    { fontSize: 15, fontWeight: '700', color: Dashboard.accentDeep },
  directionsBtn:  {
    flex: 1, height: 48, borderRadius: 8,
    backgroundColor: Dashboard.accentDeep,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  directionsBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },

  // Empty state
  emptyState:     { alignItems: 'center', paddingTop: 40 },
  emptyIcon:      { fontSize: 48 },
  emptyText:      { fontSize: 17, fontWeight: '600', color: Dashboard.textPrimary, marginTop: 12 },
  emptySubtext:   { fontSize: 13, color: Dashboard.textSecondary, marginTop: 6, textAlign: 'center' },
});
