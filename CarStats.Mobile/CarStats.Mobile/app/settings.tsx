/**
 * מסך ההגדרות: מצב תצוגה, התראות סריקה, תזכורת בטיחות הילדים,
 * כתובת הבית, החשבון ופרטי הגרסה. כל מתג כאן מחובר לתכונה אמיתית.
 */

import React, { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
// רכיבי הספרייה יורשים את הצבעים מערכת הנושא שהוגדרה בפריסה הראשית,
// ולכן אין צורך להעביר להם צבעים במפורש.
import { Button, Divider, SegmentedButtons, Switch, TextInput } from 'react-native-paper';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import { geocodeAddress } from '@/services/api';
import { usePlaceSuggestions } from '@/hooks/usePlaceSuggestions';
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
  showChildReminderNotification,
} from '@/services/notifications';

const MODE_OPTIONS: { mode: ThemeMode; label: string }[] = [
  { mode: 'light',  label: 'Light' },
  { mode: 'dark',   label: 'Dark' },
  { mode: 'system', label: 'System' },
];

export default function SettingsScreen() {
  const { user } = useAuth();
  // אין צורך בצבעים מפורשים: כל פקד במסך הזה מקבל אותם מערכת הנושא.
  const { mode, setMode } = useTheme();
  const s = useStyles();

  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS);
  const [busy, setBusy]   = useState(false);
  const [homeAddress, setHomeAddress] = useState('');
  const { suggestions, visible, search, clear } = usePlaceSuggestions();

  const onHomeAddressChange = (text: string) => {
    setHomeAddress(text);
    search(text);
  };

  const pickSuggestion = (description: string) => {
    setHomeAddress(description);
    clear();
  };

  useEffect(() => { loadPrefs().then(setPrefs); }, []);

  const update = async (next: NotifPrefs) => {
    setPrefs(next);
    await savePrefs(next);
  };

  // ── מתג התראות הסריקה ────────────────────────────────────────────────────
  const toggleFaultAlerts = async (value: boolean) => {
    if (value && !(await ensureNotifPermission())) {
      Alert.alert('Permission needed', 'Allow notifications for CarStats to get scan alerts.');
      return;
    }
    await update({ ...prefs, faultAlerts: value });
  };

  // ── מתג תזכורת הילדים ────────────────────────────────────────────────────
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

  // מפעיל את התזכורת ישירות, בלי לחכות להגעה הביתה.
  // הגדר הגיאוגרפית דורשת הרשאת מיקום ברקע ש-Expo Go לא נותן, ולכן זו
  // הדרך היחידה להראות את ההתראה בהדגמה.
  const previewChildReminder = async () => {
    if (!(await ensureNotifPermission())) {
      Alert.alert('Permission needed', 'Allow notifications for CarStats to see the reminder.');
      return;
    }
    await showChildReminderNotification();
  };

  // ── שמירת כתובת הבית ─────────────────────────────────────────────────────
  /** שומר את מיקום הבית ומעגן מחדש גדר פעילה סביבו. */
  const saveHome = async (lat: number, lng: number, label: string) => {
    const next = { ...prefs, homeLat: lat, homeLng: lng, homeLabel: label };
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

  // הקלדת כתובת לא דורשת GPS כלל, וזה חשוב במכשיר שלא מצליח לאכן —
  // וגם מאפשרת להגדיר בית שלא נמצאים בו כרגע.
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
      clear();
    } catch (err: any) {
      console.warn('[settings] geocode failed', err);
      const status = err?.response?.status;
      Alert.alert(
        'Could not save location',
        status === 404
          ? 'The server does not have address lookup yet. It needs to be published.'
          : status === 503
            ? 'Address lookup is not configured on the server.'
            : 'Check your connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  const setHomeFromGps = async () => {
    setBusy(true);
    try {
      const { lat, lng } = await captureHomeLocation();

      // המרת הקואורדינטות לכתובת קריאה. נעשה במכשיר ולא דרך השרת, כי
      // הספרייה כבר יודעת לעשות זאת וזה חוסך פנייה שלמה בשביל תווית.
      let label = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      try {
        const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        if (place) {
          const parts = [
            [place.street, place.streetNumber].filter(Boolean).join(' '),
            place.city ?? place.subregion,
          ].filter(Boolean);
          if (parts.length) label = parts.join(', ');
        }
      } catch { /* אין המרה הפוכה זמינה — הקואורדינטות יספיקו */ }

      await saveHome(lat, lng, label);
    } catch (err: any) {
      Alert.alert('Could not get your location', err?.message ?? 'Type your address instead.');
    } finally {
      setBusy(false);
    }
  };

  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>

      {/* ── מצב תצוגה ── */}
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

      {/* ── התראות ── */}
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

        <Button
          mode="outlined"
          icon="bell-ring-outline"
          onPress={previewChildReminder}
          style={s.homeBtn}
          contentStyle={s.homeBtnContent}
        >
          Preview the reminder
        </Button>

        <Divider style={s.divider} />

        <Text style={s.rowTitle}>Home location</Text>
        <Text style={s.rowSub}>
          Used by the arrival reminder, and as a search point on the Mechanics tab.
        </Text>

        <View>
          <TextInput
            mode="outlined"
            dense
            label="Home address"
            placeholder="e.g. Agmon 13, Hadera"
            value={homeAddress}
            onChangeText={onHomeAddressChange}
            disabled={busy}
            style={s.homeInput}
            left={<TextInput.Icon icon="home-outline" />}
            onSubmitEditing={setHomeFromAddress}
            returnKeyType="done"
            autoCorrect={false}
          />

          {visible && suggestions.length > 0 && (
            <View style={s.dropdown}>
              {suggestions.map((sug, i) => (
                <Pressable
                  key={sug.placeId}
                  style={[s.dropdownItem, i < suggestions.length - 1 && s.dropdownDivider]}
                  onPress={() => pickSuggestion(sug.description)}
                >
                  <Text style={s.dropdownText} numberOfLines={1}>{sug.description}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

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
          <Text style={s.homeSetBadge} numberOfLines={2}>
            {/* נופל לקואורדינטות עבור בתים שנשמרו לפני שהתווית נוספה,
                כדי שגם התקנה ישנה תציג משהו. */}
            Home: {prefs.homeLabel ?? `${prefs.homeLat.toFixed(4)}, ${prefs.homeLng?.toFixed(4)}`}
          </Text>
        )}
      </View>

      {/* ── חשבון ── */}
      <Text style={s.sectionLabel}>ACCOUNT</Text>
      <View style={s.card}>
        <Text style={s.rowTitle}>{user?.fullName ?? '—'}</Text>
        <Text style={s.rowSub}>{user?.email ?? ''}</Text>
        <Text style={[s.rowSub, { marginTop: 6 }]}>
          Log out and other account actions live on the Profile tab.
        </Text>
      </View>

      {/* ── אודות ── */}
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

  // בורר מצב התצוגה
  segmentRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  switchRow: { flexDirection: 'row', alignItems: 'center' },
  // הקו עצמו מגיע מהספרייה; כאן רק המרווח סביבו
  divider:   { marginVertical: 14 },

  homeInput:      { marginTop: 12 },
  // רשימת ההצעות מרחפת מעל התוכן ולא דוחפת אותו, כדי שהכרטיס לא יקפוץ
  // בכל פעם שההצעות מופיעות.
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    zIndex: 20,
    backgroundColor: c.Dashboard.card,
    borderWidth: 1,
    borderColor: c.Dashboard.cardBorder,
    borderRadius: 10,
    overflow: 'hidden',
  },
  dropdownItem:    { paddingHorizontal: 14, paddingVertical: 12 },
  dropdownDivider: { borderBottomWidth: 1, borderBottomColor: c.Dashboard.cardBorder },
  dropdownText:    { fontSize: 14, color: c.Dashboard.textPrimary },
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
