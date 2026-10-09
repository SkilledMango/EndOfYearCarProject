/**
 * אשף חיבור המתאם לנקודת הגישה של הטלפון — כל התהליך מתוך האפליקציה.
 *
 * הבעיה שהוא פותר: כדי למסור למתאם את הסיסמה צריך לדבר איתו, אבל הוא עוד
 * לא ברשת של הטלפון. לכן:
 *  1. הנהג מקליד כאן את שם נקודת הגישה והסיסמה.
 *  2. אם המתאם כבר נגיש — הפרטים נשלחים אליו ישר. אחרת הטלפון מצטרף לרשת
 *     "CarStats-Setup" שהמתאם פותח, והאפליקציה שולחת את הפרטים בעצמה.
 *     לא צריך אינטרנט: זו הודעה ישירה בין הטלפון למתאם.
 *  3. הנהג מדליק את נקודת הגישה, והאפליקציה מחפשת את המתאם עליה.
 */

import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, ProgressBar, TextInput } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { createThemedStyles, useTheme } from '@/context/ThemeContext';
import {
  SETUP_NETWORK_ADDRESS,
  checkScannerAt,
  findScanner,
  getScannerAddress,
  sendHotspotToScanner,
} from '@/services/scanner';
import { hotspotError } from '@/utils/hotspot';

type Step = 'details' | 'join' | 'waiting' | 'done' | 'notFound';

/** כל כמה זמן בודקים אם הטלפון כבר ברשת של המתאם */
const JOIN_POLL_MS = 2500;
/** אחרי כמה זמן בלי הצלחה מציגים את הטיפ על נתונים סלולריים */
const MOBILE_DATA_TIP_MS = 20000;
/** כמה זמן מחכים שהמתאם יצטרף לנקודת הגישה: אתחול, ניסיון חיבור, ועוד סבב */
const WAIT_FOR_SCANNER_MS = 3 * 60 * 1000;
/** המתאם מאתחל 1.5 שניות אחרי שקיבל את הפרטים; מחכים שיסיים לפני שמחפשים */
const RESTART_GRACE_MS = 5000;

export default function ScannerSetupScreen() {
  const router = useRouter();
  const { colors: c } = useTheme();
  const s = useStyles();

  const [step, setStep]         = useState<Step>('details');
  const [ssid, setSsid]         = useState('');
  const [pass, setPass]         = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [showDataTip, setShowDataTip] = useState(false);
  const [searchProgress, setSearchProgress] = useState(0);

  // כל שלב מתחיל לולאה משלו; הדגל עוצר אותה כשעוברים שלב או יוצאים מהמסך
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  // ── שלב 1: שם וסיסמה ───────────────────────────────────────────────────────
  const onNext = async () => {
    const problem = hotspotError(ssid, pass);
    if (problem) { setError(problem); return; }
    setError(null);
    setChecking(true);
    try {
      // המתאם כבר נגיש — דרך נקודת הגישה הנוכחית שלו, או שהטלפון כבר
      // הצטרף לרשת ההגדרה — ואז אין צורך להחליף רשת בכלל
      const saved = await getScannerAddress();
      const [onHotspot, onSetup] = await Promise.all([
        checkScannerAt(saved),
        checkScannerAt(SETUP_NETWORK_ADDRESS),
      ]);
      const reachable = onSetup ? SETUP_NETWORK_ADDRESS : onHotspot ? saved : null;
      if (reachable) {
        await sendHotspotToScanner(reachable, ssid.trim(), pass);
        setStep('waiting');
      } else {
        setStep('join');
      }
    } catch (err: any) {
      setError(err?.message ?? 'Could not reach the scanner. Try again.');
    } finally {
      setChecking(false);
    }
  };

  // ── שלב 2: מחכים שהטלפון יצטרף ל-CarStats-Setup, ואז שולחים ──────────────
  useEffect(() => {
    if (step !== 'join') return;
    let stop = false;
    let sending = false;
    setShowDataTip(false);
    const tipTimer = setTimeout(() => setShowDataTip(true), MOBILE_DATA_TIP_MS);

    const tick = async () => {
      if (stop || sending || !alive.current) return;
      const status = await checkScannerAt(SETUP_NETWORK_ADDRESS);
      if (stop || !status) return;
      sending = true;
      try {
        await sendHotspotToScanner(SETUP_NETWORK_ADDRESS, ssid.trim(), pass);
        if (!stop) setStep('waiting');
      } catch (err: any) {
        if (!stop) setError(err?.message ?? 'Sending to the scanner failed. Trying again…');
      } finally {
        sending = false;
      }
    };

    tick();
    const poll = setInterval(tick, JOIN_POLL_MS);
    return () => { stop = true; clearInterval(poll); clearTimeout(tipTimer); };
  }, [step]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ── שלב 3: מחפשים את המתאם על נקודת הגישה ─────────────────────────────────
  useEffect(() => {
    if (step !== 'waiting') return;
    let stop = false;
    setError(null);

    const target = ssid.trim();
    (async () => {
      const deadline = Date.now() + WAIT_FOR_SCANNER_MS;
      // המתאם מאתחל את עצמו שנייה וחצי אחרי שקיבל את הפרטים. בלי ההמתנה
      // החיפוש היה תופס אותו עוד על נקודת הגישה הישנה ומכריז על הצלחה
      await new Promise(r => setTimeout(r, RESTART_GRACE_MS));
      while (!stop && alive.current && Date.now() < deadline) {
        const address = await findScanner((checked, total) => { if (!stop) setSearchProgress(checked / total); });
        if (stop) return;
        // מצליח רק כשהמתאם מדווח שהוא באמת על נקודת הגישה שנשלחה
        const status = address ? await checkScannerAt(address) : null;
        if (stop) return;
        if (address && status?.ssid === target) { setStep('done'); return; }
        await new Promise(r => setTimeout(r, 3000));
      }
      if (!stop) setStep('notFound');
    })();

    return () => { stop = true; };
  }, [step]);

  const openWifiSettings = () => {
    // לוח ה-WiFi הצף של אנדרואיד 10 ומעלה, ואם אין — מסך ההגדרות הרגיל
    Linking.sendIntent('android.settings.panel.action.WIFI')
      .catch(() => Linking.sendIntent('android.settings.WIFI_SETTINGS'))
      .catch(() => { /* אין מסך הגדרות — ההוראות בטקסט מספיקות */ });
  };

  const name = ssid.trim();

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      {step === 'details' && (
        <View style={s.card}>
          <Text style={s.title}>Which hotspot should the scanner join?</Text>
          <Text style={s.body}>
            Usually this phone&apos;s own hotspot. You&apos;ll find its name and password in your
            phone&apos;s settings, under Hotspot{Platform.OS === 'ios' ? ' (Personal Hotspot)' : ''}.
          </Text>

          <TextInput
            mode="outlined"
            label="Hotspot name"
            value={ssid}
            onChangeText={t => { setSsid(t); setError(null); }}
            autoCapitalize="none"
            autoCorrect={false}
            disabled={checking}
            style={s.input}
          />
          <TextInput
            mode="outlined"
            label="Hotspot password"
            value={pass}
            onChangeText={t => { setPass(t); setError(null); }}
            secureTextEntry={!showPass}
            autoCapitalize="none"
            autoCorrect={false}
            disabled={checking}
            style={s.input}
            right={<TextInput.Icon icon={showPass ? 'eye-off' : 'eye'} onPress={() => setShowPass(v => !v)} />}
          />

          {!!error && <Text style={s.error}>{error}</Text>}

          <Button mode="contained" onPress={onNext} loading={checking} disabled={checking} style={s.button} contentStyle={s.buttonContent}>
            {checking ? 'Checking for the scanner…' : 'Next'}
          </Button>
        </View>
      )}

      {step === 'join' && (
        <View style={s.card}>
          <Text style={s.title}>Connect to the scanner&apos;s WiFi</Text>
          <Text style={s.stepLine}><Text style={s.stepNum}>1.</Text> Make sure the scanner is plugged in. Within about a minute it opens a WiFi called <Text style={s.strong}>CarStats-Setup</Text>.</Text>
          <Text style={s.stepLine}><Text style={s.stepNum}>2.</Text> Join <Text style={s.strong}>CarStats-Setup</Text>. If your phone says it has no internet, choose <Text style={s.strong}>Stay connected</Text>. If a setup page pops up, you can close it.</Text>
          <Text style={s.stepLine}><Text style={s.stepNum}>3.</Text> Come back here — the app sends the hotspot details by itself.</Text>

          {Platform.OS === 'android' && (
            <Button mode="outlined" icon="wifi" onPress={openWifiSettings} style={s.button} contentStyle={s.buttonContent}>
              Open WiFi settings
            </Button>
          )}

          <View style={s.statusRow}>
            <ActivityIndicator color={c.Dashboard.accent} />
            <Text style={s.statusText}>Looking for the scanner&apos;s WiFi…</Text>
          </View>

          {!!error && <Text style={s.error}>{error}</Text>}

          {showDataTip && (
            <View style={s.tip}>
              <Text style={s.tipText}>
                Still looking? Check that you&apos;re on CarStats-Setup.
                {Platform.OS === 'android'
                  ? ' Some Android phones send everything over mobile data when the WiFi has no internet — turn mobile data off for a moment, and back on once this step is done.'
                  : ''}
              </Text>
            </View>
          )}

          <Button mode="text" onPress={() => setStep('details')} style={s.button}>
            Back
          </Button>
        </View>
      )}

      {step === 'waiting' && (
        <View style={s.card}>
          <Text style={s.title}>Sent ✓  Make sure your hotspot is on</Text>
          <Text style={s.body}>
            Check that the hotspot <Text style={s.strong}>{name}</Text> is on. The scanner restarts and
            joins it by itself — this takes up to a minute. Keep this screen open.
          </Text>
          <View style={s.statusRow}>
            <ActivityIndicator color={c.Dashboard.accent} />
            <Text style={s.statusText}>Waiting for the scanner to join {name}…</Text>
          </View>
          <ProgressBar progress={searchProgress} style={s.bar} />
        </View>
      )}

      {step === 'done' && (
        <View style={s.card}>
          <Text style={[s.title, s.ok]}>Connected ✓</Text>
          <Text style={s.body}>
            The scanner is on <Text style={s.strong}>{name}</Text>. Next time you turn this hotspot
            on, the scanner joins it and the app finds it automatically.
          </Text>
          <Button mode="contained" onPress={() => router.back()} style={s.button} contentStyle={s.buttonContent}>
            Done
          </Button>
        </View>
      )}

      {step === 'notFound' && (
        <View style={s.card}>
          <Text style={s.title}>The scanner hasn&apos;t shown up yet</Text>
          <Text style={s.body}>
            Check that the hotspot <Text style={s.strong}>{name}</Text> is on and the password was
            right. If the password was wrong, the scanner opens CarStats-Setup again within about a
            minute — start over and retype it.{'\n\n'}
            If you sent it to another phone&apos;s hotspot, open CarStats on that phone and tap
            Find scanner in Settings.
          </Text>
          <Button mode="contained" onPress={() => setStep('waiting')} style={s.button} contentStyle={s.buttonContent}>
            Search again
          </Button>
          <Button mode="outlined" onPress={() => setStep('details')} style={s.button} contentStyle={s.buttonContent}>
            Start over
          </Button>
        </View>
      )}
    </ScrollView>
  );
}

const useStyles = createThemedStyles((c) => StyleSheet.create({
  screen:  { flex: 1, backgroundColor: c.Dashboard.bg },
  content: { padding: 20, paddingBottom: 48 },

  card: {
    backgroundColor: c.Dashboard.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.Dashboard.cardBorder,
    padding: 18,
  },

  title:    { fontSize: 18, fontWeight: '700', color: c.Dashboard.textPrimary, marginBottom: 8 },
  ok:       { color: c.Severity.green },
  body:     { fontSize: 14, color: c.Dashboard.textSecondary, lineHeight: 20 },
  strong:   { fontWeight: '700', color: c.Dashboard.textPrimary },
  stepLine: { fontSize: 14, color: c.Dashboard.textSecondary, lineHeight: 20, marginTop: 8 },
  stepNum:  { fontWeight: '800', color: c.Dashboard.accent },

  input:         { marginTop: 12 },
  button:        { marginTop: 12 },
  buttonContent: { paddingVertical: 4 },
  error:         { marginTop: 10, fontSize: 13, color: c.Severity.red },

  statusRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  statusText: { fontSize: 13, color: c.Dashboard.textSecondary, flex: 1 },
  bar:        { marginTop: 12, borderRadius: 2 },

  tip:     { marginTop: 14, padding: 12, borderRadius: 10, backgroundColor: c.SeveritySoft.yellow },
  tipText: { fontSize: 13, color: c.Dashboard.textPrimary, lineHeight: 18 },
}));
