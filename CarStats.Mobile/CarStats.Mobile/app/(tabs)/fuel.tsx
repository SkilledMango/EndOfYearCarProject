import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Vehicle,
  getUser,
  updateVehicle,
} from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { Dashboard, Severity } from '@/constants/theme';

// ─── Fuel efficiency thresholds (L / 100km) ───────────────────────────────
const EFFICIENT_THRESHOLD = 6.0;
const HIGH_THRESHOLD      = 9.0;
const MAX_BAR_VALUE       = 15.0; // bar is "full" at 15 L/100km

const getFuelRating = (consumption: number) => {
  if (consumption <= 0) {
    return {
      label:   'NO DATA',
      color:   Severity.unknown,
      verdict: 'Log your first reading to see your efficiency rating.',
    };
  }
  if (consumption < EFFICIENT_THRESHOLD) {
    return {
      label:   'EFFICIENT',
      color:   Severity.green,
      verdict: `${consumption.toFixed(1)} L/100km is excellent. Below average for most vehicles.`,
    };
  }
  if (consumption < HIGH_THRESHOLD) {
    return {
      label:   'AVERAGE',
      color:   Severity.yellow,
      verdict: `${consumption.toFixed(1)} L/100km is normal consumption for your vehicle class.`,
    };
  }
  return {
    label:   'HIGH USAGE',
    color:   Severity.red,
    verdict: `${consumption.toFixed(1)} L/100km is above average. A service check may help reduce fuel use.`,
  };
};

// ─── Per-vehicle card ──────────────────────────────────────────────────────

function VehicleCard({ vehicle, onUpdated }: { vehicle: Vehicle; onUpdated: () => void }) {
  const [editing, setEditing]   = useState(false);
  const [input, setInput]       = useState('');
  const [saving, setSaving]     = useState(false);

  const rating    = getFuelRating(vehicle.averageFuelConsumption);
  const barFill   = vehicle.averageFuelConsumption > 0
    ? Math.min(vehicle.averageFuelConsumption / MAX_BAR_VALUE, 1)
    : 0;

  const handleSave = async () => {
    const parsed = parseFloat(input);
    if (isNaN(parsed) || parsed < 0) {
      Alert.alert('Invalid value', 'Please enter a valid number (e.g. 7.5)');
      return;
    }
    setSaving(true);
    try {
      await updateVehicle(vehicle.id, {
        ...vehicle,
        averageFuelConsumption: parsed,
      });
      setEditing(false);
      setInput('');
      onUpdated();
    } catch {
      Alert.alert('Error', 'Could not save. Make sure the API is running.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.card}>
      {/* Vehicle name + plate */}
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.vehicleName}>
            {vehicle.year} {vehicle.make} {vehicle.model}
          </Text>
          <Text style={styles.vehiclePlate}>{vehicle.licensePlate || 'No plate'}</Text>
        </View>
        <View style={[styles.ratingBadge, { borderColor: rating.color }]}>
          <Text style={[styles.ratingLabel, { color: rating.color }]}>{rating.label}</Text>
        </View>
      </View>

      {/* Fuel bar */}
      <View style={styles.barTrack}>
        <View style={[
          styles.barFill,
          { width: `${barFill * 100}%` as any, backgroundColor: rating.color },
        ]} />
      </View>

      {/* Value */}
      <Text style={styles.consumption}>
        {vehicle.averageFuelConsumption > 0
          ? `${vehicle.averageFuelConsumption.toFixed(1)} L / 100km`
          : '— L / 100km'}
      </Text>

      {/* Verdict */}
      <Text style={styles.verdict}>{rating.verdict}</Text>

      {/* Update reading */}
      {editing ? (
        <View style={styles.editRow}>
          <TextInput
            style={styles.editInput}
            placeholder="e.g. 7.5"
            placeholderTextColor={Dashboard.textSecondary}
            value={input}
            onChangeText={setInput}
            keyboardType="decimal-pad"
            autoFocus
          />
          <Pressable
            style={[styles.saveBtn, saving && { opacity: 0.5 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.saveBtnText}>SAVE</Text>}
          </Pressable>
          <Pressable style={styles.cancelBtn} onPress={() => { setEditing(false); setInput(''); }}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable style={styles.updateBtn} onPress={() => setEditing(true)}>
          <Text style={styles.updateBtnText}>Update Reading</Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────

export default function FuelScreen() {
  const { user: authUser }        = useAuth();
  const [vehicles, setVehicles]   = useState<Vehicle[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!authUser) return;
    if (isRefresh) setRefreshing(true);
    try {
      const user = await getUser(authUser.id);
      setVehicles(user.vehicles ?? []);
    } catch {
      // API unreachable
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={Dashboard.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => load(true)}
          tintColor={Dashboard.accent}
        />
      }
    >
      <Text style={styles.screenTitle}>FUEL EFFICIENCY</Text>

      {/* Legend */}
      <View style={styles.legend}>
        <LegendItem color={Severity.green}  label={`Efficient  < ${EFFICIENT_THRESHOLD} L/100km`} />
        <LegendItem color={Severity.yellow} label={`Average  ${EFFICIENT_THRESHOLD}–${HIGH_THRESHOLD} L/100km`} />
        <LegendItem color={Severity.red}    label={`High  > ${HIGH_THRESHOLD} L/100km`} />
      </View>

      {vehicles.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>⛽</Text>
          <Text style={styles.emptyText}>No vehicles registered.</Text>
          <Text style={styles.emptySubtext}>
            Add a vehicle in the admin panel to start tracking fuel efficiency.
          </Text>
        </View>
      ) : (
        vehicles.map(v => (
          <VehicleCard key={v.id} vehicle={v} onUpdated={() => load()} />
        ))
      )}
    </ScrollView>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: Dashboard.bg },
  centered:       { justifyContent: 'center', alignItems: 'center' },
  content:        { padding: 24, paddingTop: 64, paddingBottom: 40 },

  screenTitle:    { fontSize: 11, color: Dashboard.textSecondary, letterSpacing: 1.5, marginBottom: 20 },

  legend:         { flexDirection: 'row', gap: 16, marginBottom: 24, flexWrap: 'wrap' },
  legendItem:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot:      { width: 8, height: 8, borderRadius: 4 },
  legendText:     { fontSize: 11, color: Dashboard.textSecondary },

  // Vehicle card
  card:           {
    backgroundColor: Dashboard.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Dashboard.cardBorder,
    padding: 18,
    marginBottom: 16,
    gap: 12,
  },
  cardHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  vehicleName:    { fontSize: 16, fontWeight: '700', color: Dashboard.textPrimary },
  vehiclePlate:   { fontSize: 12, color: Dashboard.textSecondary, marginTop: 2 },
  ratingBadge:    { borderWidth: 1, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  ratingLabel:    { fontSize: 10, fontWeight: '800', letterSpacing: 1 },

  // Fuel bar
  barTrack:       {
    height: 8,
    backgroundColor: Dashboard.bg,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill:        { height: '100%', borderRadius: 4 },

  consumption:    { fontSize: 28, fontWeight: '700', color: Dashboard.textPrimary },
  verdict:        { fontSize: 13, color: Dashboard.textSecondary, lineHeight: 18 },

  // Update reading
  updateBtn:      {
    borderWidth: 1,
    borderColor: Dashboard.cardBorder,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  updateBtnText:  { fontSize: 13, color: Dashboard.textSecondary, fontWeight: '600' },

  editRow:        { flexDirection: 'row', gap: 8, alignItems: 'center' },
  editInput:      {
    flex: 1,
    backgroundColor: Dashboard.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Dashboard.cardBorder,
    color: Dashboard.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  saveBtn:        { backgroundColor: Dashboard.accent, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
  saveBtnText:    { color: '#fff', fontWeight: '700', fontSize: 13, letterSpacing: 1 },
  cancelBtn:      { paddingHorizontal: 8, paddingVertical: 10 },
  cancelBtnText:  { color: Dashboard.textSecondary, fontSize: 13 },

  // Empty state
  emptyState:     { alignItems: 'center', paddingTop: 80 },
  emptyIcon:      { fontSize: 48 },
  emptyText:      { fontSize: 17, fontWeight: '600', color: Dashboard.textPrimary, marginTop: 12 },
  emptySubtext:   { fontSize: 13, color: Dashboard.textSecondary, marginTop: 6, textAlign: 'center' },
});
