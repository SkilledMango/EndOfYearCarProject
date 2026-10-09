/**
 * מסך ההגדרות: מצב תצוגה, התראות סריקה, תזכורת בטיחות הילדים,
 * כתובות הבית והעבודה, מתאם ה-OBD, החשבון ופרטי הגרסה. כל מתג כאן מחובר לתכונה אמיתית.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
// רכיבי הספרייה יורשים את הצבעים מערכת הנושא שהוגדרה בפריסה הראשית,
// ולכן אין צורך להעביר להם צבעים במפורש.
import { Button, Divider, ProgressBar, SegmentedButtons, Switch } from 'react-native-paper';
import Constants from 'expo-constants';
import { useAuth } from '@/context/AuthContext';
import { createThemedStyles, useTheme, ThemeMode } from '@/context/ThemeContext';
import PlaceEditor from '@/components/settings/PlaceEditor';
import {
  NotifPrefs,
  DEFAULT_PREFS,
  disableChildReminder,
  enableChildReminder,
  ensureNotifPermission,
  loadPrefs,
  savePrefs,
  showChildReminderNotification,
} from '@/services/notifications';
import { ReminderPlace, REMINDER_RADIUS_METERS, reminderRegions } from '@/utils/reminderRegions';
import {
  findScanner,
  isScannerReachable,
} from '@/services/scanner';

const MODE_OPTIONS: { mode: ThemeMode; label: string }[] = [
  { mode: 'light',  label: 'Light' },
  { mode: 'dark',   label: 'Dark' },
  { mode: 'system', label: 'System' },
];

export default function SettingsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  // אין צורך בצבעים מפורשים: כל פקד במסך הזה מקבל אותם מערכת הנושא.
  const { mode, setMode } = useTheme();
  const s = useStyles();

  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS);
  const [busy, setBusy]   = useState(false);

  useEffect(() => { loadPrefs().then(setPrefs); }, []);

  // ── מתאם ה-OBD ───────────────────────────────────────────────────────────
  const [scannerOnline, setScannerOnline]   = useState<boolean | null>(null);   // null = בודק
  const [finding, setFinding]               = useState(false);
  const [findProgress, setFindProgress]     = useState(0);

  // הכתובת לא מוצגת: האפליקציה מוצאת את המתאם לבד (ראו isScannerReachable)
  const refreshScanner = async () => {
    setScannerOnline(null);
    setScannerOnline(await isScannerReachable());
  };

  // גם בחזרה מאשף החיבור, שבו הכתובת והמצב משתנים
  useFocusEffect(useCallback(() => { refreshScanner(); }, []));

  const onFindScanner = async () => {
    setFinding(true);
    setFindProgress(0);
    try {
      const found = await findScanner((checked, total) => setFindProgress(checked / total));
      setScannerOnline(!!found);
      if (!found) {
        Alert.alert(
          'Scanner not found',
          'Check that the scanner is powered and your hotspot is on. ' +
          'If it is new to this phone, connect it with the button below.',
        );
      }
    } finally {
      setFinding(false);
    }
  };



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
    const regions = reminderRegions(prefs);
    if (regions.length === 0) {
      Alert.alert(
        'Set a location first',
        'The reminder fires when you arrive home or at work. Set at least one address below, then enable the reminder.',
      );
      return;
    }
    setBusy(true);
    try {
      await enableChildReminder(regions);
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

  // ── הבית והעבודה ─────────────────────────────────────────────────────────
  /**
   * שומר או מוחק מקום (lat = null מוחק), ומעדכן גדר פעילה כך שתעקוב בדיוק
   * אחרי המקומות שנשארו. אם לא נשאר אף מקום — התזכורת נכבית.
   */
  const setPlace = async (place: ReminderPlace, lat: number | null, lng: number | null, label: string | null) => {
    const next: NotifPrefs = place === 'home'
      ? { ...prefs, homeLat: lat, homeLng: lng, homeLabel: label }
      : { ...prefs, workLat: lat, workLng: lng, workLabel: label };

    if (prefs.childReminder) {
      const regions = reminderRegions(next);
      await disableChildReminder();
      if (regions.length > 0) {
        try {
          await enableChildReminder(regions);
        } catch (err: any) {
          next.childReminder = false;
          Alert.alert('Reminder turned off', err?.message ?? 'Could not restart the arrival reminder.');
        }
      } else {
        next.childReminder = false;
      }
    }
    await update(next);
  };

  const savePlace = async (place: ReminderPlace, lat: number, lng: number, label: string) => {
    await setPlace(place, lat, lng, label);
    Alert.alert(
      place === 'home' ? 'Home location saved' : 'Work location saved',
      `${label}\n\nThe arrival reminder will trigger within ~${REMINDER_RADIUS_METERS} m of this spot.`,
    );
  };

  const removePlace = (place: ReminderPlace) => setPlace(place, null, null, null);

  // מקומות שנשמרו לפני שהתווית נוספה מוצגים לפי הקואורדינטות
  const placeLabel = (lat: number | null, lng: number | null, label: string | null) =>
    lat == null ? null : label ?? `${lat.toFixed(4)}, ${lng?.toFixed(4)}`;

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
              When you arrive home or at work, remind me to check the back seat.
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

        <PlaceEditor
          title="Home location"
          subtitle="Used by the arrival reminder, and as a search point on the Mechanics tab."
          name="Home"
          placeholder="e.g. Agmon 13, Hadera"
          icon="home-outline"
          savedLabel={placeLabel(prefs.homeLat, prefs.homeLng, prefs.homeLabel)}
          disabled={busy}
          onSave={(lat, lng, label) => savePlace('home', lat, lng, label)}
          onRemove={() => removePlace('home')}
        />

        <Divider style={s.divider} />

        <PlaceEditor
          title="Work location"
          subtitle="The reminder also fires when you arrive at work."
          name="Work"
          placeholder="e.g. Azrieli Center, Tel Aviv"
          icon="briefcase-outline"
          savedLabel={placeLabel(prefs.workLat, prefs.workLng, prefs.workLabel)}
          disabled={busy}
          onSave={(lat, lng, label) => savePlace('work', lat, lng, label)}
          onRemove={() => removePlace('work')}
        />
      </View>

      {/* ── מתאם ה-OBD ── */}
      <Text style={s.sectionLabel}>OBD SCANNER</Text>
      <View style={s.card}>
        <Text style={s.rowTitle}>Scanner</Text>
        <Text style={[s.rowSub, scannerOnline ? s.statusOk : s.statusOff]}>
          {scannerOnline == null ? 'Looking for the scanner…' : scannerOnline ? 'Connected' : 'Not connected'}
        </Text>

        <Button
          mode="contained"
          icon="radar"
          onPress={onFindScanner}
          disabled={finding}
          style={s.homeBtn}
          contentStyle={s.homeBtnContent}
        >
          {finding ? `Searching… ${Math.round(findProgress * 100)}%` : 'Find scanner'}
        </Button>
        {finding && <ProgressBar progress={findProgress} style={s.findBar} />}


        <Divider style={s.divider} />

        <Text style={s.rowTitle}>New phone or hotspot?</Text>
        <Text style={s.rowSub}>
          Type your hotspot&apos;s name and password, and the app hands them to the scanner.
        </Text>
        <Button
          mode="outlined"
          icon="wifi-cog"
          onPress={() => router.push('/scanner-setup')}
          disabled={finding}
          style={s.homeBtn}
          contentStyle={s.homeBtnContent}
        >
          Connect scanner to a hotspot
        </Button>
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

  homeBtn:        { marginTop: 10 },
  homeBtnContent: { paddingVertical: 4 },

  aboutRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  // מצב המתאם
  statusOk:  { color: c.Severity.green, fontWeight: '700' },
  statusOff: { color: c.Dashboard.textSecondary, fontWeight: '700' },
  findBar:   { marginTop: 8, borderRadius: 2 },
}));
