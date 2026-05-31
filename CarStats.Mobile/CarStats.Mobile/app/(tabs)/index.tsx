import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
  isScannerReachable,
  scanDtcs,
} from '@/services/scanner';
import { Dashboard, Severity } from '@/constants/theme';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const severityColor = (s: SeverityLevel | undefined) => {
  switch (s) {
    case SeverityLevel.Green:  return Severity.green;
    case SeverityLevel.Red:    return Severity.red;
    default:                   return Severity.yellow;
  }
};

// ─── Home Screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { user: authUser, logout }            = useAuth();

  // ── User / vehicle state ──
  const [user, setUser]                       = useState<AppUser | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [recentEvents, setRecentEvents]       = useState<VehicleEventEnriched[]>([]);
  const [loading, setLoading]                 = useState(true);

  // ── Scanner state ──
  const [scannerOnline, setScannerOnline]     = useState(false);
  const [scannerStatus, setScannerStatus]     = useState<ScannerStatus | null>(null);
  const [liveData, setLiveData]               = useState<LiveData | null>(null);
  const [liveError, setLiveError]             = useState(false);

  // ── DTC scan state ──
  const [scanning, setScanning]               = useState(false);
  const [dtcResults, setDtcResults]           = useState<ReportDtcResponse[]>([]);
  const [scanError, setScanError]             = useState<string | null>(null);

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
      const data = await getLiveData();
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

  // ── Auto-scan DTCs from hardware ─────────────────────────────────────────
  const handleScanDtcs = async () => {
    setScanError(null);
    setDtcResults([]);

    if (!scannerOnline) {
      setScanError('OBD-II adapter not found on your WiFi network.\nMake sure your phone and the scanner are on the same WiFi.');
      return;
    }

    setScanning(true);
    try {
      const { codes } = await scanDtcs();

      if (codes.length === 0) {
        setScanError('No active fault codes detected — your car is clean!');
        setScanning(false);
        return;
      }

      // Report each code to the CarStats API so it is logged + translated
      const responses = await Promise.all(
        codes.map(code => reportDtc(code, authUser!.id, selectedVehicle?.id))
      );
      setDtcResults(responses);
      loadData(); // refresh fault count + recent events
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
        <ActivityIndicator size="large" color={Dashboard.accent} />
      </View>
    );
  }

  const firstName    = user?.fullName?.split(' ')[0] ?? 'Driver';
  const vehicles     = user?.vehicles ?? [];
  const vehicleName  = selectedVehicle
    ? `${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model}`
    : 'No vehicle registered';
  const vehiclePlate = selectedVehicle?.licensePlate ?? '—';
  const fuelAvg      = selectedVehicle?.averageFuelConsumption ?? null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>Good day, {firstName}</Text>
          <Text style={styles.vehicleInfo}>{vehicleName}{'  ·  '}{vehiclePlate}</Text>
        </View>
        <Pressable onPress={logout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Sign out</Text>
        </Pressable>
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
            (user?.totalFaultsLogged ?? 0) > 0 && { color: Severity.yellow },
          ]}>
            {user?.totalFaultsLogged ?? 0}
          </Text>
          <Text style={styles.statLabel}>Faults logged</Text>
        </View>
      </View>

      {/* ── OBD-II Adapter status banner ── */}
      <ScannerBanner online={scannerOnline} status={scannerStatus} onRetry={checkScanner} />

      {/* ── Live gauges (only shown when adapter is online and sending data) ── */}
      {scannerOnline && liveData && !liveError && (
        <LiveGauges data={liveData} />
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
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.scanButtonText}>SCAN MY CAR</Text>}
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
                { backgroundColor: severityColor(ev.translation?.severity) },
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

    </ScrollView>
  );
}

// ─── Scanner banner ────────────────────────────────────────────────────────────

function ScannerBanner({
  online,
  status,
  onRetry,
}: {
  online: boolean;
  status: ScannerStatus | null;
  onRetry: () => void;
}) {
  return (
    <View style={[bannerStyles.row, online ? bannerStyles.online : bannerStyles.offline]}>
      <View style={[bannerStyles.dot, { backgroundColor: online ? Severity.green : Severity.unknown }]} />
      <View style={{ flex: 1 }}>
        <Text style={bannerStyles.title}>
          {online ? 'OBD-II Adapter Connected' : 'Adapter Not Found'}
        </Text>
        {online && status ? (
          <Text style={bannerStyles.sub}>
            {status.simMode ? '⚠ Simulation mode — no car connected' : '✓ Reading live car data'}
            {'  ·  Uptime '}{Math.floor(status.uptimeSeconds / 60)}m
          </Text>
        ) : (
          <Text style={bannerStyles.sub}>Looking for carstats-scanner.local on your network…</Text>
        )}
      </View>
      {!online && (
        <Pressable onPress={onRetry} style={bannerStyles.retryBtn}>
          <Text style={bannerStyles.retryText}>RETRY</Text>
        </Pressable>
      )}
    </View>
  );
}

const bannerStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 20,
    gap: 10,
  },
  online:    { borderColor: Severity.green  + '55', backgroundColor: Severity.green  + '11' },
  offline:   { borderColor: Dashboard.cardBorder,   backgroundColor: Dashboard.card },
  dot:       { width: 8, height: 8, borderRadius: 4 },
  title:     { fontSize: 13, fontWeight: '600', color: Dashboard.textPrimary },
  sub:       { fontSize: 11, color: Dashboard.textSecondary, marginTop: 2 },
  retryBtn:  { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: Dashboard.accent },
  retryText: { fontSize: 11, fontWeight: '700', color: Dashboard.accent, letterSpacing: 1 },
});

// ─── Live gauges ───────────────────────────────────────────────────────────────

function LiveGauges({ data }: { data: LiveData }) {
  const rpmPct  = Math.min(data.rpm / 7000, 1);
  const loadPct = data.engineLoadPct / 100;

  return (
    <View style={gaugeStyles.card}>
      <Text style={gaugeStyles.cardTitle}>LIVE ENGINE DATA</Text>
      <View style={gaugeStyles.grid}>
        <GaugeTile
          label="RPM"
          value={data.rpm.toLocaleString()}
          subValue={`${data.engineLoadPct}% load`}
          barPct={rpmPct}
          barColor={rpmPct > 0.8 ? Severity.red : rpmPct > 0.6 ? Severity.yellow : Severity.green}
        />
        <GaugeTile
          label="SPEED"
          value={`${data.speedKmh}`}
          subValue="km/h"
          barPct={Math.min(data.speedKmh / 200, 1)}
          barColor={Dashboard.accent}
        />
        <GaugeTile
          label="COOLANT"
          value={`${data.coolantCelsius}°`}
          subValue="Celsius"
          barPct={Math.min((data.coolantCelsius + 40) / 160, 1)}
          barColor={data.coolantCelsius > 110 ? Severity.red : data.coolantCelsius > 95 ? Severity.yellow : Severity.green}
        />
        <GaugeTile
          label="FUEL"
          value={`${data.fuelPercent}%`}
          subValue="in tank"
          barPct={data.fuelPercent / 100}
          barColor={data.fuelPercent < 15 ? Severity.red : data.fuelPercent < 30 ? Severity.yellow : Severity.green}
        />
      </View>
    </View>
  );
}

function GaugeTile({
  label,
  value,
  subValue,
  barPct,
  barColor,
}: {
  label: string;
  value: string;
  subValue: string;
  barPct: number;
  barColor: string;
}) {
  return (
    <View style={gaugeStyles.tile}>
      <Text style={gaugeStyles.tileLabel}>{label}</Text>
      <Text style={gaugeStyles.tileValue}>{value}</Text>
      <Text style={gaugeStyles.tileSub}>{subValue}</Text>
      <View style={gaugeStyles.barTrack}>
        <View style={[gaugeStyles.barFill, { width: `${Math.round(barPct * 100)}%`, backgroundColor: barColor }]} />
      </View>
    </View>
  );
}

const gaugeStyles = StyleSheet.create({
  card: {
    backgroundColor: Dashboard.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Dashboard.cardBorder,
    padding: 16,
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 11,
    color: Dashboard.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 14,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  tile: {
    width: '47%',
    backgroundColor: Dashboard.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Dashboard.cardBorder,
    padding: 12,
  },
  tileLabel: {
    fontSize: 10,
    color: Dashboard.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  tileValue: {
    fontSize: 26,
    fontWeight: '700',
    color: Dashboard.textPrimary,
  },
  tileSub: {
    fontSize: 11,
    color: Dashboard.textSecondary,
    marginBottom: 10,
  },
  barTrack: {
    height: 4,
    backgroundColor: Dashboard.cardBorder,
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: 4,
    borderRadius: 2,
  },
});

// ─── DTC Result card ───────────────────────────────────────────────────────────

const SEVERITY_META: Record<SeverityLevel, { label: string; accent: string }> = {
  [SeverityLevel.Green]:  { label: 'ALL CLEAR', accent: Severity.green },
  [SeverityLevel.Yellow]: { label: 'WARNING',   accent: Severity.yellow },
  [SeverityLevel.Red]:    { label: 'CRITICAL',  accent: Severity.red },
};

function DtcResultCard({ result }: { result: ReportDtcResponse }) {
  const t   = result.translation;
  const sev = (t?.severity ?? result.severity ?? SeverityLevel.Yellow) as SeverityLevel;
  const meta = SEVERITY_META[sev];

  return (
    <View style={[styles.resultCard, { borderColor: meta.accent }]}>
      <View style={styles.resultHeader}>
        <Text style={[styles.resultBadge, { color: meta.accent }]}>{meta.label}</Text>
        {t && <Text style={styles.resultCode}>{t.errorCode}</Text>}
      </View>
      <Text style={styles.resultTitle}>{t?.humanTitle ?? 'Unknown code detected'}</Text>
      <Text style={styles.resultBody}>
        {t?.description ?? result.message ?? 'Please contact support or check your manual.'}
      </Text>
      {t && (
        <View style={[styles.costPill, { borderColor: meta.accent }]}>
          <Text style={styles.costLabel}>EST. REPAIR COST</Text>
          <Text style={[styles.costValue, { color: meta.accent }]}>
            ${t.estimatedCostMin} – ${t.estimatedCostMax}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:             { flex: 1, backgroundColor: Dashboard.bg },
  centered:              { justifyContent: 'center', alignItems: 'center' },
  content:               { padding: 24, paddingTop: 64, paddingBottom: 40 },

  header:                { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  greeting:              { fontSize: 26, fontWeight: '700', color: Dashboard.textPrimary },
  vehicleInfo:           { fontSize: 14, color: Dashboard.textSecondary, marginTop: 4 },
  logoutBtn:             { paddingTop: 4, paddingLeft: 8 },
  logoutText:            { fontSize: 12, color: Dashboard.textSecondary },

  vehicleScroll:         { marginBottom: 20 },
  vehicleScrollContent:  { gap: 8, paddingVertical: 4 },
  vehicleChip:           {
    borderWidth: 1,
    borderColor: Dashboard.cardBorder,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: Dashboard.card,
  },
  vehicleChipActive:     { borderColor: Dashboard.accent, backgroundColor: Dashboard.accent + '22' },
  vehicleChipText:       { fontSize: 13, color: Dashboard.textSecondary },
  vehicleChipTextActive: { color: Dashboard.accent, fontWeight: '600' },

  statsRow:              { flexDirection: 'row', gap: 12, marginBottom: 20 },
  statCard:              {
    flex: 1,
    backgroundColor: Dashboard.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Dashboard.cardBorder,
    padding: 16,
    alignItems: 'center',
  },
  statValue:             { fontSize: 28, fontWeight: '700', color: Dashboard.textPrimary },
  statLabel:             { fontSize: 12, color: Dashboard.textSecondary, marginTop: 4, textAlign: 'center' },

  scanCard:              {
    backgroundColor: Dashboard.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Dashboard.cardBorder,
    padding: 20,
    marginBottom: 24,
  },
  scanLabel:             { fontSize: 11, color: Dashboard.textSecondary, letterSpacing: 1.5, marginBottom: 8 },
  scanHint:              { fontSize: 13, color: Dashboard.textSecondary, lineHeight: 18, marginBottom: 14 },
  scanButton:            { backgroundColor: Dashboard.accent, borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  scanButtonDisabled:    { opacity: 0.5 },
  scanButtonText:        { color: '#fff', fontWeight: '700', fontSize: 15, letterSpacing: 1.5 },
  scanErrorText:         { color: Severity.yellow, fontSize: 12, marginTop: 10, lineHeight: 17 },

  resultCard:            {
    backgroundColor: Dashboard.card,
    borderRadius: 12,
    borderWidth: 1,
    padding: 20,
    marginBottom: 12,
    gap: 10,
  },
  resultHeader:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resultBadge:           { fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  resultCode:            { fontSize: 13, fontWeight: '700', color: Dashboard.textSecondary, letterSpacing: 1 },
  resultTitle:           { fontSize: 20, fontWeight: '700', color: Dashboard.textPrimary },
  resultBody:            { fontSize: 14, color: Dashboard.textSecondary, lineHeight: 20 },
  costPill:              {
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  costLabel:             { fontSize: 10, color: Dashboard.textSecondary, letterSpacing: 1.5, marginBottom: 4 },
  costValue:             { fontSize: 22, fontWeight: '700' },

  sectionTitle:          { fontSize: 11, color: Dashboard.textSecondary, letterSpacing: 1.5, marginBottom: 12 },
  alertRow:              {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Dashboard.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Dashboard.cardBorder,
    padding: 14,
    marginBottom: 8,
  },
  severityDot:           { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  alertText:             { flex: 1 },
  alertCode:             { fontSize: 12, color: Dashboard.textSecondary, fontWeight: '600', letterSpacing: 1 },
  alertTitle:            { fontSize: 14, color: Dashboard.textPrimary, marginTop: 2 },
});
