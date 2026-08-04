/**
 * Mechanic Finder — map + "Nearby Mechanics" bottom sheet.
 * Layout and values follow design/stitch_carstats_diagnostic_suite/mechanic_finder.
 *
 * Shops are LIVE results from Google Places (car_repair near the user),
 * fetched through the API's /navigation proxy — names, ratings and review
 * counts are real. Phone numbers are fetched lazily when the user taps Call.
 * With location denied, results center on Tel Aviv instead.
 */

import ShopMap from '@/components/ShopMap';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { createThemedStyles, useTheme } from '@/context/ThemeContext';
import { NearbyShop, getNearbyShops, getShopPhone } from '@/services/api';
import { loadPrefs } from '@/services/notifications';
import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SegmentedButtons } from 'react-native-paper';

// Search center when location permission is denied
const FALLBACK_CENTER = { lat: 32.0853, lng: 34.7818 }; // Tel Aviv

/** Which point the shop search is centred on. */
type SearchOrigin = 'current' | 'home';

interface LocatedShop extends NearbyShop {
  distanceKm: number | null;
}

/**
 * מרחק אווירי בק"מ לפי נוסחת ההברסין.
 * פיתגורס לא מתאים כאן — כדור הארץ עגול, ומעלות של קו אורך
 * מתקרבות זו לזו ככל שמתרחקים מקו המשווה.
 */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;                                    // רדיוס כדור הארץ בק"מ
  // המרת מעלות לרדיאנים — פונקציות הטריגונומטריה עובדות ברדיאנים
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  // הכפלת הקוסינוסים מתקנת את הפרש קווי האורך לפי קו הרוחב:
  // בקו המשווה מעלה אחת היא כ-111 ק"מ, וליד הקטבים כמעט כלום
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));   // מהזווית חזרה לק"מ
}

export default function MechanicFinderScreen() {
  const { colors: c } = useTheme();
  const styles = useStyles();
  const [shops, setShops]           = useState<LocatedShop[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [myPos, setMyPos]           = useState<{ lat: number; lng: number } | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  // ברירת מחדל 'home': קריאת כתובת שמורה מיידית, איכון עלול להיתקע.
  const [origin, setOrigin]         = useState<SearchOrigin>('home');
  const [hasHome, setHasHome]       = useState(false);
  // Phone numbers already looked up this session (placeId → phone | null)
  const phoneCache = useRef<Record<string, string | null>>({});
      
  const load = useCallback(async (isRefresh = false, mode: SearchOrigin = origin) => {
    if (isRefresh) setRefreshing(true); // origin = current location (home or current)
    try {
      let pos: { lat: number; lng: number } | null = null;

      if (mode === 'home') {
        const prefs = await loadPrefs(); //takes what home address is saved from settings
        if (prefs.homeLat != null && prefs.homeLng != null) {
          pos = { lat: prefs.homeLat, lng: prefs.homeLng }; // lattitude and longitude of home address
        }
      }

      if (!pos) { //(means the mode is current or we don't have a home address saved)
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            let coords = null;
            try {
              const loc = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
              });
              coords = loc.coords;
            } catch {
              // במקרה והמיקום של המכשיר לא זמין(כלומר חניון או משהו בסגנון) ניגש למיקום האחרון שהיה זמין
              const last = await Location.getLastKnownPositionAsync();
              coords = last?.coords ?? null;
            }
            if (coords) pos = { lat: coords.latitude, lng: coords.longitude };
          }
        } catch { /* המיקום לא זמין — נופלים לברירת המחדל */ }
      }

      if (mode === 'current') setMyPos(pos);
      setUsedFallback(!pos); //  records a plain boolean: did we end up with no position at all? if so, fallback = tel aviv

      const center = pos ?? FALLBACK_CENTER; // מרכז תל אביב אם אין מיקום
      const results = await getNearbyShops(center.lat, center.lng);

      setShops(results.map(shop => ({
        ...shop,
        distanceKm: pos ? haversineKm(pos.lat, pos.lng, shop.latitude, shop.longitude) : null, //פונקציה מחשבת את המרחק בין המיקום שלנו לבין החנות
      })));
    } catch { /* השרת לא זמין — משאירים את הרשימה הקודמת */ }
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [origin]);

  useEffect(() => { load(); }, [load]);

  useFocusEffect(
    useCallback(() => {
      loadPrefs().then(p => setHasHome(p.homeLat != null && p.homeLng != null));
    }, []),
  );

  const switchOrigin = (next: SearchOrigin) => {
    if (next === origin) return;
    setOrigin(next);
    setLoading(true);
    load(false, next);
  };

  const call = async (shop: LocatedShop) => {
    let phone = phoneCache.current[shop.placeId];
    if (phone === undefined) {
      try {
        phone = await getShopPhone(shop.placeId);
      } catch {
        phone = null;
      }
      phoneCache.current[shop.placeId] = phone;
    }
    if (phone) {
      Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`);
    } else {
      Alert.alert('No phone number', `${shop.name} has no phone number listed on Google Maps.`);
    }
  };

  const directions = (shop: LocatedShop) => {
    Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${shop.latitude},${shop.longitude}` +
      `&destination_place_id=${encodeURIComponent(shop.placeId)}&travelmode=driving`,
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
        <ShopMap
          shops={shops.map(s => ({
            id: s.placeId,
            name: s.name,
            specialty: s.address,
            latitude: s.latitude,
            longitude: s.longitude,
          }))}
          userPos={myPos}
        />
      </View>

      {/* ── Bottom sheet ── */}
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Nearby Mechanics</Text>
          <Text style={styles.sheetCount}>{shops.length} found</Text>
        </View>
        {hasHome && (
          <SegmentedButtons
            style={styles.originSwitch}
            density="small"
            value={origin}
            onValueChange={(v) => switchOrigin(v as SearchOrigin)}
            buttons={[
              { value: 'current', label: 'Near me',   icon: 'crosshairs-gps' },
              { value: 'home',    label: 'Near home', icon: 'home-outline'   },
            ]}
          />
        )}

        {usedFallback && (
          <Text style={styles.fallbackNote}>
            {origin === 'home'
              ? 'No home address saved — showing shops around Tel Aviv. Set one in Settings.'
              : 'Showing shops around Tel Aviv — enable location, or search near your home address instead.'}
          </Text>
        )}
        <ScrollView
          contentContainerStyle={styles.sheetList}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={c.Dashboard.accent} />
          }
        >
          {shops.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🔧</Text>
              <Text style={styles.emptyText}>No mechanics found nearby.</Text>
              <Text style={styles.emptySubtext}>Pull to refresh, or check your connection.</Text>
            </View>
          ) : (
            shops.map((shop, i) => (
              <View key={shop.placeId} style={styles.shopCard}>
                <View style={[
                  styles.shopAccentBar,
                  { backgroundColor: i % 2 === 0 ? c.Dashboard.accentDeep : c.Severity.green },
                ]} />
                <View style={styles.shopHeader}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={styles.shopName} numberOfLines={1}>{shop.name}</Text>
                    <Text style={styles.shopAddress} numberOfLines={1}>{shop.address}</Text>
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
                {shop.distanceKm != null && (
                  <View style={styles.distanceRow}>
                    <IconSymbol name="location.fill" size={14} color={c.Dashboard.textSecondary} />
                    <Text style={styles.distanceText}>{shop.distanceKm.toFixed(1)} km away</Text>
                  </View>
                )}
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
  originSwitch: { marginHorizontal: 20, marginBottom: 10 },
  fallbackNote:   {
    fontSize: 12, color: c.Dashboard.textSecondary,
    paddingHorizontal: 20, paddingBottom: 10, marginTop: -6,
  },
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
  shopName:       { fontSize: 20, lineHeight: 24, fontWeight: '700', color: c.Dashboard.textPrimary, marginBottom: 4 },
  shopAddress:    { fontSize: 14, lineHeight: 20, color: c.Dashboard.textSecondary },
  ratingChip:     {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: c.Dashboard.bg,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4,
  },
  ratingValue:    { fontSize: 12, fontWeight: '600', color: c.Dashboard.textPrimary },
  ratingCount:    { fontWeight: '400', color: c.Dashboard.textSecondary },
  distanceRow:    { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 16 },
  distanceText:   { fontSize: 14, lineHeight: 20, color: c.Dashboard.textSecondary, flex: 1 },

  actionsRow:     { flexDirection: 'row', gap: 12, marginTop: 4 },
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
