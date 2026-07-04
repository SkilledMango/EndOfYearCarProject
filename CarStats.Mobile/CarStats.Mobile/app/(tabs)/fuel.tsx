import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Circle, Defs, LinearGradient, Polyline, Stop } from 'react-native-svg';
import { Vehicle, getUser, updateVehicle } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { Dashboard, Fuel, Severity } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';

// ─── Fill-up log (stored in AsyncStorage per vehicle) ─────────────────────────

interface FillUp {
  id: number;       // Date.now() at creation
  date: string;     // ISO timestamp
  liters: number;
  price: number;    // total paid, ₪
  l100km: number | null; // computed when the user also logs km driven
}

const fillupsKey = (vehicleId: number) => `fuel_fillups_${vehicleId}`;

async function loadFillUps(vehicleId: number): Promise<FillUp[]> {
  try {
    const raw = await AsyncStorage.getItem(fillupsKey(vehicleId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveFillUps(vehicleId: number, entries: FillUp[]) {
  try {
    await AsyncStorage.setItem(fillupsKey(vehicleId), JSON.stringify(entries));
  } catch { /* storage full/unavailable — entries stay in memory this session */ }
}

/** Mean consumption across logged fill-ups (entries without km are skipped). */
const averageL100km = (entries: FillUp[]): number | null => {
  const vals = entries.map(e => e.l100km).filter((v): v is number => v != null);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
};

/**
 * % change of this month's average vs last month's (negative = improving).
 * Falls back to comparing the last two fill-ups when months are too sparse.
 */
const trendPct = (entries: FillUp[]): number | null => {
  const withVal = entries.filter(e => e.l100km != null);
  if (withVal.length < 2) return null;

  const monthOf = (e: FillUp) => e.date.slice(0, 7); // "2026-07"
  const byMonth = new Map<string, number[]>();
  for (const e of withVal) {
    const m = monthOf(e);
    byMonth.set(m, [...(byMonth.get(m) ?? []), e.l100km!]);
  }
  const months = [...byMonth.keys()].sort();
  if (months.length >= 2) {
    const avg = (vals: number[]) => vals.reduce((a, b) => a + b, 0) / vals.length;
    const cur  = avg(byMonth.get(months[months.length - 1])!);
    const prev = avg(byMonth.get(months[months.length - 2])!);
    return ((cur - prev) / prev) * 100;
  }
  const sorted = [...withVal].sort((a, b) => a.date.localeCompare(b.date));
  const cur  = sorted[sorted.length - 1].l100km!;
  const prev = sorted[sorted.length - 2].l100km!;
  return ((cur - prev) / prev) * 100;
};

const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// ─── Trend chart (Stitch: SVG polyline in a 100×100 viewBox, stretched) ───────

function TrendChart({ values }: { values: number[] }) {
  // Y bounds: symmetric window around the data, at least ±1 like the design's
  // 6.0 / 7.0 / 8.0 rails, widened when readings spread further apart.
  const min  = Math.min(...values);
  const max  = Math.max(...values);
  const span = Math.max(2, max - min + 0.8);
  const mid  = (min + max) / 2;
  const hi   = mid + span / 2;
  const lo   = mid - span / 2;

  // The grid rows have 8px vertical padding inside the 160px chart, which is
  // 5 units of the 100-unit viewBox — points map into that padded band.
  const y = (v: number) => 5 + ((hi - v) / (hi - lo)) * 90;
  const x = (i: number) => (values.length > 1 ? (i * 100) / (values.length - 1) : 50);
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');

  return (
    <View style={styles.chartArea}>
      {/* Y-axis labels */}
      <View style={styles.chartYAxis}>
        <Text style={styles.chartYLabel}>{hi.toFixed(1)}</Text>
        <Text style={styles.chartYLabel}>{mid.toFixed(1)}</Text>
        <Text style={styles.chartYLabel}>{lo.toFixed(1)}</Text>
      </View>
      <View style={styles.chartPlot}>
        {/* Grid lines */}
        <View style={styles.chartGrid}>
          <View style={styles.chartGridLine} />
          <View style={styles.chartGridLine} />
          <View style={styles.chartGridLine} />
        </View>
        <Svg
          style={StyleSheet.absoluteFill}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <Defs>
            <LinearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor={Dashboard.accentDeep} />
              <Stop offset="100%" stopColor={Dashboard.accent} />
            </LinearGradient>
          </Defs>
          {values.length > 1 && (
            <Polyline
              points={points}
              fill="none"
              stroke="url(#lineGrad)"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {values.map((v, i) => (
            <Circle
              key={i}
              cx={x(i)}
              cy={y(v)}
              r={3}
              fill={Dashboard.card}
              stroke={Dashboard.accentDeep}
              strokeWidth={2}
            />
          ))}
        </Svg>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function FuelScreen() {
  const { user: authUser } = useAuth();
  const [vehicles, setVehicles]       = useState<Vehicle[]>([]);
  const [vehicleIdx, setVehicleIdx]   = useState(0);
  const [fillUps, setFillUps]         = useState<FillUp[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);

  // Add fill-up modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [liters, setLiters]   = useState('');
  const [price, setPrice]     = useState('');
  const [km, setKm]           = useState('');
  const [saving, setSaving]   = useState(false);

  const vehicle = vehicles[vehicleIdx] ?? null;

  const load = useCallback(async (isRefresh = false) => {
    if (!authUser) return;
    if (isRefresh) setRefreshing(true);
    try {
      const user = await getUser(authUser.id);
      setVehicles(user.vehicles ?? []);
    } catch { /* API unreachable — keep whatever we have */ }
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authUser]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (vehicle) loadFillUps(vehicle.id).then(setFillUps);
    else setFillUps([]);
  }, [vehicle?.id]);

  // Sorted newest-first for the history list; chronological for the chart
  const history = useMemo(
    () => [...fillUps].sort((a, b) => b.date.localeCompare(a.date)),
    [fillUps],
  );
  const chartValues = useMemo(() => {
    const chrono = [...fillUps].sort((a, b) => a.date.localeCompare(b.date));
    return chrono.map(e => e.l100km).filter((v): v is number => v != null).slice(-5);
  }, [fillUps]);

  const loggedAvg  = averageL100km(fillUps);
  // Fall back to the value from the registry/EPA/AI lookup chain until the
  // user has logged a fill-up with distance.
  const displayAvg = loggedAvg ?? (vehicle && vehicle.averageFuelConsumption > 0
    ? vehicle.averageFuelConsumption
    : null);
  const trend = trendPct(fillUps);

  const persist = async (entries: FillUp[]) => {
    if (!vehicle) return;
    setFillUps(entries);
    await saveFillUps(vehicle.id, entries);
    // Keep the API's per-vehicle average in sync with the logged data so the
    // rest of the app (garage card, admin panel) sees the same number.
    const avg = averageL100km(entries);
    if (avg != null) {
      try {
        await updateVehicle(vehicle.id, {
          ...vehicle,
          averageFuelConsumption: Math.round(avg * 10) / 10,
        });
      } catch { /* offline — local log is still saved */ }
    }
  };

  const handleAdd = async () => {
    const l = parseFloat(liters);
    const p = parseFloat(price);
    const k = km.trim() === '' ? null : parseFloat(km);
    if (isNaN(l) || l <= 0)  { Alert.alert('Invalid amount', 'Enter the litres you filled (e.g. 45).'); return; }
    if (isNaN(p) || p <= 0)  { Alert.alert('Invalid price', 'Enter the total you paid in ₪ (e.g. 320).'); return; }
    if (k != null && (isNaN(k) || k <= 0)) {
      Alert.alert('Invalid distance', 'Km driven must be a positive number, or leave it empty.');
      return;
    }
    const l100km = k != null ? Math.round((l / k) * 100 * 10) / 10 : null;
    if (l100km != null && (l100km < 2 || l100km > 35)) {
      Alert.alert(
        'Check your numbers',
        `${l100km} L/100km is outside the realistic range. Double-check litres and km.`,
      );
      return;
    }
    setSaving(true);
    const entry: FillUp = { id: Date.now(), date: new Date().toISOString(), liters: l, price: p, l100km };
    await persist([...fillUps, entry]);
    setSaving(false);
    setModalVisible(false);
    setLiters(''); setPrice(''); setKm('');
  };

  const handleDelete = (entry: FillUp) => {
    Alert.alert('Delete fill-up?', `${formatDay(entry.date)} · ${entry.liters}L · ₪${entry.price}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => persist(fillUps.filter(e => e.id !== entry.id)),
      },
    ]);
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
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Dashboard.accent} />
        }
      >
        {/* ── Header: title + vehicle switcher ── */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.screenTitle}>Fuel Tracking</Text>
            {vehicle && vehicles.length > 1 && (
              <Text style={styles.screenSubtitle}>
                {vehicle.make} {vehicle.model}
              </Text>
            )}
          </View>
          {vehicles.length > 1 && (
            <Pressable
              style={styles.switcherBtn}
              onPress={() => setVehicleIdx(i => (i + 1) % vehicles.length)}
            >
              <IconSymbol name="car.fill" size={24} color={Dashboard.accentDeep} />
            </Pressable>
          )}
        </View>

        {vehicles.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>⛽</Text>
            <Text style={styles.emptyText}>No vehicles yet.</Text>
            <Text style={styles.emptySubtext}>Add a vehicle in your garage to start tracking fuel.</Text>
          </View>
        ) : (
          <>
            {/* ── Hero: average consumption ── */}
            <View style={styles.heroCard}>
              <View style={styles.heroAccentBar} />
              <Text style={styles.heroLabel}>Average Consumption</Text>
              <View style={styles.heroValueRow}>
                <Text style={styles.heroValue}>{displayAvg != null ? displayAvg.toFixed(1) : '—'}</Text>
                <Text style={styles.heroUnit}>L/100km</Text>
              </View>
              {trend != null ? (
                <View style={styles.trendRow}>
                  <IconSymbol
                    name={trend <= 0 ? 'arrow.down' : 'arrow.up'}
                    size={16}
                    color={trend <= 0 ? Fuel.trendGreen : Severity.red}
                  />
                  <Text style={[styles.trendText, { color: trend <= 0 ? Fuel.trendGreen : Severity.red }]}>
                    {Math.abs(trend).toFixed(0)}% from last month
                  </Text>
                </View>
              ) : (
                <Text style={styles.trendHint}>
                  {loggedAvg == null ? 'Estimated for your model — log fill-ups to track your real usage'
                                     : 'Log more fill-ups to see your trend'}
                </Text>
              )}
            </View>

            {/* ── Chart: recent trend ── */}
            <View style={styles.chartCard}>
              <View style={styles.chartHeader}>
                <Text style={styles.chartTitle}>Recent Trend</Text>
                <Text style={styles.chartCaption}>
                  Last {Math.max(chartValues.length, 1)} Fill-up{chartValues.length === 1 ? '' : 's'}
                </Text>
              </View>
              {chartValues.length > 0 ? (
                <TrendChart values={chartValues} />
              ) : (
                <View style={styles.chartEmpty}>
                  <Text style={styles.chartEmptyText}>
                    Log a fill-up with km driven to see your consumption trend.
                  </Text>
                </View>
              )}
            </View>

            {/* ── History ── */}
            <Text style={styles.historyTitle}>History</Text>
            {history.length === 0 ? (
              <Text style={styles.historyEmpty}>No fill-ups logged yet. Tap + to add your first.</Text>
            ) : (
              <View style={styles.historyList}>
                {history.map(entry => (
                  <Pressable key={entry.id} style={styles.entryCard} onLongPress={() => handleDelete(entry)}>
                    <View style={styles.entryLeft}>
                      <View style={styles.entryIconChip}>
                        <IconSymbol name="fuelpump.fill" size={20} color={Dashboard.accentDeep} />
                      </View>
                      <View>
                        <Text style={styles.entryDate}>{formatDay(entry.date)}</Text>
                        <Text style={styles.entryLiters}>{entry.liters}L</Text>
                      </View>
                    </View>
                    <Text style={styles.entryPrice}>₪{entry.price}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* ── FAB: log fill-up ── */}
      {vehicle && (
        <Pressable style={styles.fab} onPress={() => setModalVisible(true)}>
          <IconSymbol name="plus" size={28} color="#FFFFFF" />
        </Pressable>
      )}

      {/* ── Add fill-up modal ── */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setModalVisible(false)} />
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Log Fill-up</Text>
            <Text style={styles.modalLabel}>Litres filled</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. 45"
              placeholderTextColor={Dashboard.textSecondary}
              keyboardType="decimal-pad"
              value={liters}
              onChangeText={setLiters}
              autoFocus
            />
            <Text style={styles.modalLabel}>Total paid (₪)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. 320"
              placeholderTextColor={Dashboard.textSecondary}
              keyboardType="decimal-pad"
              value={price}
              onChangeText={setPrice}
            />
            <Text style={styles.modalLabel}>Km driven since last fill-up (optional)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. 650 — used to compute L/100km"
              placeholderTextColor={Dashboard.textSecondary}
              keyboardType="number-pad"
              value={km}
              onChangeText={setKm}
            />
            <Pressable
              style={[styles.modalSaveBtn, saving && { opacity: 0.6 }]}
              onPress={handleAdd}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.modalSaveText}>Save Fill-up</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Styles (values from design/stitch_carstats_diagnostic_suite/fuel_tracking) ─

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: Dashboard.bg },
  centered:       { justifyContent: 'center', alignItems: 'center' },
  content:        { paddingHorizontal: 20, paddingTop: 64, paddingBottom: 120 },

  header:         { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  screenTitle:    { fontSize: 20, lineHeight: 28, fontWeight: '700', color: Dashboard.accentDeep },
  screenSubtitle: { fontSize: 13, color: Dashboard.textSecondary, marginTop: 2 },
  switcherBtn:    {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },

  // Hero card
  heroCard:       {
    backgroundColor: Dashboard.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Dashboard.cardBorder,
    padding: 24,
    marginBottom: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  heroAccentBar:  {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: 2,
    backgroundColor: Fuel.mintBar,
  },
  heroLabel:      { fontSize: 16, lineHeight: 24, color: Dashboard.textSecondary, marginBottom: 4 },
  heroValueRow:   { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 4 },
  heroValue:      { fontSize: 28, lineHeight: 34, fontWeight: '700', color: Dashboard.textPrimary },
  heroUnit:       { fontSize: 16, color: Dashboard.textSecondary },
  trendRow:       { flexDirection: 'row', alignItems: 'center', gap: 4 },
  trendText:      { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  trendHint:      { fontSize: 13, color: Dashboard.textSecondary },

  // Chart card
  chartCard:      {
    backgroundColor: Dashboard.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Dashboard.cardBorder,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  chartHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  chartTitle:     { fontSize: 16, fontWeight: '600', color: Dashboard.textPrimary },
  chartCaption:   { fontSize: 12, fontWeight: '600', letterSpacing: 0.6, color: Dashboard.textSecondary },
  chartArea:      { height: 160, flexDirection: 'row' },
  chartYAxis:     { width: 32, justifyContent: 'space-between', paddingVertical: 8 },
  chartYLabel:    { fontSize: 12, fontWeight: '600', color: Fuel.axisLabel },
  chartPlot:      { flex: 1 },
  chartGrid:      { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between', paddingVertical: 8 },
  chartGridLine:  { height: 1, backgroundColor: Fuel.gridLine },
  chartEmpty:     { height: 160, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  chartEmptyText: { fontSize: 13, color: Dashboard.textSecondary, textAlign: 'center', lineHeight: 18 },

  // History
  historyTitle:   { fontSize: 16, fontWeight: '600', color: Dashboard.textPrimary, marginBottom: 16, paddingHorizontal: 4 },
  historyEmpty:   { fontSize: 13, color: Dashboard.textSecondary, paddingHorizontal: 4 },
  historyList:    { gap: 8 },
  entryCard:      {
    backgroundColor: Dashboard.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Dashboard.cardBorder,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  entryLeft:      { flexDirection: 'row', alignItems: 'center', gap: 16 },
  entryIconChip:  {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Fuel.chipBg,
    alignItems: 'center', justifyContent: 'center',
  },
  entryDate:      { fontSize: 16, lineHeight: 24, fontWeight: '500', color: Dashboard.textPrimary },
  entryLiters:    { fontSize: 14, lineHeight: 20, color: Dashboard.textSecondary },
  entryPrice:     { fontSize: 16, fontWeight: '600', color: Dashboard.textPrimary },

  // FAB
  fab:            {
    position: 'absolute', right: 20, bottom: 24,
    width: 56, height: 56, borderRadius: 12,
    backgroundColor: Dashboard.accentDeep,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Dashboard.accentDeep,
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },

  // Add fill-up modal
  modalBackdrop:  { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(25,27,35,0.4)' },
  modalSheet:     {
    backgroundColor: Dashboard.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle:     { fontSize: 20, fontWeight: '700', color: Dashboard.textPrimary, marginBottom: 16 },
  modalLabel:     { fontSize: 13, fontWeight: '600', color: Dashboard.textSecondary, marginBottom: 6 },
  modalInput:     {
    backgroundColor: Dashboard.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Dashboard.cardBorder,
    color: Dashboard.textPrimary,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  modalSaveBtn:   {
    backgroundColor: Dashboard.accentDeep,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  modalSaveText:  { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },

  // Empty state
  emptyState:     { alignItems: 'center', paddingTop: 80 },
  emptyIcon:      { fontSize: 48 },
  emptyText:      { fontSize: 17, fontWeight: '600', color: Dashboard.textPrimary, marginTop: 12 },
  emptySubtext:   { fontSize: 13, color: Dashboard.textSecondary, marginTop: 6, textAlign: 'center' },
});
