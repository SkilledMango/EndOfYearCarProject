import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import ScanOverlay from '@/components/ScanOverlay';
import { AddVehicleModal, VehiclePrefill } from '@/components/AddVehicleModal';
import {
  AppUser,
  ReportDtcResponse,
  SeverityLevel,
  Vehicle,
  VehicleEventEnriched,
  getUser,
  getUserEvents,
  reportDtc,
} from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import {
  LiveData,
  ScannerStatus,
  getLiveData,
  getScannerStatus,
  getVehicleVin,
  isScannerReachable,
  scanDtcs,
  setDemoMode,
} from '@/services/scanner';
import { decodeVin, VinDecodeResult, vinMatchesVehicle } from '@/services/vindecode';
import { sendFaultAlert } from '@/services/notifications';
import { saveTankLevel, saveTankSize } from '@/services/tankState';
import { createThemedStyles, useTheme } from '@/context/ThemeContext';
import { Plate } from '@/constants/theme';
import { severityColor, severityMeta, worstSeverity } from '@/utils/severity';
import { estimateFuelPercent, FuelBaseline } from '@/utils/fuel';
import ScannerBanner from '@/components/home/ScannerBanner';
import LiveGauges from '@/components/home/LiveGauges';
import FuelSetModal from '@/components/home/FuelSetModal';
import DtcResultCard from '@/components/home/DtcResultCard';

// ─── נקודת ההתחלה של מפלס הדלק, נשמרת במכשיר לכל רכב ─────────────────────────
// החישוב עצמו יושב ב-utils/fuel.ts כדי שאפשר יהיה לבדוק אותו בלי המסך.

function fuelKey(vehicleId?: number) {
  return `fuel_baseline_${vehicleId ?? 'default'}`;
}

function tripKey(vehicleId?: number) {
  return `trip_km_${vehicleId ?? 'default'}`;
}

/**
 * המרחק המצטבר נשמר לכל היותר פעם בכל כמות הק"מ הזו.
 * הדגימה רצה כל שנייה, ושמירה בכל דגימה הייתה כ-3600 כתיבות בשעה
 * עבור מספר שכמעט לא זז.
 */
const TRIP_PERSIST_KM = 1;

// ─── מסך הבית ────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { user: authUser } = useAuth();
  const { colors: c } = useTheme();
  const styles = useStyles();
  const router = useRouter();

  // ── המשתמש והרכב הנבחר ──
  const [user, setUser]                     = useState<AppUser | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [recentEvents, setRecentEvents]     = useState<VehicleEventEnriched[]>([]);
  const [loading, setLoading]               = useState(true);

  // ── מצב המתאם ──
  const [scannerOnline, setScannerOnline]   = useState(false);
  // מצב הדגמה: נתונים מדומים להצגת זרימת האבחון בלי המתאם ברשת.
  // מופעל תמיד ביוזמת המשתמש.
  const [demo, setDemo]                     = useState(false);
  const [scannerStatus, setScannerStatus]   = useState<ScannerStatus | null>(null);
  const [liveData, setLiveData]             = useState<LiveData | null>(null);
  const [liveError, setLiveError]           = useState(false);

  // ── מצב סריקת התקלות ──
  const [scanning, setScanning]             = useState(false);
  const [dtcResults, setDtcResults]         = useState<ReportDtcResponse[]>([]);
  // הקודים שנסרקו, באותו סדר כמו התוצאות. תשובת השרת משמיטה את הקוד
  // הגולמי כשאין לו רשומה במילון, ולכן זו הדרך שתקלה לא מוכרת עדיין
  // יודעת מה היא.
  const [scannedCodes, setScannedCodes]     = useState<string[]>([]);
  const [scanError, setScanError]           = useState<string | null>(null);
  const [scanOverlayVisible, setScanOverlayVisible] = useState(false);

  // ── הערכת מפלס הדלק ──
  const [tripKm, setTripKm]                 = useState(0);
  const [fuelBaseline, setFuelBaseline]     = useState<FuelBaseline | null>(null);
  const [estimatedFuel, setEstimatedFuel]   = useState<number | null>(null);
  const [fuelModalVisible, setFuelModalVisible]       = useState(false);
  const [addVehicleVisible, setAddVehicleVisible]     = useState(false);
  const [prefillData, setPrefillData]       = useState<VehiclePrefill | undefined>();
  const lastPollTimeRef = useRef(Date.now());
  // המרחק הגבוה ביותר שכבר נשמר, לצורך ויסות הכתיבות
  const lastPersistedTripRef = useRef(0);

  // ── זיהוי הרכב לפי מספר שלדה ──
  const [detectedVehicle, setDetectedVehicle] = useState<VinDecodeResult | null>(null);
  const vinCheckDoneRef = useRef(false);  // מונע בדיקה חוזרת באותו סשן

  // ── הטיימר של הדגימה ──
  const liveInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── טעינת המשתמש והאירועים ───────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!authUser) return;
    try {
      const [userData, events] = await Promise.all([
        getUser(authUser.id),
        getUserEvents(authUser.id),
      ]);
      setUser(userData);
      // שומרים על הרכב שנבחר רק אם הוא עדיין קיים ברשימה שחזרה — אחרת
      // רכב שנמחק מהפרופיל היה נשאר על המסך הזה עד להפעלה מחדש.
      setSelectedVehicle(prev => {
        const list = userData.vehicles ?? [];
        return (prev ? list.find(v => v.id === prev.id) : null) ?? list[0] ?? null;
      });
      setRecentEvents(events.slice(0, 3));
    } catch {
      // השרת לא זמין — מוצג מצב ריק
    } finally {
      setLoading(false);
    }
    // תלוי במזהה בלבד ולא באובייקט השלם: פונקציית הרענון מחזירה אובייקט חדש
    // בכל קריאה, ותלות בו הייתה גורמת לטעינה חוזרת בכל פעם. מערך ריק כאן
    // היה נועל את המשתמש מהרינדור הראשון וממשיך לטעון את הנתונים שלו
    // גם אחרי שחשבון אחר התחבר.
  }, [authUser?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ── טעינת נקודת ההתחלה של הדלק בכל החלפת רכב ─────────────────────────────
  const loadFuelBaseline = useCallback(async (vehicleId?: number) => {
    try {
      const stored = await AsyncStorage.getItem(fuelKey(vehicleId));
      if (!stored) return;

      const baseline: FuelBaseline = JSON.parse(stored);
      setFuelBaseline(baseline);

      // שחזור המרחק שנסע מאז נקודת ההתחלה. בלי זה המונה מתאפס בכל הפעלה
      // והמחוון קופץ חזרה לאחוז ההתחלתי — כלומר מציג יותר דלק ממה שיש
      // בפועל, וזה הכיוון הלא נכון לטעות בו.
      const storedTrip = await AsyncStorage.getItem(tripKey(vehicleId));
      const restored   = storedTrip ? parseFloat(storedTrip) : 0;
      const safeTrip   = Number.isFinite(restored) ? restored : 0;

      setTripKm(prev => Math.max(prev, safeTrip, baseline.tripKm));
      lastPersistedTripRef.current = Math.max(safeTrip, baseline.tripKm);
    } catch { /* מתעלמים משגיאות אחסון */ }
  }, []);

  const saveFuelBaseline = useCallback(async (baseline: FuelBaseline, vehicleId?: number) => {
    try {
      await AsyncStorage.multiSet([
        [fuelKey(vehicleId), JSON.stringify(baseline)],
        // מעגנים את מונה המרחק לנקודת ההתחלה, כדי שההפעלה הבאה תמדוד
        // ירידה מכאן ולא ממספר ישן וגדול יותר.
        [tripKey(vehicleId), String(baseline.tripKm)],
      ]);
      lastPersistedTripRef.current = baseline.tripKm;
      setFuelBaseline(baseline);
    } catch { /* מתעלמים */ }
  }, []);

  // ── בדיקת המתאם והתחלת הדגימה ────────────────────────────────────────────
  const checkScanner = useCallback(async () => {
    const reachable = await isScannerReachable();
    setScannerOnline(reachable);
    if (reachable) {
      try {
        const status = await getScannerStatus();
        setScannerStatus(status);
      } catch { /* ignore */ }
    }
  }, []);

  // החלפת מצב ההדגמה מריצה מחדש את בדיקת החיבור, כך שהשורה, השעונים
  // וכפתור הסריקה מתנהגים בדיוק כמו בחיבור או ניתוק של מתאם אמיתי.
  const toggleDemo = useCallback(async () => {
    const next = !demo;
    setDemo(next);
    setDemoMode(next);
    setLiveData(null);
    setDtcResults([]);
    setScannedCodes([]);
    setScanError(null);
    await checkScanner();
  }, [demo, checkScanner]);

  // מסיים את החיבור ביוזמת המשתמש. המתאם נשאר דולק; רק האפליקציה
  // מפסיקה לדבר איתו, וזה מה שנהג מתכוון אליו כשהוא אומר "נתק".
  const disconnect = useCallback(() => {
    setScannerOnline(false);
    setScannerStatus(null);
    setLiveData(null);
    setLiveError(false);
  }, []);

  const pollLive = useCallback(async () => {
    if (!scannerOnline) return;
    try {
      const now = Date.now();
      const data = await getLiveData();

      // צבירת מרחק הנסיעה עבור הערכת הדלק
      if (data.speedKmh > 0) {
        const dtHours = (now - lastPollTimeRef.current) / 3_600_000;
        setTripKm(prev => prev + data.speedKmh * dtHours);
      }
      lastPollTimeRef.current = now;

      setLiveData(data);
      setLiveError(false);
    } catch {
      setLiveError(true);
    }
  }, [scannerOnline]);

  useEffect(() => {
    loadData();
    checkScanner();
  }, [loadData, checkScanner]);

  // גם בכל חזרה למסך: הלשוניות נשארות טעונות, אז רכב שנמחק בפרופיל היה
  // ממשיך להופיע כאן — כולל בבורר הרכבים — עד להפעלה מחדש של האפליקציה.
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  useEffect(() => {
    loadFuelBaseline(selectedVehicle?.id);
  }, [selectedVehicle, loadFuelBaseline]);

  // ── שמירת המרחק המצטבר, כדי שההערכה תשרוד הפעלה מחדש ─────────────────────
  useEffect(() => {
    if (tripKm - lastPersistedTripRef.current < TRIP_PERSIST_KM) return;
    lastPersistedTripRef.current = tripKm;
    AsyncStorage.setItem(tripKey(selectedVehicle?.id), String(tripKm))
      .catch(() => { /* האחסון מלא או לא זמין — ההערכה נחלשת, אבל שום דבר לא קורס */ });
  }, [tripKm, selectedVehicle]);

  // ── זיהוי הרכב, פעם אחת לכל חיבור לרכב אמיתי ─────────────────────────────
  useEffect(() => {
    if (!scannerOnline || scannerStatus?.simMode) {
      vinCheckDoneRef.current = false;   // איפוס בניתוק או במצב הדגמה
      return;
    }
    if (vinCheckDoneRef.current) return; // כבר נבדק בסשן הזה
    vinCheckDoneRef.current = true;

    (async () => {
      try {
        const vinResult = await getVehicleVin();
        if (!vinResult.vin || vinResult.simMode) return;

        const decoded = await decodeVin(vinResult.vin);
        if (!decoded) return;

        // מציעים להוסיף רק אם אף רכב במוסך לא מתאים
        const vehicles = user?.vehicles ?? [];
        const alreadyInGarage = vehicles.some(v => vinMatchesVehicle(decoded, v));
        if (!alreadyInGarage) setDetectedVehicle(decoded);
      } catch { /* זיהוי השלדה הוא בונוס; כישלון שקט הוא בסדר */ }
    })();
  }, [scannerOnline, scannerStatus, user]);

  // הפעלה או עצירה של הדגימה כל שנייה, לפי זמינות המתאם
  useEffect(() => {
    if (scannerOnline) {
      pollLive(); // קריאה ראשונה מיידית
      liveInterval.current = setInterval(pollLive, 1000);
    } else {
      if (liveInterval.current) {
        clearInterval(liveInterval.current);
        liveInterval.current = null;
      }
      setLiveData(null);
    }
    return () => {
      if (liveInterval.current) clearInterval(liveInterval.current);
    };
  }, [scannerOnline, pollLive]);

  // ── חישוב מחדש של הערכת הדלק בכל שינוי מרחק או נקודת התחלה ───────────────
  useEffect(() => {
    if (!liveData || liveData.fuelPercent != null) {
      // יש קריאת דלק אמיתית מהרכב — אין צורך בהערכה
      setEstimatedFuel(null);
      return;
    }
    if (!fuelBaseline) {
      setEstimatedFuel(null);
      return;
    }
    // החשבון ומקרי הקצה שלו יושבים ב-utils/fuel.ts כדי שאפשר יהיה לבדוק
    // אותם בלי להריץ את המסך הזה.
    setEstimatedFuel(estimateFuelPercent({
      baseline:  fuelBaseline,
      tripKm,
      avgL100km: selectedVehicle?.averageFuelConsumption,
    }));
  }, [liveData, fuelBaseline, tripKm, selectedVehicle]);

  // רק המסך הזה דוגם את המתאם, ולכן הוא מפרסם את המפלס עבור מסך הדלק
  // ומתכנן הנסיעה. קריאה אמיתית גוברת על ההערכה, והמידע איזו מהן זו
  // נשמר יחד עם הערך.
  useEffect(() => {
    const real = liveData?.fuelPercent ?? null;
    if (real != null)          saveTankLevel(real, true, selectedVehicle?.id);
    else if (estimatedFuel != null) saveTankLevel(estimatedFuel, false, selectedVehicle?.id);
  }, [liveData?.fuelPercent, estimatedFuel, selectedVehicle?.id]);

  // ── סריקת תקלות מהמתאם ───────────────────────────────────────────────────
  const handleScanDtcs = async () => {
    setScanError(null);
    setDtcResults([]);

    if (!scannerOnline) {
      setScanError('OBD-II adapter not found on your WiFi network.\nMake sure your phone and the scanner are on the same WiFi.');
      return;
    }

    setScanning(true);
    setScanOverlayVisible(true); // מסך סריקה מלא
    try {
      const { codes } = await scanDtcs();

      if (codes.length === 0) {
        setScanError('No active fault codes detected — your car is clean!');
        setScanning(false);
        return;
      }

      // במקביל: שלושה קודים לוקחים כמו האיטי ביותר, לא כמו הסכום.
      const responses = await Promise.all(
        codes.map(code => reportDtc(code, authUser?.id, selectedVehicle?.id))
      );
      setDtcResults(responses);
      setScannedCodes(codes);
      loadData();

      // התראה מקומית (נשלטת בהגדרות)
      const worst = worstSeverity(responses) ?? SeverityLevel.Green;
      sendFaultAlert(responses.length, severityMeta(c, worst).label);
    } catch {
      setScanError('Scan failed. Check that the adapter is connected to the car.');
    } finally {
      setScanning(false);
    }
  };

  // ── התצוגה ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={c.Dashboard.accent} />
      </View>
    );
  }

  const firstName    = user?.fullName?.split(' ')[0] ?? 'Driver';
  const vehicles     = user?.vehicles ?? [];
  const vehiclePlate = selectedVehicle?.licensePlate ?? '—';
  const fuelAvg      = selectedVehicle?.averageFuelConsumption ?? null;

  // מצב הבריאות הכללי, נגזר מההתראות האחרונות
  const worstRecent: SeverityLevel | null = recentEvents.reduce<SeverityLevel | null>(
    (worst, ev) => {
      const s = ev.translation?.severity;
      if (s == null) return worst;
      return worst == null || s > worst ? s : worst;
    }, null);
  const healthGood = worstRecent == null || worstRecent === SeverityLevel.Green;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* ── כותרת: אווטאר וברכה ── */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{firstName[0]?.toUpperCase() ?? '?'}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.greetingSmall}>Good Morning</Text>
          <Text style={styles.greeting}>{firstName}</Text>
        </View>
      </View>

      {/* ── כרטיס הרכב: שם, תג מצב ולוחית רישוי ── */}
      <View style={styles.vehicleCard}>
        <View style={styles.vehicleCardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.vehicleCardName}>
              {selectedVehicle ? `${selectedVehicle.make} ${selectedVehicle.model}` : 'No vehicle yet'}
            </Text>
            <Text style={styles.vehicleCardSub}>
              {selectedVehicle ? `${selectedVehicle.year}` : 'Add your car to get started'}
            </Text>
          </View>
          <View style={styles.healthChip}>
            <View style={styles.healthChipDot} />
            <Text style={styles.healthChipText}>
              {(user?.totalFaultsLogged ?? 0) === 0 ? 'Healthy' : 'Check'}
            </Text>
          </View>
        </View>
        {selectedVehicle && (
          <View style={styles.miniPlate}>
            <View style={styles.miniPlateTab}>
              <Text style={styles.miniPlateIL}>IL</Text>
            </View>
            <Text style={styles.miniPlateText}>{vehiclePlate}</Text>
          </View>
        )}
      </View>

      {/* ── בורר הרכבים ── */}
      {vehicles.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.vehicleScroll}
          contentContainerStyle={styles.vehicleScrollContent}
        >
          {vehicles.map(v => {
            const isActive = v.id === selectedVehicle?.id;
            return (
              <Pressable
                key={v.id}
                style={[styles.vehicleChip, isActive && styles.vehicleChipActive]}
                onPress={() => setSelectedVehicle(v)}
              >
                <Text style={[styles.vehicleChipText, isActive && styles.vehicleChipTextActive]}>
                  {v.year} {v.make} {v.model}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* ── שורת הזיהוי לפי מספר שלדה ── */}
      {detectedVehicle && (
        <View style={styles.detectionBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.detectionTitle}>🔍 Car detected via OBD</Text>
            <Text style={styles.detectionSub}>
              {detectedVehicle.year} {detectedVehicle.make} {detectedVehicle.model}
              {' '}— not in your garage yet
            </Text>
          </View>
          <Pressable
            style={styles.detectionAddBtn}
            onPress={() => {
              setPrefillData({ make: detectedVehicle.make, model: detectedVehicle.model, year: detectedVehicle.year });
              setDetectedVehicle(null);
              setAddVehicleVisible(true);
            }}
          >
            <Text style={styles.detectionAddText}>ADD</Text>
          </Pressable>
          <Pressable onPress={() => setDetectedVehicle(null)} style={styles.detectionDismiss}>
            <Text style={styles.detectionDismissText}>✕</Text>
          </Pressable>
        </View>
      )}

      {/* ── כפתור הוספת רכב ── */}
      <Pressable style={styles.addVehicleBtn} onPress={() => setAddVehicleVisible(true)}>
        <Text style={styles.addVehicleBtnText}>＋  Add vehicle</Text>
      </Pressable>

      {/* ── כרטיס מצב הרכב ── */}
      <View style={[styles.healthCard, !healthGood && styles.healthCardWarn]}>
        <View style={[styles.healthCircle, !healthGood && styles.healthCircleWarn]} />
        <Text style={styles.healthTitle}>
          {healthGood ? 'Vehicle is in great shape' : 'Attention needed'}
        </Text>
        <Text style={styles.healthSub}>
          {healthGood
            ? 'All critical systems are functioning normally.'
            : 'Recent fault codes need your attention — check the alerts below.'}
        </Text>
      </View>

      {/* ── כרטיסי הנתונים ── */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {fuelAvg != null && fuelAvg > 0 ? fuelAvg.toFixed(1) : '—'}
          </Text>
          <Text style={styles.statLabel}>L / 100km avg</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[
            styles.statValue,
            (user?.totalFaultsLogged ?? 0) > 0 && { color: c.Severity.yellow },
          ]}>
            {user?.totalFaultsLogged ?? 0}
          </Text>
          <Text style={styles.statLabel}>Faults logged</Text>
        </View>
      </View>

      {/* ── קיצור למתכנן הנסיעה ── */}
      <Pressable style={styles.plannerCard} onPress={() => router.push('/trip-planner')}>
        <Text style={styles.plannerIcon}>🗺</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.plannerTitle}>Trip Fuel Planner</Text>
          <Text style={styles.plannerSub}>Estimate fuel & cost for a route with live traffic</Text>
        </View>
        <Text style={styles.plannerChevron}>›</Text>
      </Pressable>

      {/* ── שורת מצב המתאם ── */}
      <ScannerBanner
        online={scannerOnline}
        status={scannerStatus}
        demo={demo}
        onRetry={checkScanner}
        onToggleDemo={toggleDemo}
        onDisconnect={disconnect}
      />

      {/* ── השעונים החיים ── */}
      {scannerOnline && liveData && !liveError && (
        <LiveGauges
          data={liveData}
          estimatedFuel={estimatedFuel}
          onSetFuel={() => setFuelModalVisible(true)}
        />
      )}

      {/* ── כפתור הסריקה ── */}
      <View style={styles.scanCard}>
        <Text style={styles.scanLabel}>OBD-II FAULT SCAN</Text>
        <Text style={styles.scanHint}>
          {scannerOnline
            ? 'Your adapter is connected. Tap below to read all active fault codes directly from the car.'
            : 'Connect the OBD-II adapter to your car and join the same WiFi network to scan.'}
        </Text>
        <Pressable
          style={[styles.scanButton, scanning && styles.scanButtonDisabled]}
          onPress={handleScanDtcs}
          disabled={scanning}
        >
          {scanning
            ? <ActivityIndicator color={c.Dashboard.onAccent} />
            : <Text style={styles.scanButtonText}>🔍  Scan My Car</Text>}
        </Pressable>
        {scanError && (
          <Text style={styles.scanErrorText}>{scanError}</Text>
        )}
      </View>

      {/* ── תוצאות הסריקה ── */}
      {dtcResults.length > 0 && (
        <View>
          <Text style={styles.sectionTitle}>SCAN RESULTS</Text>
          {dtcResults.map((r, i) => (
            <DtcResultCard key={i} result={r} rawCode={scannedCodes[i]} />
          ))}
        </View>
      )}

      {/* ── ההתראות האחרונות ── */}
      {recentEvents.length > 0 && (
        <View style={{ marginTop: dtcResults.length > 0 ? 8 : 0 }}>
          <Text style={styles.sectionTitle}>RECENT ALERTS</Text>
          {recentEvents.map(ev => (
            <View key={ev.id} style={styles.alertRow}>
              <View style={[
                styles.severityDot,
                { backgroundColor: severityColor(c, ev.translation?.severity) },
              ]} />
              <View style={styles.alertText}>
                <Text style={styles.alertCode}>{ev.rawErrorCode}</Text>
                <Text style={styles.alertTitle} numberOfLines={1}>
                  {ev.translation?.humanTitle ?? 'Unknown code'}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* ── חלון הוספת הרכב ── */}
      {/* מוצג רק כשיש משתמש מחובר. בעבר סימן הקריאה השתיק כאן את שגיאת
          הטיפוס בלי למנוע את שגיאת הריצה: בהתנתקות המשתמש הופך ל-null,
          המסך קרס באמצע הרינדור לפני שהניווט הספיק לצאת, והאפליקציה
          נתקעה על מסך ריק במקום לחזור להתחברות. */}
      {authUser && (
        <AddVehicleModal
          visible={addVehicleVisible}
          userId={authUser.id}
          prefill={prefillData}
          onAdded={() => { setAddVehicleVisible(false); setPrefillData(undefined); loadData(); }}
          onClose={() => { setAddVehicleVisible(false); setPrefillData(undefined); }}
        />
      )}

      {/* ── מסך הסריקה המלא ── */}
      <ScanOverlay
        visible={scanOverlayVisible}
        scanning={scanning}
        vehicleName={selectedVehicle ? `${selectedVehicle.make} ${selectedVehicle.model}` : 'your car'}
        results={dtcResults}
        finishedMessage={scanError}
        liveData={liveData}
        estimatedFuelPct={estimatedFuel ?? fuelBaseline?.pct ?? null}
        onClose={() => setScanOverlayVisible(false)}
      />

      {/* ── חלון הגדרת מפלס הדלק ── */}
      <FuelSetModal
        visible={fuelModalVisible}
        currentEstimate={estimatedFuel ?? fuelBaseline?.pct ?? null}
        onSave={(pct, tankL) => {
          saveFuelBaseline({ pct, tankL, tripKm }, selectedVehicle?.id);
          // נשמר גם במפתח המשותף, כדי שהמסכים האחרים יקבלו את גודל המיכל
          saveTankSize(tankL, selectedVehicle?.id);
          setFuelModalVisible(false);
        }}
        onCancel={() => setFuelModalVisible(false)}
      />

    </ScrollView>
  );
}





// ─── סגנונות ─────────────────────────────────────────────────────────────────

const useStyles = createThemedStyles((c) => StyleSheet.create({
  container:             { flex: 1, backgroundColor: c.Dashboard.bg },
  centered:              { justifyContent: 'center', alignItems: 'center' },
  content:               { padding: 24, paddingTop: 64, paddingBottom: 40 },

  header:                { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },

  plannerCard:           {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: c.Dashboard.card,
    borderRadius: 12, borderWidth: 1, borderColor: c.Dashboard.cardBorder,
    padding: 16, marginBottom: 16,
  },
  plannerIcon:           { fontSize: 24 },
  plannerTitle:          { fontSize: 15, fontWeight: '700', color: c.Dashboard.textPrimary },
  plannerSub:            { fontSize: 12, color: c.Dashboard.textSecondary, marginTop: 2 },
  plannerChevron:        { fontSize: 26, color: c.Dashboard.textSecondary, marginTop: -2 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: c.Dashboard.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText:            { color: c.Dashboard.onAccent, fontSize: 18, fontWeight: '800' },
  greetingSmall:         { fontSize: 13, color: c.Dashboard.textSecondary },
  greeting:              { fontSize: 22, fontWeight: '800', color: c.Dashboard.textPrimary, letterSpacing: -0.3 },

  // כרטיס הרכב עם לוחית הרישוי
  vehicleCard: {
    backgroundColor: c.Dashboard.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.Dashboard.cardBorder,
    padding: 16,
    marginBottom: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  vehicleCardTop:  { flexDirection: 'row', alignItems: 'center' },
  vehicleCardName: { fontSize: 19, fontWeight: '800', color: c.Dashboard.textPrimary },
  vehicleCardSub:  { fontSize: 13, color: c.Dashboard.textSecondary, marginTop: 2 },
  healthChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: c.SeveritySoft.green,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  healthChipDot:  { width: 8, height: 8, borderRadius: 4, backgroundColor: c.Severity.green },
  healthChipText: { fontSize: 12, fontWeight: '700', color: c.Severity.green },
  miniPlate: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    borderWidth: 2,
    borderColor: Plate.border,
    borderRadius: 8,
    overflow: 'hidden',
    height: 38,
  },
  miniPlateTab: {
    width: 30,
    backgroundColor: Plate.tabBlue,
    justifyContent: 'center',
    alignItems: 'center',
  },
  miniPlateIL: { color: '#fff', fontSize: 11, fontWeight: '800' },
  miniPlateText: {
    backgroundColor: Plate.yellow,
    color: Plate.border,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 2,
    paddingHorizontal: 14,
    textAlignVertical: 'center',
    lineHeight: 34,
  },

  // כרטיס מצב הרכב
  healthCard: {
    backgroundColor: c.SeveritySoft.green,
    borderRadius: 16,
    padding: 22,
    alignItems: 'center',
    marginBottom: 16,
  },
  healthCardWarn:   { backgroundColor: c.SeveritySoft.yellow },
  healthCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: c.Severity.green + '33',
    borderWidth: 3,
    borderColor: c.Severity.green,
    marginBottom: 12,
  },
  healthCircleWarn: { backgroundColor: c.Severity.yellow + '33', borderColor: c.Severity.yellow },
  healthTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: c.Dashboard.textPrimary,
    textAlign: 'center',
  },
  healthSub: {
    fontSize: 13,
    color: c.Dashboard.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 4,
  },

  vehicleScroll:         { marginBottom: 20 },
  vehicleScrollContent:  { gap: 8, paddingVertical: 4 },
  vehicleChip:           {
    borderWidth: 1,
    borderColor: c.Dashboard.cardBorder,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: c.Dashboard.card,
  },
  vehicleChipActive:     { borderColor: c.Dashboard.accent, backgroundColor: c.Dashboard.accent + '22' },
  vehicleChipText:       { fontSize: 13, color: c.Dashboard.textSecondary },
  vehicleChipTextActive: { color: c.Dashboard.accent, fontWeight: '600' },

  detectionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.Dashboard.accent + '15',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.Dashboard.accent + '55',
    padding: 14,
    marginBottom: 16,
    gap: 10,
  },
  detectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: c.Dashboard.accent,
  },
  detectionSub: {
    fontSize: 12,
    color: c.Dashboard.textSecondary,
    marginTop: 2,
  },
  detectionAddBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: c.Dashboard.accent,
  },
  detectionAddText: {
    fontSize: 12,
    fontWeight: '700',
    color: c.Dashboard.onAccent,
    letterSpacing: 1,
  },
  detectionDismiss: {
    padding: 4,
  },
  detectionDismissText: {
    fontSize: 16,
    color: c.Dashboard.textSecondary,
  },

  addVehicleBtn: {
    borderWidth: 1,
    borderColor: c.Dashboard.accent + '66',
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 20,
  },
  addVehicleBtnText: {
    fontSize: 13,
    color: c.Dashboard.accent,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  statsRow:              { flexDirection: 'row', gap: 12, marginBottom: 20 },
  statCard:              {
    flex: 1,
    backgroundColor: c.Dashboard.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.Dashboard.cardBorder,
    padding: 16,
    alignItems: 'center',
  },
  statValue:             { fontSize: 28, fontWeight: '700', color: c.Dashboard.textPrimary },
  statLabel:             { fontSize: 12, color: c.Dashboard.textSecondary, marginTop: 4, textAlign: 'center' },

  scanCard:              {
    backgroundColor: c.Dashboard.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.Dashboard.cardBorder,
    padding: 20,
    marginBottom: 24,
  },
  scanLabel:             { fontSize: 11, color: c.Dashboard.textSecondary, letterSpacing: 1.5, marginBottom: 8 },
  scanHint:              { fontSize: 13, color: c.Dashboard.textSecondary, lineHeight: 18, marginBottom: 14 },
  scanButton: {
    backgroundColor: c.Dashboard.accentDeep,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: c.Dashboard.accentDeep,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  scanButtonDisabled:    { opacity: 0.5 },
  scanButtonText:        { color: c.Dashboard.onAccent, fontWeight: '700', fontSize: 16 },
  scanErrorText:         { color: c.Severity.yellow, fontSize: 12, marginTop: 10, lineHeight: 17 },


  sectionTitle:          { fontSize: 11, color: c.Dashboard.textSecondary, letterSpacing: 1.5, marginBottom: 12 },
  alertRow:              {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.Dashboard.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.Dashboard.cardBorder,
    padding: 14,
    marginBottom: 8,
  },
  severityDot:           { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  alertText:             { flex: 1 },
  alertCode:             { fontSize: 12, color: c.Dashboard.textSecondary, fontWeight: '600', letterSpacing: 1 },
  alertTitle:            { fontSize: 14, color: c.Dashboard.textPrimary, marginTop: 2 },
}));
