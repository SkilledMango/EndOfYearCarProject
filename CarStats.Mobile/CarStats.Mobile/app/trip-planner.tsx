import { ThemeColors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { createThemedStyles, useTheme } from '@/context/ThemeContext';
import { PlaceSuggestion, usePlaceSuggestions } from '@/hooks/usePlaceSuggestions';
import { api, FuelPrice, getFuelPrice, getUser, Vehicle } from '@/services/api';
import { loadFuelType, loadTankLevel, loadTankSize, TankLevel } from '@/services/tankState';
import {
  FALLBACK_FUEL_PRICES,
  FUEL_TYPE_LABELS,
  FuelType,
  tripFuelOutlook,
} from '@/utils/fuel';
import { routeErrorMessage } from '@/utils/route';
import * as Location from 'expo-location';
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

// הקריאות ל-Google עוברות דרך הפרוקסי בשרת: אין CORS בשירותים שלה,
// והמפתח נשאר מחוץ ללקוח. גם מחיר הדלק מגיע מהשרת, כי המחיר המפוקח
// מתעדכן מדי חודש.

// ─── טיפוסים ─────────────────────────────────────────────────────────────────
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
  /** נקודת המוצא של המסלול, כפי ש-Google פענחה אותה. */
  originLatLng:       string;
  /** נקודת היעד, כפי ש-Google פענחה אותה. */
  destinationLatLng:  string;
  /** למה Google התאימה את היעד, למשל "AM:PM, חדרה". */
  destinationAddress: string;
  /** מה שהמשתמש הקליד בדיוק. מוצג בממשק, אף פעם לא נשלח למפות. */
  destinationText:    string;
}

// ─── עזרים ───────────────────────────────────────────────────────────────────
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
  const baseFuelL      = (distanceKm / 100) * avgL100; // בודק את כמות הדלק שהרכב צורך לפי המרחק והצריכה הממוצעת
  const trafficRatio   = durationSec > 0 ? durationTrafficSec / durationSec : 1; //מחשב ביחס כמה יותר זמן לקח בפקקים לעומת הנסיעה הרגילה
  const trafficMult    = 1 + Math.max(0, (trafficRatio - 1) * 0.5); // כמה דלק נוסף יידרש בגלל הפקקים
  const estimatedFuelL = baseFuelL * trafficMult; //התוצאה הסופית — בסיס כפול המכפיל 
  return { baseFuelL, estimatedFuelL, extraFuelL: estimatedFuelL - baseFuelL, trafficRatio };
}

/**
 * המיקום לנקודת המוצא, או null אם המכשיר לא יכול לספק אף אחד.
 * נופל למיקום האחרון שנקלט: בקשת מיקום נכשלת מיד בתוך מבנה או כש-ה-GPS
 * עדיין קר, ומיקום מלפני כמה דקות כמעט לא משנה את ההערכה.
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

// ─── המסך הראשי ──────────────────────────────────────────────────────────────
export default function TripPlannerScreen() {
  const { user: authUser }            = useAuth();
  const { colors: c } = useTheme();
  const styles = useStyles();
  const [vehicle, setVehicle]         = useState<Vehicle | null>(null);
  const [destination, setDestination] = useState('');
  // ריק פירושו להשתמש במיקום הנוכחי.
  const [origin, setOrigin]           = useState('');
  const [fuelInput, setFuelInput]     = useState('8.0');
  const [loading, setLoading]         = useState(false);
  const [result, setResult]           = useState<RouteResult | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const { suggestions, visible: showSuggestions, search, clear } = usePlaceSuggestions();
  const inputRef = useRef<TextInput>(null);

  const [fuelPrice, setFuelPrice] = useState<FuelPrice | null>(null);
  // מתמחר לפי הדלק שהרכב צורך — הפרש של כ-40 אחוז בין סולר לבנזין.
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

  // נפרד מטעינת הרכב, כדי שכשל בקבלת המחיר לא יעלה למסך
  // את נתוני הצריכה.
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

  // מותנה בקריאה אמיתית מהרכב: אמירה שתגיע צריכה להסתמך על
  // מדידה, לא על אומדן מנקודת ייחוס שהוקלדה לפני ימים.
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

  // ── חישוב המסלול ─────────────────────────────────────────────────────────
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
      // נקודת מוצא שהוקלדה מדלגת על האיכון — גוגל מקבלת גם כתובת.
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
        // גוגל מסבירה את הסירוב בשדה נפרד. בלי השורה הזאת נשארים עם
        // הסטטוס בלבד, שלא מבדיל בין מפתח שגוי, חיוב שכבוי, והגבלה על המפתח.
        console.warn('[trip-planner] Google rejected:', data.status, data.error_message);
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
        // הקואורדינטות נלקחות מהמסלול עצמו ולא מהטקסט שהוקלד: שם כמו
        // "AM-PM" מתאים למאות מקומות, וההטיה שלנו לישראל לא עוברת
        // בקישור החוצה. מסירת הנקודות המדויקות מבטיחה שייפתח בדיוק
        // המסלול שחושב.
        originLatLng:       `${leg.start_location.lat},${leg.start_location.lng}`,
        destinationLatLng:  `${leg.end_location.lat},${leg.end_location.lng}`,
        destinationAddress: leg.end_address ?? destination.trim(),
        destinationText:    destination.trim(),
      });
    } catch (err: any) {
      // מדפיס את הסיבה האמיתית. בעבר כל שגיאה דווחה כ"תקלת רשת",
      // וזה שלח את האיתור לכיוון הלא נכון.
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

  // ── פתיחה ב-Google Maps ──────────────────────────────────────────────────
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
      // הגיבוי מוותר על המסלול ומציג רק את סיכת היעד, עדיין לפי
      // קואורדינטות כדי שינחת במקום הנכון.
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
        {/* ── הרכב והצריכה שלו ── */}
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

        {/* ── שדות המסלול ── */}
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

            {/* רשימת ההשלמה האוטומטית */}
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

        {/* ── התוצאות ── */}
        {result && (
          <>
            {/* סיכום המסלול */}
            <View style={styles.card}>
              <Text style={styles.cardLabel}>ROUTE SUMMARY</Text>
              {/* למה Google באמת התאימה את היעד. שם קצר יכול להתאים
                  לעשרות מקומות, ובלי זה אין דרך לדעת אם נבחר הנכון. */}
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

              {/* תג העומס */}
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

              {/* כפתור הפתיחה במפות */}
              <Pressable style={styles.mapsButton} onPress={openInGoogleMaps}>
                <Text style={styles.mapsButtonText}>🗺  Open in Google Maps</Text>
              </Pressable>
            </View>

            {/* הערכת הדלק */}
            <View style={[styles.card, styles.fuelCard]}>
              <Text style={styles.cardLabel}>FUEL ESTIMATE</Text>
              <View style={styles.fuelMain}>
                <Text style={styles.fuelValue}>{result.estimatedFuelL.toFixed(2)}</Text>
                <Text style={styles.fuelUnit}>litres</Text>
              </View>
              <Text style={styles.fuelCost}>≈ ₪{result.fuelCostILS.toFixed(2)}</Text>
              {/* מחיר הליטר מוצג במפורש: מספר עלות בלי המחיר שמאחוריו
                  לא מאפשר לנהג להשוות למה שהוא באמת משלם. */}
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

            {/* ── האם אגיע? ──
                מוצג רק כשהרכב דיווח בעצמו על מפלס הדלק. אמירה שיש מספיק
                דלק להגיע ראויה להישען על מדידה, לא על הערכה שנבנתה
                מנקודת ייחוס שהוקלדה לפני ימים. */}
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

// ─── סגנונות ─────────────────────────────────────────────────────────────────
const useStyles = createThemedStyles((c) => StyleSheet.create({
  container:   { flex: 1 },
  content:     { padding: 24, paddingBottom: 48 }, // הכותרת של המערכת מספקת את המרווח העליון

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
  // מפריד בין קבוצת השדות השנייה לזו שמעליה
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
  // נושא את המרווח התחתון, כדי שהבלוק שמתחת ישמור על המרווח שלו
  // בלי קשר לאיזה משני האלמנטים מופיע אחרון.
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
