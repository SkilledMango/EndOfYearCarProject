/**
 * Settings — appearance (dark mode), notifications (fault alerts + child
 * safety arrival reminder), account, and about. Styled in the app's
 * Soft Tech card idiom; every toggle is wired to a real feature.
 */

import React, { useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
// Paper's Switch/Divider/Button pick their colors up from the themed
// PaperProvider in app/_layout.tsx, so they need no explicit color props.
import { Button, Divider, SegmentedButtons, Switch, TextInput } from 'react-native-paper';
import Constants from 'expo-constants';
import { geocodeAddress } from '@/services/api';
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
  // No `colors` needed here any more — every control on this screen now takes
  // its colors from the themed PaperProvider.
  const { mode, setMode } = useTheme();
  const s = useStyles();

  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS);
  const [busy, setBusy]   = useState(false);
  const [homeAddress, setHomeAddress] = useState('');

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
        'The reminder fires when you arrive at your saved location. Set a home address below, then enable the reminder.',
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
  /** Stores a home position and re-anchors an active geofence to it. */
  const saveHome = async (lat: number, lng: number, label: string) => {
    const next = { ...prefs, homeLat: lat, homeLng: lng };
    await update(next);
    if (prefs.childReminder) {
      await disableChildReminder();
      await enableChildReminder(lat, lng);
    }
    Alert.alert(
      'Home location saved',
      `${label}\n\nThe arrival reminder will trigger within ~150 m of this spot.`,
    );
  };

  // Typing an address needs no GPS at all, which matters on a device that
  // cannot get a fix — and lets you set a home you are not currently at.
  const setHomeFromAddress = async () => {
    const query = homeAddress.trim();
    if (!query) { Alert.alert('Enter an address', 'Type your home address first.'); return; }

    setBusy(true);
    try {
      const found = await geocodeAddress(query);
      if (!found) {
        Alert.alert('Address not found', 'Try adding the city, e.g. "Agmon 13, Hadera".');
        return;
      }
      await saveHome(found.latitude, found.longitude, found.formattedAddress);
      setHomeAddress('');
    } catch {
      Alert.alert('Could not save location', 'Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const setHomeFromGps = async () => {
    setBusy(true);
    try {
      const { lat, lng } = await captureHomeLocation();
      await saveHome(lat, lng, 'Using your current position.');
    } catch (err: any) {
      Alert.alert('Could not get your location', err?.message ?? 'Type your address instead.');
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
        <SegmentedButtons
          style={s.segmentRow}
          value={mode}
          onValueChange={(v) => setMode(v as ThemeMode)}
          buttons={MODE_OPTIONS.map(opt => ({ value: opt.mode, label: opt.label }))}
        />
      </View>

      {/* ── Notifications ── */}
      <Text style={s.sectionLabel}>NOTIFICATIONS</Text>
      <View style={s.card}>
        <View style={s.switchRow}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={s.rowTitle}>Fault scan alerts</Text>
            <Text style={s.rowSub}>Notify me when a scan finds fault codes.</Text>
          </View>
          <Switch value={prefs.faultAlerts} onValueChange={toggleFaultAlerts} />
        </View>

        <Divider style={s.divider} />

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
          />
        </View>

        <Divider style={s.divider} />

        <Text style={s.rowTitle}>Home location</Text>
        <Text style={s.rowSub}>
          Used by the arrival reminder, and as a search point on the Mechanics tab.
        </Text>

        <TextInput
          mode="outlined"
          dense
          label="Home address"
          placeholder="e.g. Agmon 13, Hadera"
          value={homeAddress}
          onChangeText={setHomeAddress}
          disabled={busy}
          style={s.homeInput}
          left={<TextInput.Icon icon="home-outline" />}
          onSubmitEditing={setHomeFromAddress}
          returnKeyType="done"
        />

        <Button
          mode="contained"
          icon="content-save"
          onPress={setHomeFromAddress}
          disabled={busy || !homeAddress.trim()}
          style={s.homeBtn}
          contentStyle={s.homeBtnContent}
        >
          Save this address
        </Button>

        <Button
          mode="outlined"
          icon="crosshairs-gps"
          onPress={setHomeFromGps}
          disabled={busy}
          style={s.homeBtn}
          contentStyle={s.homeBtnContent}
        >
          Use my current location
        </Button>

        {prefs.homeLat != null && (
          <Text style={s.homeSetBadge}>
            SET ✓  {prefs.homeLat.toFixed(4)}, {prefs.homeLng?.toFixed(4)}
          </Text>
        )}
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
  switchRow: { flexDirection: 'row', alignItems: 'center' },
  // Paper's Divider draws its own hairline — this only spaces it.
  divider:   { marginVertical: 14 },

  homeInput:      { marginTop: 12 },
  homeBtn:        { marginTop: 10 },
  homeBtnContent: { paddingVertical: 4 },
  homeSetBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: c.Severity.green,
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 8,
  },

  aboutRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
}));
