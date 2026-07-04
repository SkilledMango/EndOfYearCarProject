/**
 * Mechanic Finder — map + "Nearby Mechanics" bottom sheet.
 * Layout and values follow design/stitch_carstats_diagnostic_suite/mechanic_finder:
 * full-bleed map with circular wrench pins, and a rounded-top sheet listing
 * shops with specialty, star-rating chip, distance, and Call / Directions.
 * Shops come from the API; distances from the phone's location; coordinates
 * missing in the DB are geocoded from the address on-device.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ShopMap from '@/components/ShopMap';
import { MechanicShop, getShops } from '@/services/api';
import { createThemedStyles, useTheme } from '@/context/ThemeContext';
import { IconSymbol } from '@/components/ui/icon-symbol';

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
  const { colors: c } = useTheme();
  const styles = useStyles();
  const [shops, setShops]         = useState<LocatedShop[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [myPos, setMyPos]         = useState<{ lat: number; lng: number } | null>(null);

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
        <ActivityIndicator size="large" color={c.Dashboard.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ── Map (native) / placeholder (web) ── */}
      <View style={styles.mapArea}>
        <ShopMap shops={pinned} userPos={myPos} />
      </View>

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
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={c.Dashboard.accent} />
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
                  { backgroundColor: i % 2 === 0 ? c.Dashboard.accentDeep : c.Severity.green },
                ]} />
                <View style={styles.shopHeader}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={styles.shopName} numberOfLines={1}>{shop.name.trim()}</Text>
                    <Text style={styles.shopSpecialty}>Specialty: {shop.specialty || 'General'}</Text>
                  </View>
                  {shop.rating > 0 && (
                    <View style={styles.ratingChip}>
                      <IconSymbol name="star.fill" size={14} color={c.Fuel.starAmber} />
                      <Text style={styles.ratingValue}>
                        {shop.rating.toFixed(1)}{' '}
                        <Text style={styles.ratingCount}>({shop.reviewCount})</Text>
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.distanceRow}>
                  <IconSymbol name="location.fill" size={14} color={c.Dashboard.textSecondary} />
                  <Text style={styles.distanceText}>
                    {shop.distanceKm != null
                      ? `${shop.distanceKm.toFixed(1)} km away`
                      : shop.address}
                  </Text>
                </View>
                <View style={styles.actionsRow}>
                  <Pressable style={styles.callBtn} onPress={() => call(shop)}>
                    <IconSymbol name="phone.fill" size={20} color={c.Dashboard.accentDeep} />
                    <Text style={styles.callBtnText}>Call</Text>
                  </Pressable>
                  <Pressable style={styles.directionsBtn} onPress={() => directions(shop)}>
                    <IconSymbol name="arrow.triangle.turn.up.right.diamond.fill" size={20} color={c.Dashboard.onAccent} />
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

const useStyles = createThemedStyles((c) => StyleSheet.create({
  container:      { flex: 1, backgroundColor: c.Dashboard.bg },
  centered:       { justifyContent: 'center', alignItems: 'center' },
  mapArea:        { flex: 1 },

  // Bottom sheet
  sheet:          {
    height: '52%',
    backgroundColor: c.Dashboard.card,
    borderTopLeftRadius: 12, borderTopRightRadius: 12,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 24, shadowOffset: { width: 0, height: -8 },
    elevation: 12,
  },
  sheetHandle:    {
    width: 48, height: 4, borderRadius: 2,
    backgroundColor: c.Dashboard.cardBorder,
    alignSelf: 'center', marginVertical: 12,
  },
  sheetHeader:    {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    paddingHorizontal: 20, paddingBottom: 16,
  },
  sheetTitle:     { fontSize: 20, lineHeight: 28, fontWeight: '600', color: c.Dashboard.textPrimary },
  sheetCount:     { fontSize: 14, lineHeight: 20, color: c.Dashboard.textSecondary },
  sheetList:      { paddingHorizontal: 20, paddingBottom: 32, gap: 16 },

  // Shop cards
  shopCard:       {
    backgroundColor: c.Dashboard.card,
    borderRadius: 8,
    borderWidth: 1, borderColor: c.Dashboard.cardBorder,
    padding: 16,
    overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  shopAccentBar:  { position: 'absolute', left: 0, top: 0, bottom: 0, width: 2 },
  shopHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  shopName:       { fontSize: 24, lineHeight: 26, fontWeight: '700', color: c.Dashboard.textPrimary, marginBottom: 4 },
  shopSpecialty:  { fontSize: 14, lineHeight: 20, color: c.Dashboard.textSecondary },
  ratingChip:     {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: c.Dashboard.bg,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4,
  },
  ratingValue:    { fontSize: 12, fontWeight: '600', color: c.Dashboard.textPrimary },
  ratingCount:    { fontWeight: '400', color: c.Dashboard.textSecondary },
  distanceRow:    { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 16 },
  distanceText:   { fontSize: 14, lineHeight: 20, color: c.Dashboard.textSecondary, flex: 1 },

  actionsRow:     { flexDirection: 'row', gap: 12 },
  callBtn:        {
    flex: 1, height: 48, borderRadius: 8,
    backgroundColor: c.Fuel.chipBg,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  callBtnText:    { fontSize: 15, fontWeight: '700', color: c.Dashboard.accentDeep },
  directionsBtn:  {
    flex: 1, height: 48, borderRadius: 8,
    backgroundColor: c.Dashboard.accentDeep,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  directionsBtnText: { fontSize: 15, fontWeight: '700', color: c.Dashboard.onAccent },

  // Empty state
  emptyState:     { alignItems: 'center', paddingTop: 40 },
  emptyIcon:      { fontSize: 48 },
  emptyText:      { fontSize: 17, fontWeight: '600', color: c.Dashboard.textPrimary, marginTop: 12 },
  emptySubtext:   { fontSize: 13, color: c.Dashboard.textSecondary, marginTop: 6, textAlign: 'center' },
}));
