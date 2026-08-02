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
import { useRouter } from 'expo-router';
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
} from '@/services/scanner';
import { decodeVin, VinDecodeResult, vinMatchesVehicle } from '@/services/vindecode';
import { sendFaultAlert } from '@/services/notifications';
import { createThemedStyles, useTheme } from '@/context/ThemeContext';
import { Plate } from '@/constants/theme';
import { severityColor, severityMeta, worstSeverity } from '@/utils/severity';
import { estimateFuelPercent, FuelBaseline } from '@/utils/fuel';
import ScannerBanner from '@/components/home/ScannerBanner';
import LiveGauges from '@/components/home/LiveGauges';
import FuelSetModal from '@/components/home/FuelSetModal';
import DtcResultCard from '@/components/home/DtcResultCard';

// ─── Fuel baseline (stored in AsyncStorage per vehicle) ───────────────────────
// FuelBaseline and the estimation maths live in utils/fuel.ts.

function fuelKey(vehicleId?: number) {
  return `fuel_baseline_${vehicleId ?? 'default'}`;
}

function tripKey(vehicleId?: number) {
  return `trip_km_${vehicleId ?? 'default'}`;
}

/**
 * Accumulated trip distance is written back to storage at most once per this
 * many km. The poll runs every second, so persisting on every tick would mean
 * ~3600 storage writes an hour for a number that barely moves.
 */
const TRIP_PERSIST_KM = 1;

// ─── Home Screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { user: authUser } = useAuth();
  const { colors: c } = useTheme();
  const styles = useStyles();
  const router = useRouter();

  // ── User / vehicle state ──
  const [user, setUser]                     = useState<AppUser | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [recentEvents, setRecentEvents]     = useState<VehicleEventEnriched[]>([]);
  const [loading, setLoading]               = useState(true);

  // ── Scanner state ──
  const [scannerOnline, setScannerOnline]   = useState(false);
  const [scannerStatus, setScannerStatus]   = useState<ScannerStatus | null>(null);
  const [liveData, setLiveData]             = useState<LiveData | null>(null);
  const [liveError, setLiveError]           = useState(false);

  // ── DTC scan state ──
  const [scanning, setScanning]             = useState(false);
  const [dtcResults, setDtcResults]         = useState<ReportDtcResponse[]>([]);
  const [scanError, setScanError]           = useState<string | null>(null);
  const [scanOverlayVisible, setScanOverlayVisible] = useState(false);

  // ── Fuel estimation ──
  const [tripKm, setTripKm]                 = useState(0);
  const [fuelBaseline, setFuelBaseline]     = useState<FuelBaseline | null>(null);
  const [estimatedFuel, setEstimatedFuel]   = useState<number | null>(null);
  const [fuelModalVisible, setFuelModalVisible]       = useState(false);
  const [addVehicleVisible, setAddVehicleVisible]     = useState(false);
  const [prefillData, setPrefillData]       = useState<VehiclePrefill | undefined>();
  const lastPollTimeRef = useRef(Date.now());
  // Highest tripKm already written to storage — throttles the persist below.
  const lastPersistedTripRef = useRef(0);

  // ── OBD vehicle detection ──
  const [detectedVehicle, setDetectedVehicle] = useState<VinDecodeResult | null>(null);
  const vinCheckDoneRef = useRef(false);  // prevent re-checking in the same session

  // ── Polling timer ref ──
  const liveInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load user + events ────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!authUser) return;
    try {
      const [userData, events] = await Promise.all([
        getUser(authUser.id),
        getUserEvents(authUser.id),
      ]);
      setUser(userData);
      setSelectedVehicle(prev => prev ?? userData.vehicles?.[0] ?? null);
      setRecentEvents(events.slice(0, 3));
    } catch {
      // API unreachable — show empty state
    } finally {
      setLoading(false);
    }
    // Keyed on the id, not the whole object: refreshUser() hands back a new
    // AppUser instance on every call, and depending on that would refetch on
    // each one. An empty array here would capture the user from first render
    // and keep loading their data after a different account signs in.
  }, [authUser?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load fuel baseline when vehicle changes ───────────────────────────────
  const loadFuelBaseline = useCallback(async (vehicleId?: number) => {
    try {
      const stored = await AsyncStorage.getItem(fuelKey(vehicleId));
      if (!stored) return;

      const baseline: FuelBaseline = JSON.parse(stored);
      setFuelBaseline(baseline);

      // Restore the distance driven since the baseline was set. Without this
      // tripKm restarts at 0 every launch, kmDriven comes out 0, and the gauge
      // snaps back to the baseline percentage — reading HIGHER than the tank
      // actually is, which is the wrong direction to be wrong about fuel.
      const storedTrip = await AsyncStorage.getItem(tripKey(vehicleId));
      const restored   = storedTrip ? parseFloat(storedTrip) : 0;
      const safeTrip   = Number.isFinite(restored) ? restored : 0;

      setTripKm(prev => Math.max(prev, safeTrip, baseline.tripKm));
      lastPersistedTripRef.current = Math.max(safeTrip, baseline.tripKm);
    } catch { /* ignore storage errors */ }
  }, []);

  const saveFuelBaseline = useCallback(async (baseline: FuelBaseline, vehicleId?: number) => {
    try {
      await AsyncStorage.multiSet([
        [fuelKey(vehicleId), JSON.stringify(baseline)],
        // Anchor the odometer to the baseline so the next launch measures
        // depletion from here rather than from a stale larger number.
        [tripKey(vehicleId), String(baseline.tripKm)],
      ]);
      lastPersistedTripRef.current = baseline.tripKm;
      setFuelBaseline(baseline);
    } catch { /* ignore */ }
  }, []);

  // ── Check scanner & start live-data polling ───────────────────────────────
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

  const pollLive = useCallback(async () => {
    if (!scannerOnline) return;
    try {
      const now = Date.now();
      const data = await getLiveData();

      // Accumulate trip distance for fuel estimation
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

  useEffect(() => {
    loadFuelBaseline(selectedVehicle?.id);
  }, [selectedVehicle, loadFuelBaseline]);

  // ── Persist accumulated distance so the estimate survives a restart ───────
  useEffect(() => {
    if (tripKm - lastPersistedTripRef.current < TRIP_PERSIST_KM) return;
    lastPersistedTripRef.current = tripKm;
    AsyncStorage.setItem(tripKey(selectedVehicle?.id), String(tripKm))
      .catch(() => { /* storage full or unavailable — estimate degrades, no crash */ });
  }, [tripKm, selectedVehicle]);

  // ── OBD vehicle detection — runs once per real-car connection ────────────
  useEffect(() => {
    if (!scannerOnline || scannerStatus?.simMode) {
      vinCheckDoneRef.current = false;   // reset when disconnected / in sim
      return;
    }
    if (vinCheckDoneRef.current) return; // already checked this session
    vinCheckDoneRef.current = true;

    (async () => {
      try {
        const vinResult = await getVehicleVin();
        if (!vinResult.vin || vinResult.simMode) return;

        const decoded = await decodeVin(vinResult.vin);
        if (!decoded) return;

        // Only suggest adding if no vehicle in garage already matches
        const vehicles = user?.vehicles ?? [];
        const alreadyInGarage = vehicles.some(v => vinMatchesVehicle(decoded, v));
        if (!alreadyInGarage) setDetectedVehicle(decoded);
      } catch { /* VIN detection is best-effort — silent failure is fine */ }
    })();
  }, [scannerOnline, scannerStatus, user]);

  // Start / stop the 1 s live-data polling based on scanner availability
  useEffect(() => {
    if (scannerOnline) {
      pollLive(); // immediate first read
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

  // ── Recalculate estimated fuel whenever distance or baseline changes ───────
  useEffect(() => {
    if (!liveData || liveData.fuelPercent != null) {
      // Real OBD fuel reading available — no estimation needed
      setEstimatedFuel(null);
      return;
    }
    if (!fuelBaseline) {
      setEstimatedFuel(null);
      return;
    }
    // Arithmetic and its edge cases live in utils/fuel.ts so they can be
    // tested without mounting this screen — see __tests__/fuel.test.ts.
    setEstimatedFuel(estimateFuelPercent({
      baseline:  fuelBaseline,
      tripKm,
      avgL100km: selectedVehicle?.averageFuelConsumption,
    }));
  }, [liveData, fuelBaseline, tripKm, selectedVehicle]);

  // ── Auto-scan DTCs from hardware ─────────────────────────────────────────
  const handleScanDtcs = async () => {
    setScanError(null);
    setDtcResults([]);

    if (!scannerOnline) {
      setScanError('OBD-II adapter not found on your WiFi network.\nMake sure your phone and the scanner are on the same WiFi.');
      return;
    }

    setScanning(true);
    setScanOverlayVisible(true); // full-screen scan experience (ring + tiles)
    try {
      const { codes } = await scanDtcs();

      if (codes.length === 0) {
        setScanError('No active fault codes detected — your car is clean!');
        setScanning(false);
        return;
      }

      const responses = await Promise.all(
        codes.map(code => reportDtc(code, authUser!.id, selectedVehicle?.id))
      );
      setDtcResults(responses);
      loadData();

      // Local notification (Settings → "Fault scan alerts")
      const worst = worstSeverity(responses) ?? SeverityLevel.Green;
      sendFaultAlert(responses.length, severityMeta(c, worst).label);
    } catch {
      setScanError('Scan failed. Check that the adapter is connected to the car.');
    } finally {
      setScanning(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
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

  // Overall health derived from the most recent alerts
  const worstRecent: SeverityLevel | null = recentEvents.reduce<SeverityLevel | null>(
    (worst, ev) => {
      const s = ev.translation?.severity;
      if (s == null) return worst;
      return worst == null || s > worst ? s : worst;
    }, null);
  const healthGood = worstRecent == null || worstRecent === SeverityLevel.Green;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* ── Header: avatar + greeting ── */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{firstName[0]?.toUpperCase() ?? '?'}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.greetingSmall}>Good Morning</Text>
          <Text style={styles.greeting}>{firstName}</Text>
        </View>
      </View>

      {/* ── Vehicle card (name + health chip + Israeli plate) ── */}
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

      {/* ── Vehicle chips ── */}
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

      {/* ── OBD vehicle detection banner ── */}
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

      {/* ── Add vehicle button ── */}
      <Pressable style={styles.addVehicleBtn} onPress={() => setAddVehicleVisible(true)}>
        <Text style={styles.addVehicleBtnText}>＋  Add vehicle</Text>
      </Pressable>

      {/* ── Vehicle health status card ── */}
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

      {/* ── Stat cards ── */}
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

      {/* ── Trip fuel planner shortcut (feature moved off the Mechanics tab) ── */}
      <Pressable style={styles.plannerCard} onPress={() => router.push('/trip-planner')}>
        <Text style={styles.plannerIcon}>🗺</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.plannerTitle}>Trip Fuel Planner</Text>
          <Text style={styles.plannerSub}>Estimate fuel & cost for a route with live traffic</Text>
        </View>
        <Text style={styles.plannerChevron}>›</Text>
      </Pressable>

      {/* ── OBD-II Adapter status banner ── */}
      <ScannerBanner online={scannerOnline} status={scannerStatus} onRetry={checkScanner} />

      {/* ── Live gauges ── */}
      {scannerOnline && liveData && !liveError && (
        <LiveGauges
          data={liveData}
          estimatedFuel={estimatedFuel}
          onSetFuel={() => setFuelModalVisible(true)}
        />
      )}

      {/* ── Scan button ── */}
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

      {/* ── DTC results ── */}
      {dtcResults.length > 0 && (
        <View>
          <Text style={styles.sectionTitle}>SCAN RESULTS</Text>
          {dtcResults.map((r, i) => (
            <DtcResultCard key={i} result={r} />
          ))}
        </View>
      )}

      {/* ── Recent alerts ── */}
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

      {/* ── Add vehicle modal ── */}
      <AddVehicleModal
        visible={addVehicleVisible}
        userId={authUser!.id}
        prefill={prefillData}
        onAdded={() => { setAddVehicleVisible(false); setPrefillData(undefined); loadData(); }}
        onClose={() => { setAddVehicleVisible(false); setPrefillData(undefined); }}
      />

      {/* ── Live scan overlay (Stitch live_scan design) ── */}
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

      {/* ── Fuel set modal ── */}
      <FuelSetModal
        visible={fuelModalVisible}
        currentEstimate={estimatedFuel ?? fuelBaseline?.pct ?? null}
        onSave={(pct, tankL) => {
          saveFuelBaseline({ pct, tankL, tripKm }, selectedVehicle?.id);
          setFuelModalVisible(false);
        }}
        onCancel={() => setFuelModalVisible(false)}
      />

    </ScrollView>
  );
}





// ─── Styles ────────────────────────────────────────────────────────────────────

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

  // Vehicle card with Israeli plate
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

  // Health status card
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
