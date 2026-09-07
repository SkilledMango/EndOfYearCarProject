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
import { useFocusEffect } from 'expo-router';
import Svg, { Circle, Defs, LinearGradient, Polyline, Stop } from 'react-native-svg';
import { FuelPrice, Vehicle, getFuelPrice, getUser, updateVehicle } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { createThemedStyles, useTheme } from '@/context/ThemeContext';
import { IconSymbol } from '@/components/ui/icon-symbol';
import {
  FALLBACK_FUEL_PRICES,
  FUEL_TYPES,
  FUEL_TYPE_LABELS,
  FuelType,
  costPer100km,
  costToFillTank,
  fillUpCost,
  fuelSpend,
} from '@/utils/fuel';
import {
  TankLevel,
  loadFuelType,
  loadTankLevel,
  loadTankSize,
  saveFuelType,
  saveTankSize,
} from '@/services/tankState';

// ─── יומן התדלוקים, נשמר במכשיר לכל רכב בנפרד ────────────────────────────────

interface FillUp {
  id: number;       // חותמת הזמן ביצירה
  date: string;     // התאריך
  liters: number;
  price: number;    // הסכום ששולם בפועל, בשקלים
  l100km: number | null; // מחושב רק כשהמשתמש מזין גם ק"מ שנסעו
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
  } catch { /* האחסון מלא או לא זמין — הרשומות נשארות בזיכרון לסשן הזה */ }
}

/** הצריכה הממוצעת מתוך התדלוקים שנרשמו. רשומה בלי ק"מ מדולגת. */
const averageL100km = (entries: FillUp[]): number | null => {
  const vals = entries.map(e => e.l100km).filter((v): v is number => v != null);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
};

/**
 * אחוז השינוי בצריכה, כשמספר שלילי הוא שיפור, יחד עם בסיס ההשוואה.
 *
 * הבסיס נשמר עם המספר כי השניים אינם זהים: השוואה בין שני תדלוקים
 * שסומנה "מול החודש שעבר" סתרה את כרטיס העלויות, שאמר נכונה שאין
 * עדיין חודש קודם.
 */
interface Trend {
  pct: number;
  basis: 'month' | 'fillup';
}

const trendPct = (entries: FillUp[]): Trend | null => {
  const withVal = entries.filter(e => e.l100km != null);
  if (withVal.length < 2) return null;

  const monthOf = (e: FillUp) => e.date.slice(0, 7); // מפתח חודשי
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
    return { pct: ((cur - prev) / prev) * 100, basis: 'month' };
  }
  const sorted = [...withVal].sort((a, b) => a.date.localeCompare(b.date));
  const cur  = sorted[sorted.length - 1].l100km!;
  const prev = sorted[sorted.length - 2].l100km!;
  return { pct: ((cur - prev) / prev) * 100, basis: 'fillup' };
};

const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// ─── גרף המגמה ───────────────────────────────────────────────────────────────

function TrendChart({ values }: { values: number[] }) {
  const { colors: c } = useTheme();
  const styles = useStyles();
  // גבולות הציר האנכי: חלון סימטרי סביב הנתונים, לפחות ±1, ומתרחב
  // כשהקריאות מפוזרות יותר.
  const min  = Math.min(...values);
  const max  = Math.max(...values);
  const span = Math.max(2, max - min + 0.8);
  const mid  = (min + max) / 2;
  const hi   = mid + span / 2;
  const lo   = mid - span / 2;

  // לשורות הרשת יש ריפוד אנכי בתוך הגרף, ולכן הנקודות ממופות לתוך
  // הרצועה המרופדת ולא לגובה המלא.
  const y = (v: number) => 5 + ((hi - v) / (hi - lo)) * 90;
  const x = (i: number) => (values.length > 1 ? (i * 100) / (values.length - 1) : 50);
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');

  return (
    <View style={styles.chartArea}>
      {/* תוויות הציר האנכי */}
      <View style={styles.chartYAxis}>
        <Text style={styles.chartYLabel}>{hi.toFixed(1)}</Text>
        <Text style={styles.chartYLabel}>{mid.toFixed(1)}</Text>
        <Text style={styles.chartYLabel}>{lo.toFixed(1)}</Text>
      </View>
      <View style={styles.chartPlot}>
        {/* קווי הרשת */}
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
              <Stop offset="0%" stopColor={c.Dashboard.accentDeep} />
              <Stop offset="100%" stopColor={c.Dashboard.accent} />
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
              fill={c.Dashboard.card}
              stroke={c.Dashboard.accentDeep}
              strokeWidth={2}
            />
          ))}
        </Svg>
      </View>
    </View>
  );
}

// ─── המסך ────────────────────────────────────────────────────────────────────

export default function FuelScreen() {
  const { user: authUser } = useAuth();
  const { colors: c } = useTheme();
  const styles = useStyles();
  const [vehicles, setVehicles]       = useState<Vehicle[]>([]);
  const [vehicleIdx, setVehicleIdx]   = useState(0);
  const [fillUps, setFillUps]         = useState<FillUp[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);

  // מצב חלון הוספת התדלוק
  const [modalVisible, setModalVisible] = useState(false);
  const [liters, setLiters]   = useState('');
  const [price, setPrice]     = useState('');
  const [km, setKm]           = useState('');
  const [saving, setSaving]   = useState(false);
  const [fuelType, setFuelType] = useState<FuelType>('95');
  // ברגע שהנהג הקליד מחיר, הוא שלו: הקבלה גוברת על החשבון שלנו,
  // ודריסה שקטה שלו בהקלדה הבאה בשדה הליטרים הייתה מטריפה.
  const [priceEdited, setPriceEdited] = useState(false);
  const [fuelPrice, setFuelPrice] = useState<FuelPrice | null>(null);
  const [tankLevel, setTankLevel] = useState<TankLevel | null>(null);
  const [tankL, setTankL]         = useState<number | null>(null);
  const [tankModalVisible, setTankModalVisible] = useState(false);
  const [tankInput, setTankInput] = useState('');

  const vehicle = vehicles[vehicleIdx] ?? null;

  const priceEntry = fuelPrice?.prices?.find(p => p.fuelType === fuelType) ?? null;
  const pricePerLitre = priceEntry?.pricePerLitreILS ?? FALLBACK_FUEL_PRICES[fuelType];
  // רק 95 מפוקח; כל השאר הוא מחיר אופייני, והממשק חייב לומר זאת
  // ולא להציג הערכה באותה ודאות כמו עובדה.
  const priceIsOfficial = priceEntry?.isOfficial ?? fuelType === '95';

  const load = useCallback(async (isRefresh = false) => {
    if (!authUser) return;
    if (isRefresh) setRefreshing(true);
    try {
      const user = await getUser(authUser.id);
      setVehicles(user.vehicles ?? []);
    } catch { /* השרת לא זמין — נשארים עם מה שיש */ }
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

  useEffect(() => {
    if (vehicle) loadFuelType(vehicle.id).then(setFuelType);
  }, [vehicle?.id]);

  // קריאה מחדש בכל כניסה למסך ולא רק בטעינה: מסך הבית כותב את המפלס
  // בזמן שהוא דוגם את המתאם, ולכן מעבר משם צריך להציג את הקריאה
  // האחרונה ולא כזו מהביקור הקודם.
  useFocusEffect(
    useCallback(() => {
      loadTankLevel(vehicle?.id).then(setTankLevel);
      loadTankSize(vehicle?.id).then(setTankL);
    }, [vehicle?.id]),
  );

  const onSaveTankSize = async () => {
    const litres = parseFloat(tankInput);
    if (!Number.isFinite(litres) || litres < 10 || litres > 200) {
      Alert.alert('Check the tank size', 'Enter your tank capacity in litres — most cars are between 35 and 80.');
      return;
    }
    await saveTankSize(litres, vehicle?.id);
    setTankL(litres);
    setTankModalVisible(false);
  };

  useEffect(() => {
    getFuelPrice().then(setFuelPrice);
  }, []);

  // המחיר מתמלא מעצמו לפי ליטרים כפול מחיר המשאבה, כך שהמקרה הנפוץ
  // דורש הקלדה של מספר אחד. זהו מילוי מראש ולא שדה מחושב: הנהג יכול
  // לדרוס אותו, ומה שנשמר הוא מה ששילם בפועל.
  useEffect(() => {
    if (!modalVisible || priceEdited) return;
    const cost = fillUpCost(parseFloat(liters), pricePerLitre);
    setPrice(cost == null ? '' : cost.toFixed(2));
  }, [liters, pricePerLitre, modalVisible, priceEdited]);

  const onPickFuelType = (next: FuelType) => {
    setFuelType(next);
    if (vehicle) saveFuelType(next, vehicle.id);
  };

  // כל יציאה מהחלון מנקה את הטופס, כדי שהתדלוק הבא יתחיל ריק וסימון
  // "המחיר נערך" לא ידלוף לרשומה הבאה ויבטל שם את המילוי האוטומטי.
  // סוג הדלק כן נשמר, כי הוא שייך לרכב.
  const closeModal = () => {
    setModalVisible(false);
    setLiters(''); setPrice(''); setKm('');
    setPriceEdited(false);
  };

  // ממוין מהחדש לישן עבור ההיסטוריה, ולפי סדר כרונולוגי עבור הגרף
  const history = useMemo(
    () => [...fillUps].sort((a, b) => b.date.localeCompare(a.date)),
    [fillUps],
  );
  const chartValues = useMemo(() => {
    const chrono = [...fillUps].sort((a, b) => a.date.localeCompare(b.date));
    return chrono.map(e => e.l100km).filter((v): v is number => v != null).slice(-5);
  }, [fillUps]);

  const loggedAvg  = averageL100km(fillUps);
  // עד שיירשם תדלוק עם מרחק, מוצג הערך משרשרת האיתור האוטומטית.
  const displayAvg = loggedAvg ?? (vehicle && vehicle.averageFuelConsumption > 0
    ? vehicle.averageFuelConsumption
    : null);
  const trend = trendPct(fillUps);

  // נגזר מהשקלים שכבר נרשמו בכל תדלוק, ולכן לא דורש מהנהג שום נתון נוסף.
  const spend      = useMemo(() => fuelSpend(fillUps), [fillUps]);
  const costPer100 = useMemo(() => costPer100km(fillUps), [fillUps]);

  const fillCost = costToFillTank(tankL, tankLevel?.pct ?? null, pricePerLitre);

  const persist = async (entries: FillUp[]) => {
    if (!vehicle) return;
    setFillUps(entries);
    await saveFillUps(vehicle.id, entries);
    // מסנכרן את הממוצע השמור בשרת עם היומן, כדי שכל שאר האפליקציה
    // תראה את אותו מספר.
    const avg = averageL100km(entries);
    if (avg != null) {
      try {
        await updateVehicle(vehicle.id, {
          ...vehicle,
          averageFuelConsumption: Math.round(avg * 10) / 10,
        });
      } catch { /* אין חיבור — היומן המקומי בכל זאת נשמר */ }
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
    closeModal();
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
        <ActivityIndicator size="large" color={c.Dashboard.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={c.Dashboard.accent} />
        }
      >
        {/* ── כותרת ובורר רכב ── */}
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
              <IconSymbol name="car.fill" size={24} color={c.Dashboard.accentDeep} />
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
            {/* ── הכרטיס הראשי: הצריכה הממוצעת ── */}
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
                    name={trend.pct <= 0 ? 'arrow.down' : 'arrow.up'}
                    size={16}
                    color={trend.pct <= 0 ? c.Fuel.trendGreen : c.Severity.red}
                  />
                  <Text style={[styles.trendText, { color: trend.pct <= 0 ? c.Fuel.trendGreen : c.Severity.red }]}>
                    {Math.abs(trend.pct).toFixed(0)}%{' '}
                    {trend.basis === 'month' ? 'from last month' : 'vs your last fill-up'}
                  </Text>
                </View>
              ) : (
                <Text style={styles.trendHint}>
                  {loggedAvg == null ? 'Estimated for your model — log fill-ups to track your real usage'
                                     : 'Log more fill-ups to see your trend'}
                </Text>
              )}
            </View>

            {/* ── עלויות שוטפות ──
                הצריכה אומרת כמה הרכב "שותה"; זה אומר כמה זה עולה, וזו
                השאלה שלנהג באמת יש. הכול מחושב מהתדלוקים שכבר נרשמו. */}
            <View style={styles.costCard}>
              <Text style={styles.costTitle}>Running Costs</Text>
              <View style={styles.costRow}>
                <View style={styles.costCell}>
                  <Text style={styles.costValue}>
                    {costPer100 != null ? `₪${costPer100.toFixed(0)}` : '—'}
                  </Text>
                  <Text style={styles.costLabel}>per 100km</Text>
                </View>
                <View style={styles.costCellDivider} />
                <View style={styles.costCell}>
                  <Text style={styles.costValue}>₪{spend.thisMonth.toFixed(0)}</Text>
                  <Text style={styles.costLabel}>this month</Text>
                </View>
                <View style={styles.costCellDivider} />
                <View style={styles.costCell}>
                  <Text style={styles.costValue}>₪{spend.thisYear.toFixed(0)}</Text>
                  <Text style={styles.costLabel}>this year</Text>
                </View>
              </View>
              {/* דורש גם גודל מיכל וגם מפלס ידוע. במקום להיעלם בשקט כשהגודל
                  חסר, מציעים להגדיר אותו: זה הנתון היחיד שאף ממשק
                  לא יכול לספק. */}
              <View style={styles.fillRow}>
                {fillCost ? (
                  <>
                    <Text style={styles.fillText}>
                      About <Text style={styles.fillAmount}>₪{fillCost.cost.toFixed(0)}</Text> to fill up
                    </Text>
                    <Text style={styles.fillSub}>
                      ~{fillCost.litres.toFixed(0)}L at ₪{pricePerLitre.toFixed(2)}/L
                      {tankLevel && !tankLevel.isReal ? ' · from an estimated level' : ''}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.fillSub}>
                    {tankL == null
                      ? 'Set your tank size to see what a full tank costs.'
                      : 'Connect to your car to see what a full tank costs.'}
                  </Text>
                )}
                <Pressable
                  onPress={() => { setTankInput(tankL ? String(tankL) : ''); setTankModalVisible(true); }}
                >
                  <Text style={styles.tankLink}>
                    {tankL ? `Tank size: ${tankL}L — change` : 'Set tank size'}
                  </Text>
                </Pressable>
              </View>

              {spend.monthChangePct != null ? (
                <View style={styles.trendRow}>
                  <IconSymbol
                    name={spend.monthChangePct <= 0 ? 'arrow.down' : 'arrow.up'}
                    size={16}
                    color={spend.monthChangePct <= 0 ? c.Fuel.trendGreen : c.Severity.red}
                  />
                  <Text
                    style={[
                      styles.trendText,
                      { color: spend.monthChangePct <= 0 ? c.Fuel.trendGreen : c.Severity.red },
                    ]}
                  >
                    {Math.abs(spend.monthChangePct).toFixed(0)}% vs last month
                  </Text>
                </View>
              ) : (
                <Text style={styles.trendHint}>
                  {costPer100 == null
                    ? 'Log a fill-up with km driven to see your cost per 100km'
                    : 'Your first month of tracking — a comparison appears next month'}
                </Text>
              )}
            </View>

            {/* ── גרף המגמה ── */}
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

            {/* ── ההיסטוריה ── */}
            <Text style={styles.historyTitle}>History</Text>
            {history.length === 0 ? (
              <Text style={styles.historyEmpty}>No fill-ups logged yet. Tap + to add your first.</Text>
            ) : (
              <View style={styles.historyList}>
                {history.map(entry => (
                  <Pressable key={entry.id} style={styles.entryCard} onLongPress={() => handleDelete(entry)}>
                    <View style={styles.entryLeft}>
                      <View style={styles.entryIconChip}>
                        <IconSymbol name="fuelpump.fill" size={20} color={c.Dashboard.accentDeep} />
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

      {/* ── כפתור הוספת תדלוק ── */}
      {vehicle && (
        <Pressable style={styles.fab} onPress={() => setModalVisible(true)}>
          <IconSymbol name="plus" size={28} color={c.Dashboard.onAccent} />
        </Pressable>
      )}

      {/* ── חלון גודל המיכל ──
          יושב כאן ולא מאחורי מחוון הדלק במסך הבית: האריח שם לחיץ רק
          כשהרכב לא מדווח מפלס, ולכן נהג שהרכב שלו כן מדווח לא היה יכול
          להזין קיבולת בכלל. */}
      <Modal
        visible={tankModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTankModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setTankModalVisible(false)} />
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Tank Size</Text>
            <Text style={styles.modalLabel}>Capacity in litres</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. 55"
              placeholderTextColor={c.Dashboard.textSecondary}
              keyboardType="decimal-pad"
              value={tankInput}
              onChangeText={setTankInput}
              autoFocus
            />
            <Text style={styles.modalHint}>
              You&apos;ll find this in your owner&apos;s manual — most cars are
              between 35 and 80 litres.
            </Text>
            <Pressable style={styles.modalSaveBtn} onPress={onSaveTankSize}>
              <Text style={styles.modalSaveText}>Save</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── חלון הוספת תדלוק ── */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={closeModal}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={closeModal} />
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Log Fill-up</Text>

            <Text style={styles.modalLabel}>Fuel type</Text>
            <View style={styles.fuelTypeRow}>
              {FUEL_TYPES.map(type => {
                const selected = type === fuelType;
                return (
                  <Pressable
                    key={type}
                    style={[styles.fuelTypeChip, selected && styles.fuelTypeChipOn]}
                    onPress={() => onPickFuelType(type)}
                  >
                    <Text style={[styles.fuelTypeText, selected && styles.fuelTypeTextOn]}>
                      {FUEL_TYPE_LABELS[type]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.modalLabel}>Litres filled</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. 45"
              placeholderTextColor={c.Dashboard.textSecondary}
              keyboardType="decimal-pad"
              value={liters}
              onChangeText={setLiters}
              autoFocus
            />
            <Text style={styles.modalLabel}>Total paid (₪)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. 320"
              placeholderTextColor={c.Dashboard.textSecondary}
              keyboardType="decimal-pad"
              value={price}
              onChangeText={text => { setPriceEdited(true); setPrice(text); }}
            />
            <Text style={styles.modalHint}>
              {priceIsOfficial
                ? `Filled in at ₪${pricePerLitre.toFixed(2)}/L — the regulated price for 95. Change it if you paid something else.`
                : `Filled in at ₪${pricePerLitre.toFixed(2)}/L, a typical price — ${FUEL_TYPE_LABELS[fuelType]} isn't regulated, so check your receipt.`}
            </Text>
            <Text style={styles.modalLabel}>Km driven since last fill-up (optional)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. 650 — used to compute L/100km"
              placeholderTextColor={c.Dashboard.textSecondary}
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
                ? <ActivityIndicator color={c.Dashboard.onAccent} size="small" />
                : <Text style={styles.modalSaveText}>Save Fill-up</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── סגנונות, לפי קובץ העיצוב של מסך הדלק ───────────────────────────────────

const useStyles = createThemedStyles((c) => StyleSheet.create({
  container:      { flex: 1, backgroundColor: c.Dashboard.bg },
  centered:       { justifyContent: 'center', alignItems: 'center' },
  content:        { paddingHorizontal: 20, paddingTop: 64, paddingBottom: 120 },

  header:         { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  screenTitle:    { fontSize: 20, lineHeight: 28, fontWeight: '700', color: c.Dashboard.accentDeep },
  screenSubtitle: { fontSize: 13, color: c.Dashboard.textSecondary, marginTop: 2 },
  switcherBtn:    {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },

  // הכרטיס הראשי
  heroCard:       {
    backgroundColor: c.Dashboard.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.Dashboard.cardBorder,
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
    backgroundColor: c.Fuel.mintBar,
  },
  heroLabel:      { fontSize: 16, lineHeight: 24, color: c.Dashboard.textSecondary, marginBottom: 4 },
  heroValueRow:   { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 4 },
  heroValue:      { fontSize: 28, lineHeight: 34, fontWeight: '700', color: c.Dashboard.textPrimary },
  heroUnit:       { fontSize: 16, color: c.Dashboard.textSecondary },
  trendRow:       { flexDirection: 'row', alignItems: 'center', gap: 4 },
  trendText:      { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  trendHint:      { fontSize: 13, color: c.Dashboard.textSecondary },

  // כרטיס הגרף
  costCard:       {
    backgroundColor: c.Dashboard.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.Dashboard.cardBorder,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  costTitle:      { fontSize: 16, fontWeight: '700', color: c.Dashboard.textPrimary, marginBottom: 14 },
  costRow:        { flexDirection: 'row', alignItems: 'center' },
  // כל תא תופס שליש, כדי ששלושת המספרים יישארו מיושרים גם כשהם גדלים.
  costCell:       { flex: 1, alignItems: 'center' },
  costCellDivider:{ width: 1, alignSelf: 'stretch', backgroundColor: c.Dashboard.cardBorder },
  costValue:      { fontSize: 22, fontWeight: '800', color: c.Dashboard.textPrimary },
  costLabel:      { fontSize: 12, color: c.Dashboard.textSecondary, marginTop: 4 },
  fillRow:        {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: c.Dashboard.cardBorder,
  },
  fillText:       { fontSize: 14, color: c.Dashboard.textSecondary },
  fillAmount:     { fontWeight: '800', color: c.Dashboard.accent },
  fillSub:        { fontSize: 12, color: c.Dashboard.textSecondary, marginTop: 2 },
  tankLink:       { fontSize: 12, fontWeight: '600', color: c.Dashboard.accent, marginTop: 8 },
  chartCard:      {
    backgroundColor: c.Dashboard.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.Dashboard.cardBorder,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  chartHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  chartTitle:     { fontSize: 16, fontWeight: '600', color: c.Dashboard.textPrimary },
  chartCaption:   { fontSize: 12, fontWeight: '600', letterSpacing: 0.6, color: c.Dashboard.textSecondary },
  chartArea:      { height: 160, flexDirection: 'row' },
  chartYAxis:     { width: 32, justifyContent: 'space-between', paddingVertical: 8 },
  chartYLabel:    { fontSize: 12, fontWeight: '600', color: c.Fuel.axisLabel },
  chartPlot:      { flex: 1 },
  chartGrid:      { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between', paddingVertical: 8 },
  chartGridLine:  { height: 1, backgroundColor: c.Fuel.gridLine },
  chartEmpty:     { height: 160, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  chartEmptyText: { fontSize: 13, color: c.Dashboard.textSecondary, textAlign: 'center', lineHeight: 18 },

  // ההיסטוריה
  historyTitle:   { fontSize: 16, fontWeight: '600', color: c.Dashboard.textPrimary, marginBottom: 16, paddingHorizontal: 4 },
  historyEmpty:   { fontSize: 13, color: c.Dashboard.textSecondary, paddingHorizontal: 4 },
  historyList:    { gap: 8 },
  entryCard:      {
    backgroundColor: c.Dashboard.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.Dashboard.cardBorder,
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
    backgroundColor: c.Fuel.chipBg,
    alignItems: 'center', justifyContent: 'center',
  },
  entryDate:      { fontSize: 16, lineHeight: 24, fontWeight: '500', color: c.Dashboard.textPrimary },
  entryLiters:    { fontSize: 14, lineHeight: 20, color: c.Dashboard.textSecondary },
  entryPrice:     { fontSize: 16, fontWeight: '600', color: c.Dashboard.textPrimary },

  // כפתור ההוספה
  fab:            {
    position: 'absolute', right: 20, bottom: 24,
    width: 56, height: 56, borderRadius: 12,
    backgroundColor: c.Dashboard.accentDeep,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: c.Dashboard.accentDeep,
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },

  // חלון הוספת התדלוק
  modalBackdrop:  { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(25,27,35,0.4)' },
  modalSheet:     {
    backgroundColor: c.Dashboard.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle:     { fontSize: 20, fontWeight: '700', color: c.Dashboard.textPrimary, marginBottom: 16 },
  modalLabel:     { fontSize: 13, fontWeight: '600', color: c.Dashboard.textSecondary, marginBottom: 6 },
  modalInput:     {
    backgroundColor: c.Dashboard.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.Dashboard.cardBorder,
    color: c.Dashboard.textPrimary,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  // מוצמד לשדה שהוא מסביר; אחרת המרווח התחתון של השדה היה משאיר
  // את ההערה תלויה באוויר בין השניים.
  modalHint:      {
    fontSize: 12,
    lineHeight: 17,
    color: c.Dashboard.textSecondary,
    marginTop: -8,
    marginBottom: 14,
  },
  fuelTypeRow:    { flexDirection: 'row', gap: 8, marginBottom: 14 },
  fuelTypeChip:   {
    flex: 1,
    alignItems: 'center',
    backgroundColor: c.Dashboard.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.Dashboard.cardBorder,
    paddingVertical: 10,
  },
  fuelTypeChipOn: { backgroundColor: c.Dashboard.accentDeep, borderColor: c.Dashboard.accentDeep },
  fuelTypeText:   { fontSize: 14, fontWeight: '600', color: c.Dashboard.textSecondary },
  fuelTypeTextOn: { color: c.Dashboard.onAccent },
  modalSaveBtn:   {
    backgroundColor: c.Dashboard.accentDeep,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  modalSaveText:  { color: c.Dashboard.onAccent, fontSize: 15, fontWeight: '700' },

  // מצב ריק
  emptyState:     { alignItems: 'center', paddingTop: 80 },
  emptyIcon:      { fontSize: 48 },
  emptyText:      { fontSize: 17, fontWeight: '600', color: c.Dashboard.textPrimary, marginTop: 12 },
  emptySubtext:   { fontSize: 13, color: c.Dashboard.textSecondary, marginTop: 6, textAlign: 'center' },
}));
