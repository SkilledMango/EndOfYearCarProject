/**
 * הוספת רכב למוסך של המשתמש, בתהליך רב-שלבי.
 *
 * מסלול א' — לפי מספר רישוי (המומלץ):
 *   1. הקלדת מספר רישוי ישראלי
 *   2. שנה, יצרן ודגם מתמלאים אוטומטית מהמרשם הממשלתי
 *   3. בחירת גימור מנוע, שממלאת את צריכת הדלק
 *   4. אישור ושמירה
 *
 * מסלול ב' — הזנה ידנית:
 *   שנה → יצרן → דגם → גימור, וכל שלב נשלף ממאגר EPA.
 *
 * צריכת הדלק היא המספר שכל חישובי הדלק והנסיעה נשענים עליו, ולכן התהליך
 * עובד קשה כדי למצוא אותה בלי לשאול את הנהג.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { lookupByPlate }                          from '@/services/vehiclelookup';
import { FEMenuItem, getMakes, getModels, getTrims, getVehicleDetails, mpgToL100km, getNRCanL100km, suggestL100kmByFuelType, epaElectricInfo } from '@/services/fueleconomy';
import { CreateVehicleDto, Vehicle, VehicleSpecs, createVehicle, getVehicleSpecs } from '@/services/api';
import { saveFuelType, saveTankSize } from '@/services/tankState';
import { capacityLabel, electricFromRegistry, energyUnit, isPlausibleCapacity } from '@/utils/powertrain';
import { createThemedStyles, useTheme } from '@/context/ThemeContext';
import { Plate } from '@/constants/theme';

// ─── טיפוסים ─────────────────────────────────────────────────────────────────

type Step = 'plate' | 'year' | 'make' | 'model' | 'trim' | 'details';

/** נתונים שהגיעו מזיהוי מספר שלדה, ומדלגים על שלב מספר הרישוי */
export interface VehiclePrefill {
  make:  string;
  model: string;
  year:  number;
}

interface Props {
  visible:  boolean;
  userId:   number;
  prefill?: VehiclePrefill;   // כשקיים, קופצים ישר לאיתור הצריכה ולפרטים
  onAdded:  (vehicle: Vehicle) => void;
  onClose:  () => void;
}

// ─── הרכיב ───────────────────────────────────────────────────────────────────

export function AddVehicleModal({ visible, userId, prefill, onAdded, onClose }: Props) {
  const { colors: c } = useTheme();
  const s = useStyles();
  // ── ניווט בין השלבים ──
  const [step, setStep] = useState<Step>('plate');

  // ── מצב מסלול מספר הרישוי ──
  const [plateText, setPlateText]   = useState('');
  const [lookupError, setLookupError] = useState<string | null>(null);

  // ── זהות הרכב, מתמלאת מהאיתור או מההזנה הידנית ──
  const [yearText, setYearText]           = useState('');
  const [makes, setMakes]                 = useState<FEMenuItem[]>([]);
  const [selectedMake, setSelectedMake]   = useState('');
  const [models, setModels]               = useState<FEMenuItem[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [trims, setTrims]                 = useState<FEMenuItem[]>([]);

  // ── התוצאה ──
  const [fuelL100km, setFuelL100km]         = useState('');
  const [fuelSource, setFuelSource]         = useState<'epa' | 'nrcan' | 'ai' | 'suggested' | 'manual' | null>(null);
  const [fuelType, setFuelType]             = useState('');  // סוג הדלק בעברית, מתוך המרשם
  const [plate, setPlate]                   = useState('');

  // ── חשמלי או דלק, וגודל המיכל/הסוללה ──
  const [isElectric, setIsElectric]   = useState(false);
  const [powerSource, setPowerSource] = useState<'registry' | 'epa' | 'ai' | 'manual' | null>(null);
  const [tankCapacity, setTankCapacity] = useState('');
  const [tankSource, setTankSource]   = useState<'ai' | 'manual' | null>(null);
  const [specs, setSpecs]             = useState<VehicleSpecs | null>(null);
  // שאלת ה-AI יוצאת לדרך ברגע שזהות הרכב ידועה, ורצה ברקע בזמן שהנהג
  // בוחר גימור — כך שבמסך הפרטים התשובה בדרך כלל כבר מחכה
  const specsRef = useRef<Promise<VehicleSpecs | null> | null>(null);

  // ── שדה החיפוש ברשימות היצרן, הדגם והגימור ──
  const [search, setSearch] = useState('');

  // ── מצב הממשק ──
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // שרשרת איתור צריכת הדלק: EPA ← NRCan ← AI ← הערכה לפי סוג דלק.
  // משותפת למסלול מספר הרישוי ולמסלול זיהוי השלדה.
  // ─────────────────────────────────────────────────────────────────────────

  /** שולח את שאלת ה-AI לדרך ברקע, ברגע שיצרן, דגם ושנה ידועים. */
  const startSpecsLookup = (make: string, model: string, year: number, hFuelType: string) => {
    specsRef.current = getVehicleSpecs(make, model, year, hFuelType);
  };

  /**
   * סוגר את האיתור ועובר למסך הפרטים: מחליט אם הרכב חשמלי, ממלא את גודל
   * המיכל או הסוללה, ולרכב חשמלי גם את הצריכה בקוט"ש.
   * לעולם לא זורק — במקרה הגרוע הנהג פשוט ממלא בעצמו.
   */
  const goToDetails = async (
    hFuelType: string,
    epa?: { isElectric: boolean; kwhPer100km: number | null },
  ) => {
    try {
      const found = specsRef.current ? await specsRef.current : null;
      setSpecs(found);

      // המרשם הישראלי הוא המקור הקובע, אחריו EPA, ורק אז ה-AI
      const fromRegistry = electricFromRegistry(hFuelType);
      const electric = fromRegistry ?? epa?.isElectric ?? found?.isElectric ?? false;
      setIsElectric(electric);
      setPowerSource(
        fromRegistry != null ? 'registry'
        : epa ? 'epa'
        : found?.isElectric != null ? 'ai'
        : null,
      );

      // לרכב חשמלי שרשרת הליטרים לא רלוונטית — הצריכה בקוט"ש
      if (electric) {
        const kwh = epa?.kwhPer100km ?? (found?.isElectric ? found.consumption : null);
        setFuelL100km(kwh ? String(kwh) : '');
        setFuelSource(kwh ? (epa?.kwhPer100km ? 'epa' : 'ai') : 'manual');
      }

      // הגודל מה-AI נכנס רק כשה-AI מסכים איתנו על סוג ההנעה
      if (found?.tankCapacity && found.isElectric === electric) {
        setTankCapacity(String(found.tankCapacity));
        setTankSource('ai');
      } else {
        setTankCapacity('');
        setTankSource('manual');
      }
    } catch {
      setTankSource('manual');
    }
    setStep('details');
  };

  /**
   * הנהג הפך את המתג. המספרים שמוצגים חייבים להתאים לסוג ההנעה שנבחר,
   * ולכן נלקחים מה-AI אם הוא תיאר את אותו סוג, ואחרת מתרוקנים.
   */
  const onToggleElectric = (value: boolean) => {
    setIsElectric(value);
    setPowerSource('manual');
    const match = specs != null && specs.isElectric === value;
    setTankCapacity(match && specs?.tankCapacity ? String(specs.tankCapacity) : '');
    setTankSource(match && specs?.tankCapacity ? 'ai' : 'manual');
    setFuelL100km(match && specs?.consumption ? String(specs.consumption) : '');
    setFuelSource(match && specs?.consumption ? 'ai' : 'manual');
  };

  /**
   * שלבי הגיבוי המשותפים: המאגר הקנדי, ואז ה-AI, ואז הערכה לפי סוג הדלק.
   * תמיד מסתיים במסך הפרטים.
   */
  const applyFallbackFuel = async (
    make: string, model: string, year: number, hFuelType: string,
  ) => {
    try {
      // שלב 3: המאגר הקנדי
      const nrcanL100km = await getNRCanL100km(make, model, year);
      if (nrcanL100km) {
        console.log(`[fuel] Stage 3 NRCan: ${nrcanL100km} L/100km`);
        setFuelL100km(String(nrcanL100km));
        setFuelSource('nrcan');
      } else {
        // שלב 3.5: ה-AI, דרך השרת — אותה שאלה שכבר יצאה לדרך ברקע
        console.log('[fuel] Stage 3 NRCan: no match — asking the AI');
        const found = specsRef.current ? await specsRef.current : null;
        if (found && found.isElectric === false && found.consumption) {
          console.log(`[fuel] Stage 3.5 AI (${found.source}): ${found.consumption} L/100km`);
          setFuelL100km(String(found.consumption));
          setFuelSource('ai');
        } else {
          // שלב 4: הערכה לפי סוג הדלק
          const suggested = suggestL100kmByFuelType(hFuelType);
          console.log(`[fuel] Stage 3.5 AI: no result — fallback suggested=${suggested}`);
          if (suggested !== null) {
            setFuelL100km(String(suggested));
            setFuelSource('suggested');
          } else {
            setFuelSource('manual');  // חשמלי: ליטר ל-100 ק"מ לא רלוונטי
          }
        }
      }
    } catch {
      // כל השלבים נכשלו. הנהג עדיין יכול להקליד את המספר בעצמו,
      // וזה עדיף בהרבה על מסך שנטען לנצח.
      setFuelSource('manual');
    } finally {
      // ב-finally כדי ששגיאה באחד השלבים לא תשאיר את החלון תקוע במצב טעינה,
      // מצב שבו כל שלב מציג גלגל טעינה במקום תוכן.
      await goToDetails(hFuelType);
      setLoading(false);
    }
  };

  const runFuelLookupChain = async (
    make: string, model: string, year: number, hFuelType: string,
  ) => {
    console.log(`[fuel] looking up ${year} ${make} ${model} (fuelType="${hFuelType}")`);

    // שלב 2: מאגר EPA האמריקאי
    try {
      const trimItems = await getTrims(year, make, model);
      if (trimItems.length > 0) {
        console.log(`[fuel] Stage 2 EPA: ${trimItems.length} trim(s) found`);
        setTrims(trimItems);
        setLoading(false);
        setStep('trim');
        return;
      }
    } catch { /* לא נמצא ב-EPA, ממשיכים הלאה */ }
    console.log('[fuel] Stage 2 EPA: no match');

    await applyFallbackFuel(make, model, year, hFuelType);
  };

  // ── איפוס, ומילוי מוקדם אם יש, בכל פתיחה של החלון ────────────────────────
  useEffect(() => {
    if (!visible) return;
    reset();

    if (prefill) {
      // רכב שזוהה לפי שלדה: מדלגים על מספר הרישוי
      setYearText(String(prefill.year));
      setSelectedMake(prefill.make);
      setSelectedModel(prefill.model);
      setLoading(true);
      startSpecsLookup(prefill.make, prefill.model, prefill.year, '');
      runFuelLookupChain(prefill.make, prefill.model, prefill.year, '')
        .catch(() => { setFuelSource('manual'); setLoading(false); setStep('details'); });
    }
  }, [visible]); // eslint-disable-line

  // ── איפוס ────────────────────────────────────────────────────────────────
  const reset = () => {
    // חשוב לנקות קודם: חזרה להתחלה היא המוצא האחרון ממסך תקוע,
    // ודגל שנשאר דלוק היה גורר את התקיעה גם לתהליך החדש.
    setLoading(false);
    setSaving(false);
    setStep('plate');
    setPlateText('');
    setLookupError(null);
    setYearText('');
    setMakes([]);
    setSelectedMake('');
    setModels([]);
    setSelectedModel('');
    setTrims([]);
    setFuelL100km('');
    setFuelSource(null);
    setFuelType('');
    setPlate('');
    setIsElectric(false);
    setPowerSource(null);
    setTankCapacity('');
    setTankSource(null);
    setSpecs(null);
    specsRef.current = null;
    setSearch('');
    setError(null);
  };

  // ניקוי החיפוש בכל מעבר שלב, כדי שהרשימה החדשה לא תגיע מסוננת
  useEffect(() => { setSearch(''); }, [step]);

  const handleClose = () => { reset(); onClose(); };

  // ── ניווט אחורה ──────────────────────────────────────────────────────────
  const handleBack = () => {
    setError(null);
    switch (step) {
      case 'year':    reset(); break;                            // חזרה למסך מספר הרישוי
      case 'make':    setStep('year');   setMakes([]);   break;
      case 'model':   setStep('make');   setModels([]);  setSelectedMake(''); break;
      // מהגימור: רשימת דגמים ריקה מעידה שהגענו ממסלול מספר הרישוי
      case 'trim':
        if (models.length === 0) { const pt = plateText; reset(); setPlateText(pt); }
        else { setStep('model'); setTrims([]); setSelectedModel(''); }
        break;
      // מהפרטים: רשימת גימורים ריקה מעידה שדילגנו על שלב הגימור
      case 'details':
        if (trims.length === 0) { const pt = plateText; reset(); setPlateText(pt); }
        else { setStep('trim'); setFuelL100km(''); setFuelSource(null); }
        break;
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // מסלול א': איתור לפי מספר רישוי
  // ─────────────────────────────────────────────────────────────────────────

  const handlePlateLookup = async () => {
    if (plateText.replace(/\D/g, '').length < 5) {
      setLookupError('Enter a valid license plate number');
      return;
    }
    setLoading(true);
    setLookupError(null);

    // ── שלב 1: איתור במרשם הרכב הישראלי ──────────────────────────────────
    let result;
    try {
      result = await lookupByPlate(plateText);
    } catch (e) {
      setLookupError(`Lookup failed: ${e instanceof Error ? e.message : String(e)}`);
      setLoading(false);
      return;
    }

    if (!result) {
      setLookupError('Vehicle not found in the registry. Check the plate number or enter details manually.');
      setLoading(false);
      return;
    }

    // מילוי זהות הרכב מהמרשם
    setYearText(String(result.year));
    setSelectedMake(result.make);
    setSelectedModel(result.model);
    setPlate(plateText.trim());
    setFuelType(result.fuelType);   // שומרים את סוג הדלק בעברית לצורך הערכת ברירת המחדל
    startSpecsLookup(result.make, result.model, result.year, result.fuelType);

    // הפעלת שרשרת איתור הצריכה המשותפת
    await runFuelLookupChain(result.make, result.model, result.year, result.fuelType);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // מסלול ב': הזנה ידנית — שלב 1, שנה
  // ─────────────────────────────────────────────────────────────────────────

  const handleFindMakes = async () => {
    const year = parseInt(yearText, 10);
    if (!year || year < 1980 || year > new Date().getFullYear() + 1) {
      setError('Enter a valid year (e.g. 2018)');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const items = await getMakes(year);
      if (items.length === 0) { setError('No vehicles found for that year.'); return; }
      setMakes(items);
      setStep('make');
    } catch {
      setError('Could not load makes — check your internet connection.');
    } finally {
      setLoading(false);
    }
  };

  // ── שלב 2: יצרן ──
  const handleSelectMake = async (make: string) => {
    setSelectedMake(make);
    setLoading(true);
    setError(null);
    try {
      const items = await getModels(parseInt(yearText, 10), make);
      setModels(items);
      setStep('model');
    } catch {
      setError('Could not load models.');
    } finally {
      setLoading(false);
    }
  };

  // ── שלב 3: דגם ──
  const handleSelectModel = async (model: string) => {
    setSelectedModel(model);
    setLoading(true);
    setError(null);
    startSpecsLookup(selectedMake, model, parseInt(yearText, 10), '');
    try {
      const items = await getTrims(parseInt(yearText, 10), selectedMake, model);
      setTrims(items);
      setStep('trim');
    } catch {
      setError('Could not load trim options.');
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // משותף: בחירת גימור ושליפת נתוני הצריכה מ-EPA
  // ─────────────────────────────────────────────────────────────────────────

  const handleSelectTrim = async (trimId: string) => {
    setLoading(true);
    setError(null);
    // עטוף כדי שכל יציאה תכבה את מצב הטעינה. מסלול ההצלחה יוצא מוקדם,
    // ובלי זה החלון היה נשאר בטעינה לנצח וכפתור החזרה היה נראה מקולקל.
    try {
      try {
        const details = await getVehicleDetails(trimId);
        const epa = epaElectricInfo(details);
        // רכב חשמלי: ה-MPGe של EPA לא שווה כלום בליטרים — goToDetails ממלא קוט"ש
        if (epa.isElectric) {
          await goToDetails(fuelType, epa);
          return;
        }
        if (details.comb08 > 0) {
          setFuelL100km(String(mpgToL100km(details.comb08)));
          setFuelSource('epa');
          await goToDetails(fuelType, epa);
          return;
        }
      } catch { /* ממשיכים לשלב הבא */ }

      // לגימור אין נתון צריכה ב-EPA, ולכן מפעילים את שרשרת הגיבוי
      const year = parseInt(yearText, 10);
      if (selectedMake && selectedModel && year) {
        await applyFallbackFuel(selectedMake, selectedModel, year, fuelType);
        return;
      }
      const suggested = suggestL100kmByFuelType(fuelType);
      if (suggested !== null) { setFuelL100km(String(suggested)); setFuelSource('suggested'); } else { setFuelSource('manual'); }
      await goToDetails(fuelType);
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // משותף: שמירת הרכב
  // ─────────────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!plate.trim()) { setError('Please enter a license plate number.'); return; }

    // גודל המיכל רשות, אבל אם הוקלד — שיהיה של רכב אמיתי
    const capacity = parseFloat(tankCapacity);
    if (tankCapacity.trim() && !isPlausibleCapacity(capacity, isElectric)) {
      setError(isElectric
        ? 'Battery size should be between 10 and 200 kWh.'
        : 'Tank size should be between 20 and 150 litres.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const dto: CreateVehicleDto = {
        make:                   selectedMake,
        model:                  selectedModel,
        year:                   parseInt(yearText, 10),
        licensePlate:           plate.trim().toUpperCase(),
        averageFuelConsumption: parseFloat(fuelL100km) || 0,
        isElectric,
        tankCapacity:           capacity > 0 ? capacity : 0,
        appUserId:              userId,
      };
      const vehicle = await createVehicle(dto);

      // מסכי הדלק קוראים את גודל המיכל ואת סוג הדלק מהמכשיר — ממלאים אותם
      // מראש כדי שהנהג לא יתבקש להקליד את מה שכבר זוהה
      if (capacity > 0) await saveTankSize(capacity, vehicle.id);
      if (!isElectric && fuelType.includes('דיזל')) await saveFuelType('diesel', vehicle.id);

      reset();
      onAdded(vehicle);
    } catch {
      setError('Failed to save — please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── שורת ההתמצאות בראש החלון ─────────────────────────────────────────────
  const crumb = [yearText, selectedMake, selectedModel].filter(Boolean).join(' · ');

  // ─────────────────────────────────────────────────────────────────────────
  // התצוגה
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={s.screen}>

        {/* ── כותרת ── */}
        <View style={s.header}>
          {step !== 'plate' ? (
            <Pressable onPress={handleBack} style={s.backBtn}>
              <Text style={s.backText}>← Back</Text>
            </Pressable>
          ) : (
            <View style={s.backBtn} />
          )}
          <View style={s.headerCenter}>
            <Text style={s.headerTitle}>ADD VEHICLE</Text>
            {!!crumb && <Text style={s.headerCrumb}>{crumb}</Text>}
          </View>
          <Pressable onPress={handleClose} style={s.closeBtn}>
            <Text style={s.closeText}>✕</Text>
          </Pressable>
        </View>

        <ScrollView style={s.body} contentContainerStyle={s.bodyContent} keyboardShouldPersistTaps="handled">

          {!!error && <Text style={s.errorBox}>{error}</Text>}

          {/* ──────────── שלב: מספר רישוי ──────────── */}
          {step === 'plate' && (
            <View style={s.section}>

              {/* הכותרת הגדולה */}
              <View style={s.plateHero}>
                <View style={s.plateHeroCircle}>
                  <Text style={s.plateHeroIcon}>🚗</Text>
                </View>
                <Text style={s.plateHeadline}>Let&apos;s find your car</Text>
                <Text style={s.plateSub}>
                  Enter your license plate number to automatically retrieve vehicle details.
                </Text>
              </View>

              {/* שדה לוחית רישוי ישראלית: לשונית כחולה ושדה צהוב */}
              <View style={s.plateWrap}>
                <View style={s.plateTab}>
                  <Text style={s.plateTabStar}>✡</Text>
                  <Text style={s.plateTabIL}>IL</Text>
                </View>
                <TextInput
                  style={s.plateInput}
                  value={plateText}
                  onChangeText={t => { setPlateText(t); setLookupError(null); }}
                  placeholder="123-45-678"
                  placeholderTextColor="#9a8a00"
                  keyboardType="default"
                  autoCapitalize="none"
                  autoFocus
                  returnKeyType="search"
                  onSubmitEditing={handlePlateLookup}
                />
              </View>

              {!!lookupError && (
                <Text style={s.lookupError}>{lookupError}</Text>
              )}

              <Pressable
                style={[s.primaryBtn, (loading || plateText.length < 5) && s.btnDisabled]}
                onPress={handlePlateLookup}
                disabled={loading || plateText.length < 5}
              >
                {loading
                  ? <ActivityIndicator color={c.Dashboard.onAccent} />
                  : <Text style={s.primaryBtnText}>🔍  Look Up My Car</Text>}
              </Pressable>

              {/* מוצא חלופי: הזנה ידנית */}
              <Pressable style={s.secondaryBtn} onPress={() => setStep('year')}>
                <Text style={s.secondaryBtnText}>Enter manually instead</Text>
              </Pressable>
            </View>
          )}

          {/* ──────────── שלב: שנה ──────────── */}
          {step === 'year' && (
            <View style={s.section}>
              <Text style={s.sectionLabel}>WHAT YEAR IS YOUR CAR?</Text>
              <TextInput
                style={s.input}
                value={yearText}
                onChangeText={t => { setYearText(t); setError(null); }}
                keyboardType="numeric"
                maxLength={4}
                placeholder="e.g. 2018"
                placeholderTextColor={c.Dashboard.textSecondary}
                returnKeyType="done"
                onSubmitEditing={handleFindMakes}
                autoFocus
              />
              <Pressable
                style={[s.primaryBtn, (loading || yearText.length < 4) && s.btnDisabled]}
                onPress={handleFindMakes}
                disabled={loading || yearText.length < 4}
              >
                {loading
                  ? <ActivityIndicator color={c.Dashboard.onAccent} />
                  : <Text style={s.primaryBtnText}>FIND MAKES →</Text>}
              </Pressable>
            </View>
          )}

          {/* ──────────── שלב: יצרן ──────────── */}
          {step === 'make' && (
            <View style={s.section}>
              <Text style={s.sectionLabel}>SELECT MAKE</Text>
              {!loading && (
                <TextInput
                  style={s.searchInput}
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search makes…"
                  placeholderTextColor={c.Dashboard.textSecondary}
                  clearButtonMode="while-editing"
                  autoCorrect={false}
                />
              )}
              {loading
                ? <ActivityIndicator color={c.Dashboard.accent} style={{ marginTop: 32 }} />
                : makes
                    .filter(m => m.text.toLowerCase().includes(search.toLowerCase()))
                    .map(m => (
                      <Pressable key={m.value} style={s.listItem} onPress={() => handleSelectMake(m.value)}>
                        <Text style={s.listText}>{m.text}</Text>
                        <Text style={s.listArrow}>›</Text>
                      </Pressable>
                    ))}
            </View>
          )}

          {/* ──────────── שלב: דגם ──────────── */}
          {step === 'model' && (
            <View style={s.section}>
              <Text style={s.sectionLabel}>SELECT MODEL</Text>
              {!loading && (
                <TextInput
                  style={s.searchInput}
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search models…"
                  placeholderTextColor={c.Dashboard.textSecondary}
                  clearButtonMode="while-editing"
                  autoCorrect={false}
                />
              )}
              {loading
                ? <ActivityIndicator color={c.Dashboard.accent} style={{ marginTop: 32 }} />
                : models
                    .filter(m => m.text.toLowerCase().includes(search.toLowerCase()))
                    .map(m => (
                      <Pressable key={m.value} style={s.listItem} onPress={() => handleSelectModel(m.value)}>
                        <Text style={s.listText}>{m.text}</Text>
                        <Text style={s.listArrow}>›</Text>
                      </Pressable>
                    ))}
            </View>
          )}

          {/* ──────────── שלב: גימור, משותף לשני המסלולים ──────────── */}
          {step === 'trim' && (
            <View style={s.section}>
              <Text style={s.sectionLabel}>SELECT ENGINE / TRIM</Text>
              <Text style={s.sectionHint}>Choose the closest match to get accurate fuel economy data</Text>
              {!loading && (
                <TextInput
                  style={s.searchInput}
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search trims…"
                  placeholderTextColor={c.Dashboard.textSecondary}
                  clearButtonMode="while-editing"
                  autoCorrect={false}
                />
              )}
              {loading
                ? <ActivityIndicator color={c.Dashboard.accent} style={{ marginTop: 32 }} />
                : trims
                    .filter(t => t.text.toLowerCase().includes(search.toLowerCase()))
                    .map(t => (
                      <Pressable key={t.value} style={s.listItem} onPress={() => handleSelectTrim(t.value)}>
                        <Text style={s.listText} numberOfLines={2}>{t.text}</Text>
                        <Text style={s.listArrow}>›</Text>
                      </Pressable>
                    ))}
            </View>
          )}

          {/* ──────────── שלב: אישור הפרטים ──────────── */}
          {step === 'details' && (
            <View style={s.section}>
              <Text style={s.sectionLabel}>CONFIRM DETAILS</Text>

              {/* סיכום הרכב שזוהה */}
              {!!(yearText && selectedMake && selectedModel) && (
                <View style={s.vehicleSummaryCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.vehicleSummaryLabel}>DETECTED VEHICLE</Text>
                    <Text style={s.vehicleSummaryName}>
                      {yearText} {selectedMake} {selectedModel}
                    </Text>
                  </View>
                  <View style={s.checkCircle}>
                    <Text style={s.checkMark}>✓</Text>
                  </View>
                </View>
              )}

              {/* חשמלי או דלק — קובע את כל היחידות במסכי הדלק */}
              <View style={[s.infoCard, powerSource && powerSource !== 'manual' && s.infoCardSuccess]}>
                <View style={s.powerRow}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={s.infoCardLabel}>
                      {isElectric ? '⚡ ELECTRIC VEHICLE' : '⛽ FUEL VEHICLE'}
                    </Text>
                    <Text style={s.infoCardNote}>
                      {powerSource === 'registry' && 'From the Israeli vehicle registry.'}
                      {powerSource === 'epa'      && 'From EPA data for this trim.'}
                      {powerSource === 'ai'       && 'Detected by AI — flip the switch if it is wrong.'}
                      {(powerSource === 'manual' || powerSource === null) && 'Electric car? Turn this on.'}
                    </Text>
                  </View>
                  <Switch
                    value={isElectric}
                    onValueChange={onToggleElectric}
                    trackColor={{ true: c.Dashboard.accent, false: c.Dashboard.cardBorder }}
                  />
                </View>
              </View>

              {/* הצריכה: ליטרים או קוט"ש ל-100 ק"מ */}
              <View style={[s.infoCard,
                (fuelSource === 'epa' || fuelSource === 'nrcan' || fuelSource === 'ai') && s.infoCardSuccess,
                fuelSource === 'suggested' && s.infoCardWarning,
              ]}>
                <Text style={s.infoCardLabel}>
                  {isElectric ? 'ENERGY CONSUMPTION' : 'FUEL CONSUMPTION'}
                  {fuelSource === 'epa'       && ' — EPA DATA'}
                  {fuelSource === 'nrcan'     && ' — NRCAN DATA'}
                  {fuelSource === 'ai'        && ' — AI LOOKUP'}
                  {fuelSource === 'suggested' && ' — ESTIMATED'}
                  {fuelSource === 'manual'    && ' — ENTER MANUALLY'}
                </Text>
                {fuelSource === 'epa' && (
                  <Text style={s.infoCardNote}>
                    {isElectric
                      ? 'EPA combined figure for your trim, converted to kWh/100km.'
                      : 'EPA combined city/highway figure for your trim, converted to L/100km.'}
                    {' '}Adjust to match your real-world driving.
                  </Text>
                )}
                {fuelSource === 'nrcan' && (
                  <Text style={s.infoCardNote}>
                    Combined L/100km from Natural Resources Canada — covers European and
                    non-US market cars. Adjust if needed.
                  </Text>
                )}
                {fuelSource === 'ai' && (
                  <Text style={s.infoCardNote}>
                    WLTP figure looked up by AI. Accurate for most models —
                    still worth adjusting to your actual driving conditions.
                  </Text>
                )}
                {fuelSource === 'suggested' && (
                  <Text style={[s.infoCardNote, { color: c.Severity.yellow }]}>
                    ⚡ No database entry found for this model. Pre-filled with a typical
                    figure for its fuel type — edit to match your actual consumption.
                  </Text>
                )}
                {(fuelSource === 'manual' || fuelSource === null) && (
                  <Text style={[s.infoCardNote, { color: c.Severity.yellow }]}>
                    {isElectric
                      ? '⚠ No consumption data found. Enter your average kWh/100km (shown in the car\'s trip computer).'
                      : '⚠ No fuel data found for this vehicle. Enter your average consumption below (check your car manual or fuel log).'}
                  </Text>
                )}
                <View style={s.fuelRow}>
                  <TextInput
                    style={[s.input, s.fuelInput]}
                    value={fuelL100km}
                    onChangeText={setFuelL100km}
                    keyboardType="decimal-pad"
                    placeholder={isElectric ? 'e.g. 16' : 'e.g. 8.7'}
                    placeholderTextColor={c.Dashboard.textSecondary}
                  />
                  <Text style={s.fuelUnit}>{isElectric ? 'kWh / 100km' : 'L / 100km'}</Text>
                </View>
              </View>

              {/* גודל המיכל או הסוללה — ממולא ע"י ה-AI */}
              <View style={[s.infoCard, tankSource === 'ai' && s.infoCardSuccess]}>
                <Text style={s.infoCardLabel}>
                  {capacityLabel(isElectric).toUpperCase()}
                  {tankSource === 'ai' && ' — AI LOOKUP'}
                </Text>
                <Text style={s.infoCardNote}>
                  {tankSource === 'ai'
                    ? 'Filled in from the factory spec. Check it against your manual if unsure.'
                    : `Optional — used for range and the cost to ${isElectric ? 'charge' : 'fill up'}.`}
                </Text>
                <View style={s.fuelRow}>
                  <TextInput
                    style={[s.input, s.fuelInput]}
                    value={tankCapacity}
                    onChangeText={(text) => { setTankCapacity(text); setTankSource('manual'); }}
                    keyboardType="decimal-pad"
                    placeholder={isElectric ? 'e.g. 75' : 'e.g. 50'}
                    placeholderTextColor={c.Dashboard.textSecondary}
                  />
                  <Text style={s.fuelUnit}>{energyUnit(isElectric)}</Text>
                </View>
              </View>

              {/* מספר הרישוי */}
              <Text style={s.fieldLabel}>LICENSE PLATE</Text>
              <TextInput
                style={s.input}
                value={plate}
                onChangeText={setPlate}
                placeholder="e.g. 12-345-67"
                placeholderTextColor={c.Dashboard.textSecondary}
                autoCapitalize="characters"
              />

              <Pressable
                style={[s.primaryBtn, (saving || !plate.trim()) && s.btnDisabled]}
                onPress={handleSubmit}
                disabled={saving || !plate.trim()}
              >
                {saving
                  ? <ActivityIndicator color={c.Dashboard.onAccent} />
                  : <Text style={s.primaryBtnText}>＋  Add to Garage</Text>}
              </Pressable>
            </View>
          )}

        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── סגנונות, לפי הערכה הפעילה ───────────────────────────────────────────────

const useStyles = createThemedStyles((c) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.Dashboard.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: c.Dashboard.card,
    borderBottomWidth: 1,
    borderBottomColor: c.Dashboard.cardBorder,
  },
  backBtn:      { width: 60 },
  backText:     { fontSize: 14, color: c.Dashboard.accent, fontWeight: '700' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle:  { fontSize: 15, fontWeight: '800', color: c.Dashboard.textPrimary, letterSpacing: 0.3 },
  headerCrumb:  { fontSize: 11, color: c.Dashboard.textSecondary, marginTop: 2 },
  closeBtn:     { width: 60, alignItems: 'flex-end' },
  closeText:    { fontSize: 18, color: c.Dashboard.textSecondary },

  body:        { flex: 1 },
  bodyContent: { padding: 20, paddingBottom: 48, gap: 0 },

  errorBox: {
    color: c.Severity.red,
    fontSize: 13,
    marginBottom: 16,
    padding: 12,
    backgroundColor: c.SeveritySoft.red,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.Severity.red + '44',
  },
  lookupError: {
    color: c.Severity.yellow,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },

  section:      { gap: 14 },
  sectionLabel: { fontSize: 12, color: c.Dashboard.textSecondary, fontWeight: '700', letterSpacing: 1.2, marginBottom: 2 },
  sectionHint:  { fontSize: 13, color: c.Dashboard.textSecondary, lineHeight: 19, marginTop: -8 },

  // הכותרת בשלב מספר הרישוי
  plateHero:       { alignItems: 'center', paddingTop: 16, gap: 4 },
  plateHeroCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: c.Dashboard.accentSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  plateHeroIcon: { fontSize: 40 },
  plateHeadline: {
    fontSize: 24,
    fontWeight: '800',
    color: c.Dashboard.textPrimary,
    letterSpacing: -0.3,
  },
  plateSub: {
    fontSize: 14,
    color: c.Dashboard.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    paddingHorizontal: 12,
    marginBottom: 8,
  },

  // שדה לוחית הרישוי
  plateWrap: {
    flexDirection: 'row',
    borderWidth: 2.5,
    borderColor: Plate.border,
    borderRadius: 12,
    overflow: 'hidden',
    height: 74,
  },
  plateTab: {
    width: 46,
    backgroundColor: Plate.tabBlue,
    justifyContent: 'center',
    alignItems: 'center',
  },
  plateTabStar: { color: '#fff', fontSize: 16, lineHeight: 20 },
  plateTabIL:   { color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  plateInput: {
    flex: 1,
    backgroundColor: Plate.yellow,
    color: Plate.border,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 4,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },

  input: {
    backgroundColor: c.Dashboard.card,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: c.Dashboard.cardBorder,
    padding: 14,
    fontSize: 16,
    color: c.Dashboard.textPrimary,
  },

  primaryBtn: {
    backgroundColor: c.Dashboard.accentDeep,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
    shadowColor: c.Dashboard.accentDeep,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  btnDisabled:    { opacity: 0.4 },
  primaryBtnText: { color: c.Dashboard.onAccent, fontWeight: '700', fontSize: 16 },

  secondaryBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: { fontSize: 15, color: c.Dashboard.accent, fontWeight: '700' },

  searchInput: {
    backgroundColor: c.Dashboard.card,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: c.Dashboard.accent + '55',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: c.Dashboard.textPrimary,
  },

  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.Dashboard.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.Dashboard.cardBorder,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  listText:  { flex: 1, fontSize: 15, color: c.Dashboard.textPrimary },
  listArrow: { fontSize: 20, color: c.Dashboard.textSecondary, marginLeft: 8 },

  vehicleSummaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.Dashboard.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.Dashboard.cardBorder,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  vehicleSummaryLabel: {
    fontSize: 10,
    color: c.Dashboard.accent,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  vehicleSummaryName: {
    fontSize: 18,
    fontWeight: '800',
    color: c.Dashboard.textPrimary,
  },
  checkCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: c.SeveritySoft.green,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  checkMark: { color: c.Severity.green, fontSize: 17, fontWeight: '800' },

  infoCard: {
    backgroundColor: c.Dashboard.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.Dashboard.cardBorder,
    padding: 16,
    gap: 8,
  },
  infoCardSuccess: {
    borderColor: c.Severity.green + '55',
    backgroundColor: c.SeveritySoft.green,
  },
  infoCardWarning: {
    borderColor: c.Severity.yellow + '55',
    backgroundColor: c.SeveritySoft.yellow,
  },
  infoCardLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: c.Dashboard.textSecondary,
    letterSpacing: 1.2,
  },
  infoCardNote: {
    fontSize: 12,
    color: c.Dashboard.textSecondary,
    lineHeight: 18,
  },
  fuelRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  powerRow:  { flexDirection: 'row', alignItems: 'center' },
  fuelInput: { flex: 1 },
  fuelUnit:  { fontSize: 14, color: c.Dashboard.textSecondary, fontWeight: '600' },

  fieldLabel: {
    fontSize: 11,
    color: c.Dashboard.textSecondary,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 4,
  },
}));
