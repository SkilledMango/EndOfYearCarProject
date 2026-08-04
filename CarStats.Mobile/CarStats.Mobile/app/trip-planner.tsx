import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { useAuth } from '@/context/AuthContext';
import { api, FuelPrice, getFuelPrice, getUser, Vehicle } from '@/services/api';
import { createThemedStyles, useTheme } from '@/context/ThemeContext';
import {
  FALLBACK_FUEL_PRICES,
  FUEL_TYPE_LABELS,
  FuelType,
  tripFuelOutlook,
} from '@/utils/fuel';
import { TankLevel, loadFuelType, loadTankLevel, loadTankSize } from '@/services/tankState';
import { routeErrorMessage } from '@/utils/route';
import { PlaceSuggestion, usePlaceSuggestions } from '@/hooks/usePlaceSuggestions';
import { ThemeColors } from '@/constants/theme';

// Google calls go through our API's /navigation proxy: no CORS on Google's web
// services, and it keeps the API key off the client. The pump price is served
// too, because the regulated 95 price changes monthly.

// ─── Types ────────────────────────────────────────────────────────────────────
interface RouteResult {
  distanceKm:         number;
  durationMin:        number;
  durationTrafficMin: number;
  trafficRatio:       number;
  baseFuelL:          number;
  estimatedFuelL:     number;
  extraFuelL:         number;
  fuelCostILS:        number;
  trafficLabel:       string;
  trafficColor:       string;
  /** "lat,lng" of the start of the route as Google resolved it. */
  originLatLng:       string;
  /** "lat,lng" of the destination as Google resolved it. */
  destinationLatLng:  string;
  /** What Google matched the destination to, e.g. "AM:PM, Hadera". */
  destinationAddress: string;
  /** Exactly what the user typed. Shown in the UI, never sent to Maps. */
  destinationText:    string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function trafficMeta(c: ThemeColors, ratio: number): { label: string; color: string } {
  if (ratio < 1.1) return { label: 'CLEAR',    color: c.Severity.green  };
  if (ratio < 1.3) return { label: 'MODERATE', color: c.Severity.yellow };
  if (ratio < 1.6) return { label: 'HEAVY',    color: '#F97316'       };
  return               { label: 'SEVERE',   color: c.Severity.red    };
}

function calcFuelWithTraffic(
  distanceKm: number,
  durationSec: number,
  durationTrafficSec: number,
  avgL100: number,
) {
  const baseFuelL      = (distanceKm / 100) * avgL100;
  const trafficRatio   = durationSec > 0 ? durationTrafficSec / durationSec : 1;
  const trafficMult    = 1 + Math.max(0, (trafficRatio - 1) * 0.5);
  const estimatedFuelL = baseFuelL * trafficMult;
  return { baseFuelL, estimatedFuelL, extraFuelL: estimatedFuelL - baseFuelL, trafficRatio };
}

/**
 * Position for the route origin, or null if the device can offer none.
 * Falls back to the last known fix: getCurrentPositionAsync rejects outright
 * indoors or on a cold GPS, and a position from minutes ago barely moves the
 * estimate.
 */
async function getOriginCoords(): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return loc.coords;
  } catch (err) {
    console.warn('[trip-planner] no fresh fix, trying last known position', err);
  }

  try {
    const last = await Location.getLastKnownPositionAsync();
    if (last) return last.coords;
    console.warn('[trip-planner] no last known position either');
  } catch (err) {
    console.warn('[trip-planner] last known position failed', err);
  }

  return null;
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function TripPlannerScreen() {
  const { user: authUser }            = useAuth();
  const { colors: c } = useTheme();
  const styles = useStyles();
  const [vehicle, setVehicle]         = useState<Vehicle | null>(null);
  const [destination, setDestination] = useState('');
  // Empty means "use my current location".
  const [origin, setOrigin]           = useState('');
  const [fuelInput, setFuelInput]     = useState('8.0');
  const [loading, setLoading]         = useState(false);
  const [result, setResult]           = useState<RouteResult | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const { suggestions, visible: showSuggestions, search, clear } = usePlaceSuggestions();
  const inputRef = useRef<TextInput>(null);

  const [fuelPrice, setFuelPrice] = useState<FuelPrice | null>(null);
  // Priced by what the car burns — diesel differs from petrol by ~40%.
  const [fuelType, setFuelType]   = useState<FuelType>('95');
  const pricePerLitre =
    fuelPrice?.prices?.find(p => p.fuelType === fuelType)?.pricePerLitreILS ??
    FALLBACK_FUEL_PRICES[fuelType];

  useEffect(() => {
    if (!authUser) return;
    getUser(authUser.id).then(u => {
      const v = u?.vehicles?.[0] ?? null;
      setVehicle(v);
      if (v?.averageFuelConsumption && v.averageFuelConsumption > 0)
        setFuelInput(v.averageFuelConsumption.toFixed(1));
    }).catch(() => {});
  }, [authUser]);

  // Separate from the vehicle load so a price failure can't cost the
  // screen its consumption figure.
  useEffect(() => {
    getFuelPrice().then(setFuelPrice);
  }, []);

  const [tankLevel, setTankLevel] = useState<TankLevel | null>(null);
  const [tankL, setTankL]         = useState<number | null>(null);

  useEffect(() => {
    loadTankLevel(vehicle?.id).then(setTankLevel);
    loadTankSize(vehicle?.id).then(setTankL);
    loadFuelType(vehicle?.id).then(setFuelType);
  }, [vehicle?.id]);

  // Gated on isReal: "you'll make it" should rest on a measurement, not an
  // estimate from a baseline typed days ago.
  const outlook =
    result && tankLevel?.isReal
      ? tripFuelOutlook(tankL, tankLevel.pct, result.estimatedFuelL, pricePerLitre)
      : null;

  const onDestinationChange = (text: string) => {
    setDestination(text);
    setResult(null);
    setError(null);
    search(text);
  };

  const onPickSuggestion = (suggestion: PlaceSuggestion) => {
    setDestination(suggestion.description);
    clear();
    inputRef.current?.blur();
  };

  // ── Route calculation ─────────────────────────────────────────────────────
  const handleCalculate = async () => {
    clear();
    if (!destination.trim()) { setError('Please enter a destination.'); return; }
    const avgL100 = parseFloat(fuelInput);
    if (isNaN(avgL100) || avgL100 <= 0) { setError('Enter a valid fuel consumption (e.g. 8.0)'); return; }

    setLoading(true);
    setError(null);
    setResult(null);
    inputRef.current?.blur();

    try {
      // A typed starting point skips GPS entirely — Google accepts an address.
      let originParam = origin.trim();

      if (!originParam) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setError('Location permission is required, or type a starting point above.');
          setLoading(false);
          return;
        }

        const coords = await getOriginCoords();
        if (!coords) {
          setError('Could not get your current location. Type a starting point above instead.');
          setLoading(false);
          return;
        }
        originParam = `${coords.latitude},${coords.longitude}`;
      }

      const { data } = await api.get('/navigation/route', {
        params: { origin: originParam, destination: destination.trim() },
      });

      if (data.status !== 'OK') {
        setError(routeErrorMessage(data.status));
        setLoading(false);
        return;
      }

      const leg             = data.routes[0].legs[0];
      const distanceKm      = (leg.distance.value as number) / 1000;
      const durationSec     = leg.duration.value as number;
      const durationTraffic = (leg.duration_in_traffic?.value ?? durationSec) as number;
      const fuel            = calcFuelWithTraffic(distanceKm, durationSec, durationTraffic, avgL100);
      const tm              = trafficMeta(c, fuel.trafficRatio);

      setResult({
        distanceKm,
        durationMin:        Math.round(durationSec / 60),
        durationTrafficMin: Math.round(durationTraffic / 60),
        trafficRatio:       fuel.trafficRatio,
        baseFuelL:          fuel.baseFuelL,
        estimatedFuelL:     fuel.estimatedFuelL,
        extraFuelL:         fuel.extraFuelL,
        fuelCostILS:        fuel.estimatedFuelL * pricePerLitre,
        trafficLabel:       tm.label,
        trafficColor:       tm.color,
        // Coordinates from the route itself rather than the typed text: a
        // name like "AM-PM" matches hundreds of places, and our own bias
        // toward Israel does not travel with a deep link. Handing Maps the
        // exact points guarantees it opens the route we just calculated.
        originLatLng:       `${leg.start_location.lat},${leg.start_location.lng}`,
        destinationLatLng:  `${leg.end_location.lat},${leg.end_location.lng}`,
        destinationAddress: leg.end_address ?? destination.trim(),
        destinationText:    destination.trim(),
      });
    } catch (err: any) {
      // Log the real cause — this used to be a bare catch reporting "network
      // error" for everything, which sent debugging in the wrong direction.
      console.warn('[trip-planner] route request failed', err);
      const serverStatus = err?.response?.status;
      setError(
        serverStatus === 503
          ? 'The route service is not configured on the server.'
          : serverStatus
            ? `The server rejected the route request (${serverStatus}).`
            : 'Network error. Check your internet connection and try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Open in Google Maps ───────────────────────────────────────────────────
  const openInGoogleMaps = async () => {
    if (!result) return;
    const url =
      `https://www.google.com/maps/dir/?api=1` +
      `&origin=${encodeURIComponent(result.originLatLng)}` +
      `&destination=${encodeURIComponent(result.destinationLatLng)}` +
      `&travelmode=driving`;
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      // Fallback drops the route and just shows the destination pin — still
      // by coordinates, so it lands in the right place.
      await Linking.openURL(
        `https://maps.google.com/?q=${encodeURIComponent(result.destinationLatLng)}`
      );
    }
  };

  const vehicleName = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'No vehicle';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.Dashboard.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Vehicle + L/100km ── */}
        <View style={styles.vehicleRow}>
          <View style={styles.vehicleDot} />
          <Text style={styles.vehicleName}>{vehicleName}</Text>
          <View style={styles.fuelInputRow}>
            <TextInput
              style={styles.fuelInputBox}
              value={fuelInput}
              onChangeText={v => { setFuelInput(v); setResult(null); }}
              keyboardType="decimal-pad"
              selectTextOnFocus
            />
            <Text style={styles.fuelInputLabel}>L/100km</Text>
          </View>
        </View>

        {/* ── Route input ── */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>STARTING POINT</Text>
          <TextInput
            style={styles.input}
            placeholder="Leave empty to use my current location"
            placeholderTextColor={c.Dashboard.textSecondary}
            value={origin}
            onChangeText={(t) => { setOrigin(t); setResult(null); setError(null); }}
            autoCorrect={false}
            returnKeyType="next"
          />

          <Text style={[styles.cardLabel, styles.cardLabelSpaced]}>DESTINATION</Text>
          <View>
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder="e.g. Tel Aviv, Dizengoff Center"
              placeholderTextColor={c.Dashboard.textSecondary}
              value={destination}
              onChangeText={onDestinationChange}
              onSubmitEditing={handleCalculate}
              returnKeyType="search"
            />

            {/* Autocomplete dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <View style={styles.dropdown}>
                {suggestions.map((s, i) => (
                  <Pressable
                    key={s.placeId}
                    style={[styles.dropdownItem, i < suggestions.length - 1 && styles.dropdownDivider]}
                    onPress={() => onPickSuggestion(s)}
                  >
                    <Text style={styles.dropdownText} numberOfLines={1}>{s.description}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          <Pressable
            style={[styles.calcButton, (loading || !destination.trim()) && styles.calcButtonDisabled]}
            onPress={handleCalculate}
            disabled={loading || !destination.trim()}
          >
            {loading
              ? <ActivityIndicator color={c.Dashboard.onAccent} />
              : <Text style={styles.calcButtonText}>CALCULATE ROUTE</Text>}
          </Pressable>
          {error && <Text style={styles.errorText}>{error}</Text>}
        </View>

        {/* ── Results ── */}
        {result && (
          <>
            {/* Route summary */}
            <View style={styles.card}>
              <Text style={styles.cardLabel}>ROUTE SUMMARY</Text>
              {/* What Google actually matched. A short name like "AM-PM" can
                  resolve to any of dozens, and without this there is no way to
                  tell whether it picked the one you meant. */}
              <Text style={styles.resolvedTo} numberOfLines={2}>
                → {result.destinationAddress}
              </Text>
              <View style={styles.statsGrid}>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{result.distanceKm.toFixed(1)}</Text>
                  <Text style={styles.statUnit}>km</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{result.durationMin}</Text>
                  <Text style={styles.statUnit}>min normal</Text>
                </View>
                <View style={[styles.statBox, { borderColor: result.trafficColor + '55' }]}>
                  <Text style={[styles.statValue, { color: result.trafficColor }]}>
                    {result.durationTrafficMin}
                  </Text>
                  <Text style={styles.statUnit}>min w/ traffic</Text>
                </View>
              </View>

              {/* Traffic badge */}
              <View style={[styles.trafficBadge, {
                backgroundColor: result.trafficColor + '18',
                borderColor: result.trafficColor + '55',
              }]}>
                <View style={[styles.trafficDot, { backgroundColor: result.trafficColor }]} />
                <Text style={[styles.trafficLabel, { color: result.trafficColor }]}>
                  {result.trafficLabel} TRAFFIC
                </Text>
                {result.trafficRatio > 1.05 && (
                  <Text style={[styles.trafficDelay, { color: result.trafficColor }]}>
                    +{result.durationTrafficMin - result.durationMin} min delay
                  </Text>
                )}
              </View>

              {/* Open in Google Maps button */}
              <Pressable style={styles.mapsButton} onPress={openInGoogleMaps}>
                <Text style={styles.mapsButtonText}>🗺  Open in Google Maps</Text>
              </Pressable>
            </View>

            {/* Fuel estimate */}
            <View style={[styles.card, styles.fuelCard]}>
              <Text style={styles.cardLabel}>FUEL ESTIMATE</Text>
              <View style={styles.fuelMain}>
                <Text style={styles.fuelValue}>{result.estimatedFuelL.toFixed(2)}</Text>
                <Text style={styles.fuelUnit}>litres</Text>
              </View>
              <Text style={styles.fuelCost}>≈ ₪{result.fuelCostILS.toFixed(2)}</Text>
              {/* The rate is stated rather than left implicit: a cost figure
                  with no price behind it is impossible for the driver to
                  sanity-check against what they actually pay. */}
              <Text style={styles.fuelPriceNote}>
                at ₪{pricePerLitre.toFixed(2)}/L for {FUEL_TYPE_LABELS[fuelType]}
              </Text>
              <View style={styles.fuelDivider} />
              <View style={styles.fuelBreakdown}>
                <View style={styles.fuelRow}>
                  <Text style={styles.fuelRowLabel}>Base (no traffic)</Text>
                  <Text style={styles.fuelRowValue}>{result.baseFuelL.toFixed(2)} L</Text>
                </View>
                {result.extraFuelL > 0.05 && (
                  <View style={styles.fuelRow}>
                    <Text style={[styles.fuelRowLabel, { color: result.trafficColor }]}>Traffic penalty</Text>
                    <Text style={[styles.fuelRowValue, { color: result.trafficColor }]}>+{result.extraFuelL.toFixed(2)} L</Text>
                  </View>
                )}
                <View style={styles.fuelRow}>
                  <Text style={styles.fuelRowLabel}>Your avg consumption</Text>
                  <Text style={styles.fuelRowValue}>{fuelInput} L/100km</Text>
                </View>
              </View>
            </View>

            {/* ── Will you make it? ──
                Only shown when the car reported its own fuel level. Telling a
                driver they have enough to get there is a claim worth making
                from a measurement and not from an estimate built on a baseline
                they typed days ago. */}
            {outlook && (
              <View style={[styles.outlookCard, !outlook.enough && styles.outlookCardShort]}>
                {outlook.enough ? (
                  <>
                    <Text style={styles.outlookTitle}>You have enough fuel</Text>
                    <Text style={styles.outlookBody}>
                      You should arrive with about{' '}
                      <Text style={styles.outlookStrong}>{outlook.litresLeft.toFixed(1)}L</Text>{' '}
                      left — roughly {outlook.pctLeft}% of a tank.
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={[styles.outlookTitle, { color: c.Severity.red }]}>
                      Not enough fuel for this trip
                    </Text>
                    <Text style={styles.outlookBody}>
                      You need about{' '}
                      <Text style={styles.outlookStrong}>{outlook.shortfallL.toFixed(1)}L</Text>{' '}
                      more — roughly{' '}
                      <Text style={styles.outlookStrong}>₪{outlook.topUpCost.toFixed(0)}</Text>{' '}
                      at ₪{pricePerLitre.toFixed(2)}/L. Fill up before you go.
                    </Text>
                  </>
                )}
              </View>
            )}
          </>
        )}

        {!result && !loading && !error && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>⛽</Text>
            <Text style={styles.emptyText}>Enter a destination above</Text>
            <Text style={styles.emptySubtext}>
              We&apos;ll calculate fuel usage based on your vehicle and live traffic data.
            </Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const useStyles = createThemedStyles((c) => StyleSheet.create({
  container:   { flex: 1 },
  content:     { padding: 24, paddingBottom: 48 }, // native header supplies the top spacing

  vehicleRow:  {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: c.Dashboard.card,
    borderRadius: 12, borderWidth: 1, borderColor: c.Dashboard.cardBorder,
    padding: 14, marginBottom: 16,
  },
  vehicleDot:  { width: 10, height: 10, borderRadius: 5, backgroundColor: c.Dashboard.accent, flexShrink: 0 },
  vehicleName: { fontSize: 14, fontWeight: '600', color: c.Dashboard.textPrimary, flex: 1 },
  fuelInputRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  fuelInputBox:  {
    backgroundColor: c.Dashboard.bg,
    borderRadius: 8, borderWidth: 1, borderColor: c.Dashboard.accent + '88',
    paddingHorizontal: 10, paddingVertical: 6,
    fontSize: 16, fontWeight: '700', color: c.Dashboard.accent,
    minWidth: 52, textAlign: 'center',
  },
  fuelInputLabel: { fontSize: 12, color: c.Dashboard.textSecondary },

  card:        {
    backgroundColor: c.Dashboard.card,
    borderRadius: 12, borderWidth: 1, borderColor: c.Dashboard.cardBorder,
    padding: 20, marginBottom: 16,
  },
  fuelCard:    { borderColor: c.Dashboard.accent + '44' },
  cardLabel:   { fontSize: 11, color: c.Dashboard.textSecondary, letterSpacing: 1.5, marginBottom: 14 },
  resolvedTo:  { fontSize: 14, fontWeight: '600', color: c.Dashboard.textPrimary, marginTop: -6, marginBottom: 14 },
  // Separates the second field group from the one above it.
  cardLabelSpaced: { marginTop: 4 },

  input:       {
    backgroundColor: c.Dashboard.bg,
    borderRadius: 10, borderWidth: 1, borderColor: c.Dashboard.cardBorder,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: c.Dashboard.textPrimary, marginBottom: 12,
  },

  dropdown:      {
    position: 'absolute', top: 50, left: 0, right: 0,
    backgroundColor: c.Dashboard.card,
    borderRadius: 10, borderWidth: 1, borderColor: c.Dashboard.cardBorder,
    zIndex: 999, elevation: 8,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
  dropdownItem:  { paddingHorizontal: 14, paddingVertical: 13 },
  dropdownDivider: { borderBottomWidth: 1, borderBottomColor: c.Dashboard.cardBorder },
  dropdownText:  { fontSize: 13, color: c.Dashboard.textPrimary },

  calcButton:        { backgroundColor: c.Dashboard.accent, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  calcButtonDisabled:{ opacity: 0.4 },
  calcButtonText:    { color: c.Dashboard.onAccent, fontWeight: '700', fontSize: 14, letterSpacing: 1.5 },
  errorText:         { color: c.Severity.yellow, fontSize: 12, marginTop: 10, lineHeight: 17 },

  statsGrid:   { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statBox:     {
    flex: 1, alignItems: 'center',
    backgroundColor: c.Dashboard.bg,
    borderRadius: 10, borderWidth: 1, borderColor: c.Dashboard.cardBorder,
    paddingVertical: 12,
  },
  statValue:   { fontSize: 22, fontWeight: '700', color: c.Dashboard.textPrimary },
  statUnit:    { fontSize: 10, color: c.Dashboard.textSecondary, marginTop: 2, textAlign: 'center' },

  trafficBadge:  { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 14 },
  trafficDot:    { width: 8, height: 8, borderRadius: 4 },
  trafficLabel:  { fontSize: 12, fontWeight: '700', letterSpacing: 1, flex: 1 },
  trafficDelay:  { fontSize: 12, fontWeight: '600' },

  mapsButton:    {
    borderRadius: 10, borderWidth: 1, borderColor: c.Dashboard.accent,
    paddingVertical: 12, alignItems: 'center',
  },
  mapsButtonText: { color: c.Dashboard.accent, fontWeight: '700', fontSize: 14 },

  fuelMain:    { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginBottom: 4 },
  fuelValue:   { fontSize: 52, fontWeight: '800', color: c.Dashboard.textPrimary, lineHeight: 56 },
  fuelUnit:    { fontSize: 18, color: c.Dashboard.textSecondary, marginBottom: 8 },
  fuelCost:    { fontSize: 20, fontWeight: '600', color: c.Dashboard.accent, marginBottom: 2 },
  // Carries the bottom margin that used to sit on fuelCost, so the block below
  // keeps its spacing whichever of the two is last.
  fuelPriceNote: { fontSize: 12, color: c.Dashboard.textSecondary, marginBottom: 16 },
  fuelDivider: { height: 1, backgroundColor: c.Dashboard.cardBorder, marginBottom: 14 },
  outlookCard: {
    backgroundColor: c.Dashboard.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.Dashboard.cardBorder,
    borderLeftWidth: 4,
    borderLeftColor: c.Fuel.trendGreen,
    padding: 16,
    marginTop: 16,
  },
  outlookCardShort: { borderLeftColor: c.Severity.red },
  outlookTitle:  { fontSize: 15, fontWeight: '700', color: c.Dashboard.textPrimary, marginBottom: 6 },
  outlookBody:   { fontSize: 14, lineHeight: 21, color: c.Dashboard.textSecondary },
  outlookStrong: { fontWeight: '800', color: c.Dashboard.textPrimary },
  fuelBreakdown: { gap: 8 },
  fuelRow:     { flexDirection: 'row', justifyContent: 'space-between' },
  fuelRowLabel:{ fontSize: 13, color: c.Dashboard.textSecondary },
  fuelRowValue:{ fontSize: 13, fontWeight: '600', color: c.Dashboard.textPrimary },

  emptyState:  { alignItems: 'center', paddingTop: 60 },
  emptyIcon:   { fontSize: 48, marginBottom: 16 },
  emptyText:   { fontSize: 17, fontWeight: '600', color: c.Dashboard.textPrimary, marginBottom: 8 },
  emptySubtext:{ fontSize: 13, color: c.Dashboard.textSecondary, textAlign: 'center', lineHeight: 19 },
}));
