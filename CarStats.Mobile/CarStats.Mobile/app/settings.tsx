/**
 * Settings — appearance (dark mode), notifications (fault alerts + child
 * safety arrival reminder), account, and about. Styled in the app's
 * Soft Tech card idiom; every toggle is wired to a real feature.
 */

import React, { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { useAuth } from '@/context/AuthContext';
import { createThemedStyles, useTheme, ThemeMode } from '@/context/ThemeContext';
import {
  NotifPrefs,
  DEFAULT_PREFS,
  captureHomeLocation,
  disableChildReminder,
  enableChildReminder,
  ensureNotifPermission,
  loadPrefs,
  savePrefs,
} from '@/services/notifications';

const MODE_OPTIONS: { mode: ThemeMode; label: string }[] = [
  { mode: 'light',  label: 'Light' },
  { mode: 'dark',   label: 'Dark' },
  { mode: 'system', label: 'System' },
];

export default function SettingsScreen() {
  const { user } = useAuth();
  const { colors: c, mode, setMode } = useTheme();
  const s = useStyles();

  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS);
  const [busy, setBusy]   = useState(false);

  useEffect(() => { loadPrefs().then(setPrefs); }, []);

  const update = async (next: NotifPrefs) => {
    setPrefs(next);
    await savePrefs(next);
  };

  // ── Fault alerts toggle ────────────────────────────────────────────────────
  const toggleFaultAlerts = async (value: boolean) => {
    if (value && !(await ensureNotifPermission())) {
      Alert.alert('Permission needed', 'Allow notifications for CarStats to get scan alerts.');
      return;
    }
    await update({ ...prefs, faultAlerts: value });
  };

  // ── Child reminder toggle ──────────────────────────────────────────────────
  const toggleChildReminder = async (value: boolean) => {
    if (!value) {
      setBusy(true);
      await disableChildReminder();
      await update({ ...prefs, childReminder: false });
      setBusy(false);
      return;
    }
    if (prefs.homeLat == null || prefs.homeLng == null) {
      Alert.alert(
        'Set a home location first',
        'The reminder fires when you arrive at your saved location. Tap "Set home location" below, then enable the reminder.',
      );
      return;
    }
    setBusy(true);
    try {
      await enableChildReminder(prefs.homeLat, prefs.homeLng);
      await update({ ...prefs, childReminder: true });
    } catch (err: any) {
      Alert.alert('Could not enable reminder', err?.message ?? 'Unknown error.');
    } finally {
      setBusy(false);
    }
  };

  // ── Capture home location ──────────────────────────────────────────────────
  const setHome = async () => {
    setBusy(true);
    try {
      const { lat, lng } = await captureHomeLocation();
      const next = { ...prefs, homeLat: lat, homeLng: lng };
      await update(next);
      // Re-anchor an active geofence to the new spot
      if (prefs.childReminder) {
        await disableChildReminder();
        await enableChildReminder(lat, lng);
      }
      Alert.alert('Home location saved', 'The arrival reminder will trigger within ~150 m of this spot.');
    } catch (err: any) {
      Alert.alert('Could not save location', err?.message ?? 'Unknown error.');
    } finally {
      setBusy(false);
    }
  };

  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>

      {/* ── Appearance ── */}
      <Text style={s.sectionLabel}>APPEARANCE</Text>
      <View style={s.card}>
        <Text style={s.rowTitle}>Theme</Text>
        <Text style={s.rowSub}>Dark mode re-skins the whole app instantly.</Text>
        <View style={s.segmentRow}>
          {MODE_OPTIONS.map(opt => (
            <Pressable
              key={opt.mode}
              style={[s.segment, mode === opt.mode && s.segmentActive]}
              onPress={() => setMode(opt.mode)}
            >
              <Text style={[s.segmentText, mode === opt.mode && s.segmentTextActive]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* ── Notifications ── */}
      <Text style={s.sectionLabel}>NOTIFICATIONS</Text>
      <View style={s.card}>
        <View style={s.switchRow}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={s.rowTitle}>Fault scan alerts</Text>
            <Text style={s.rowSub}>Notify me when a scan finds fault codes.</Text>
          </View>
          <Switch
            value={prefs.faultAlerts}
            onValueChange={toggleFaultAlerts}
            trackColor={{ true: c.Dashboard.accent, false: c.Dashboard.cardBorder }}
            thumbColor={c.Dashboard.card}
          />
        </View>

        <View style={s.divider} />

        <View style={s.switchRow}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={s.rowTitle}>Child safety reminder</Text>
            <Text style={s.rowSub}>
              When you arrive at your saved location, remind me to check the back seat.
            </Text>
          </View>
          <Switch
            value={prefs.childReminder}
            onValueChange={toggleChildReminder}
            disabled={busy}
            trackColor={{ true: c.Dashboard.accent, false: c.Dashboard.cardBorder }}
            thumbColor={c.Dashboard.card}
          />
        </View>

        <Pressable style={s.homeBtn} onPress={setHome} disabled={busy}>
          <Text style={s.homeBtnText}>
            {prefs.homeLat != null ? '📍  Update home location' : '📍  Set home location (use current spot)'}
          </Text>
          {prefs.homeLat != null && <Text style={s.homeSetBadge}>SET ✓</Text>}
        </Pressable>
      </View>

      {/* ── Account ── */}
      <Text style={s.sectionLabel}>ACCOUNT</Text>
      <View style={s.card}>
        <Text style={s.rowTitle}>{user?.fullName ?? '—'}</Text>
        <Text style={s.rowSub}>{user?.email ?? ''}</Text>
        <Text style={[s.rowSub, { marginTop: 6 }]}>
          Log out and other account actions live on the Profile tab.
        </Text>
      </View>

      {/* ── About ── */}
      <Text style={s.sectionLabel}>ABOUT</Text>
      <View style={s.card}>
        <View style={s.aboutRow}>
          <Text style={s.rowSub}>Version</Text>
          <Text style={s.rowTitle}>{version}</Text>
        </View>
        <View style={s.divider} />
        <Text style={s.rowSub}>
          CarStats — OBD-II diagnostics, fuel tracking and mechanic finder.
          End-of-year project.
        </Text>
      </View>

    </ScrollView>
  );
}

const useStyles = createThemedStyles((c) => StyleSheet.create({
  screen:  { flex: 1, backgroundColor: c.Dashboard.bg },
  content: { padding: 20, paddingBottom: 48 },

  sectionLabel: {
    fontSize: 11,
    color: c.Dashboard.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 8,
    marginTop: 16,
  },

  card: {
    backgroundColor: c.Dashboard.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.Dashboard.cardBorder,
    padding: 16,
  },

  rowTitle: { fontSize: 15, fontWeight: '700', color: c.Dashboard.textPrimary },
  rowSub:   { fontSize: 13, color: c.Dashboard.textSecondary, marginTop: 2, lineHeight: 18 },

  // Theme segmented control
  segmentRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.Dashboard.cardBorder,
    backgroundColor: c.Dashboard.bg,
    alignItems: 'center',
  },
  segmentActive: {
    borderColor: c.Dashboard.accent,
    backgroundColor: c.Dashboard.accentSoft,
  },
  segmentText:       { fontSize: 13, fontWeight: '600', color: c.Dashboard.textSecondary },
  segmentTextActive: { color: c.Dashboard.accent },

  switchRow: { flexDirection: 'row', alignItems: 'center' },
  divider:   { height: 1, backgroundColor: c.Dashboard.cardBorder, marginVertical: 14 },

  homeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    borderWidth: 1,
    borderColor: c.Dashboard.accent + '66',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  homeBtnText:  { fontSize: 14, fontWeight: '600', color: c.Dashboard.accent },
  homeSetBadge: { fontSize: 11, fontWeight: '800', color: c.Severity.green, letterSpacing: 1 },

  aboutRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
}));
