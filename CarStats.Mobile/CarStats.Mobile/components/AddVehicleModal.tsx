/**
 * AddVehicleModal.tsx
 *
 * Multi-step flow to add a vehicle to the user's garage.
 *
 * Flow A — Plate lookup (recommended):
 *   1. Enter Israeli license plate
 *   2. Auto-fills year / make / model from the government registry
 *   3. Pick engine trim (EPA API) → auto-fills fuel consumption
 *   4. Confirm → save
 *
 * Flow B — Manual entry:
 *   1. Enter year
 *   2. Pick make  (EPA API)
 *   3. Pick model (EPA API)
 *   4. Pick trim  (EPA API) → auto-fills fuel consumption
 *   5. Confirm → save
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { lookupByPlate }                          from '@/services/vehiclelookup';
import { FEMenuItem, getMakes, getModels, getTrims, getVehicleDetails, mpgToL100km, getNRCanL100km, getGeminiL100km, suggestL100kmByFuelType } from '@/services/fueleconomy';
import { CreateVehicleDto, Vehicle, createVehicle } from '@/services/api';
import { createThemedStyles, useTheme } from '@/context/ThemeContext';
import { Plate } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 'plate' | 'year' | 'make' | 'model' | 'trim' | 'details';

/** Pre-filled data from OBD VIN detection — skips plate entry */
export interface VehiclePrefill {
  make:  string;
  model: string;
  year:  number;
}

interface Props {
  visible:  boolean;
  userId:   number;
  prefill?: VehiclePrefill;   // when set, skips straight to fuel lookup + details
  onAdded:  (vehicle: Vehicle) => void;
  onClose:  () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AddVehicleModal({ visible, userId, prefill, onAdded, onClose }: Props) {
  const { colors: c } = useTheme();
  const s = useStyles();
  // ── Navigation ──
  const [step, setStep] = useState<Step>('plate');

  // ── Plate-lookup state ──
  const [plateText, setPlateText]   = useState('');
  const [lookupError, setLookupError] = useState<string | null>(null);

  // ── Vehicle identity (filled by lookup or manual steps) ──
  const [yearText, setYearText]           = useState('');
  const [makes, setMakes]                 = useState<FEMenuItem[]>([]);
  const [selectedMake, setSelectedMake]   = useState('');
  const [models, setModels]               = useState<FEMenuItem[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [trims, setTrims]                 = useState<FEMenuItem[]>([]);

  // ── Result state ──
  const [fuelL100km, setFuelL100km]         = useState('');
  const [fuelSource, setFuelSource]         = useState<'epa' | 'nrcan' | 'ai' | 'suggested' | 'manual' | null>(null);
  const [fuelType, setFuelType]             = useState('');  // Hebrew fuel type from Israeli registry
  const [plate, setPlate]                   = useState('');

  // ── Search filter (for make / model / trim lists) ──
  const [search, setSearch] = useState('');

  // ── UI state ──
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // SHARED: Fuel-lookup chain (EPA → NRCan → Gemini AI → smart default)
  // Called by both the plate lookup flow and the VIN prefill flow.
  // ─────────────────────────────────────────────────────────────────────────
  /**
   * Fallback stages shared by the plate flow and the trim flow:
   *   NRCan (Canadian dataset) → Gemini AI → smart default by fuel type.
   * Always lands on the details step.
   */
  const applyFallbackFuel = async (
    make: string, model: string, year: number, hFuelType: string,
  ) => {
    // Stage 3: NRCan (European petrol + all Asian/US)
    const nrcanL100km = await getNRCanL100km(make, model, year);
    if (nrcanL100km) {
      console.log(`[fuel] Stage 3 NRCan: ${nrcanL100km} L/100km`);
      setFuelL100km(String(nrcanL100km));
      setFuelSource('nrcan');
    } else {
      // Stage 3.5: Gemini AI (global knowledge — covers any model)
      console.log('[fuel] Stage 3 NRCan: no match — trying Gemini');
      const aiL100km = await getGeminiL100km(make, model, year, hFuelType);
      if (aiL100km) {
        console.log(`[fuel] Stage 3.5 Gemini: ${aiL100km} L/100km`);
        setFuelL100km(String(aiL100km));
        setFuelSource('ai');
      } else {
        // Stage 4: Smart default from fuel type
        const suggested = suggestL100kmByFuelType(hFuelType);
        console.log(`[fuel] Stage 3.5 Gemini: no result — fallback suggested=${suggested}`);
        if (suggested !== null) {
          setFuelL100km(String(suggested));
          setFuelSource('suggested');
        } else {
          setFuelSource('manual');  // electric — L/100km not applicable
        }
      }
    }
    setLoading(false);
    setStep('details');
  };

  const runFuelLookupChain = async (
    make: string, model: string, year: number, hFuelType: string,
  ) => {
    console.log(`[fuel] looking up ${year} ${make} ${model} (fuelType="${hFuelType}")`);

    // Stage 2: EPA (US-market cars)
    try {
      const trimItems = await getTrims(year, make, model);
      if (trimItems.length > 0) {
        console.log(`[fuel] Stage 2 EPA: ${trimItems.length} trim(s) found`);
        setTrims(trimItems);
        setLoading(false);
        setStep('trim');
        return;
      }
    } catch { /* not in EPA — continue */ }
    console.log('[fuel] Stage 2 EPA: no match');

    await applyFallbackFuel(make, model, year, hFuelType);
  };

  // ── Reset + optional prefill whenever the modal opens ────────────────────
  useEffect(() => {
    if (!visible) return;
    reset();

    if (prefill) {
      // VIN-detected car: skip plate entry, go straight to fuel lookup
      setYearText(String(prefill.year));
      setSelectedMake(prefill.make);
      setSelectedModel(prefill.model);
      setLoading(true);
      runFuelLookupChain(prefill.make, prefill.model, prefill.year, '')
        .catch(() => { setFuelSource('manual'); setLoading(false); setStep('details'); });
    }
  }, [visible]); // eslint-disable-line

  // ── Reset ─────────────────────────────────────────────────────────────────
  const reset = () => {
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
    setSearch('');
    setError(null);
  };

  // Clear search whenever the step changes so the new list isn't pre-filtered
  useEffect(() => { setSearch(''); }, [step]);

  const handleClose = () => { reset(); onClose(); };

  // ── Back navigation ───────────────────────────────────────────────────────
  const handleBack = () => {
    setError(null);
    switch (step) {
      case 'year':    reset(); break;                            // back to plate screen
      case 'make':    setStep('year');   setMakes([]);   break;
      case 'model':   setStep('make');   setModels([]);  setSelectedMake(''); break;
      // From trim: if models is empty we came via plate lookup — go back to plate
      case 'trim':
        if (models.length === 0) { const pt = plateText; reset(); setPlateText(pt); }
        else { setStep('model'); setTrims([]); setSelectedModel(''); }
        break;
      // From details: if trims is empty we skipped trim (plate flow w/ no EPA data) — go back to plate
      case 'details':
        if (trims.length === 0) { const pt = plateText; reset(); setPlateText(pt); }
        else { setStep('trim'); setFuelL100km(''); setFuelSource(null); }
        break;
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // FLOW A: License plate lookup
  // ─────────────────────────────────────────────────────────────────────────

  const handlePlateLookup = async () => {
    if (plateText.replace(/\D/g, '').length < 5) {
      setLookupError('Enter a valid license plate number');
      return;
    }
    setLoading(true);
    setLookupError(null);

    // ── Stage 1: Israeli government plate lookup ──────────────────────────
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

    // Pre-fill identity from registry
    setYearText(String(result.year));
    setSelectedMake(result.make);
    setSelectedModel(result.model);
    setPlate(plateText.trim());
    setFuelType(result.fuelType);   // keep Hebrew fuel type for smart defaults

    // Run shared fuel-lookup chain (stages 2 → 3 → 3.5 → 4)
    await runFuelLookupChain(result.make, result.model, result.year, result.fuelType);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // FLOW B: Manual — Step 1 Year
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

  // ── Step 2: make ──
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

  // ── Step 3: model ──
  const handleSelectModel = async (model: string) => {
    setSelectedModel(model);
    setLoading(true);
    setError(null);
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
  // SHARED: Select trim → fetch EPA fuel economy
  // ─────────────────────────────────────────────────────────────────────────

  const handleSelectTrim = async (trimId: string) => {
    setLoading(true);
    setError(null);
    try {
      const details = await getVehicleDetails(trimId);
      if (details.comb08 > 0) {
        setFuelL100km(String(mpgToL100km(details.comb08)));
        setFuelSource('epa');
        setStep('details');
        return;
      }
    } catch { /* fall through */ }

    // EPA trim had no fuel data — run the shared NRCan → Gemini → default chain
    const year = parseInt(yearText, 10);
    if (selectedMake && selectedModel && year) {
      await applyFallbackFuel(selectedMake, selectedModel, year, fuelType);
      return;
    }
    const suggested = suggestL100kmByFuelType(fuelType);
    if (suggested !== null) { setFuelL100km(String(suggested)); setFuelSource('suggested'); } else { setFuelSource('manual'); }
    setStep('details');
    setLoading(false);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SHARED: Submit
  // ─────────────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!plate.trim()) { setError('Please enter a license plate number.'); return; }
    setSaving(true);
    setError(null);
    try {
      const dto: CreateVehicleDto = {
        make:                   selectedMake,
        model:                  selectedModel,
        year:                   parseInt(yearText, 10),
        licensePlate:           plate.trim().toUpperCase(),
        averageFuelConsumption: parseFloat(fuelL100km) || 0,
        appUserId:              userId,
      };
      const vehicle = await createVehicle(dto);
      reset();
      onAdded(vehicle);
    } catch {
      setError('Failed to save — please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Breadcrumb ────────────────────────────────────────────────────────────
  const crumb = [yearText, selectedMake, selectedModel].filter(Boolean).join(' · ');

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  const stepOrder: Step[] = ['plate', 'year', 'make', 'model', 'trim', 'details'];
  const stepIndex = stepOrder.indexOf(step);
  // For progress dots: plate=0, year is also early, then make, model, trim, details
  const progressSteps: Step[] = ['plate', 'trim', 'details'];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={s.screen}>

        {/* ── Header ── */}
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

          {/* ──────────── STEP: Plate lookup ──────────── */}
          {step === 'plate' && (
            <View style={s.section}>

              {/* Hero */}
              <View style={s.plateHero}>
                <View style={s.plateHeroCircle}>
                  <Text style={s.plateHeroIcon}>🚗</Text>
                </View>
                <Text style={s.plateHeadline}>Let's find your car</Text>
                <Text style={s.plateSub}>
                  Enter your license plate number to automatically retrieve vehicle details.
                </Text>
              </View>

              {/* Israeli license-plate input: blue IL tab + yellow field */}
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

              {/* Fallback: manual entry */}
              <Pressable style={s.secondaryBtn} onPress={() => setStep('year')}>
                <Text style={s.secondaryBtnText}>Enter manually instead</Text>
              </Pressable>
            </View>
          )}

          {/* ──────────── STEP: Year (manual flow) ──────────── */}
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

          {/* ──────────── STEP: Make ──────────── */}
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

          {/* ──────────── STEP: Model ──────────── */}
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

          {/* ──────────── STEP: Trim (shared by both flows) ──────────── */}
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

          {/* ──────────── STEP: Confirm details (shared) ──────────── */}
          {step === 'details' && (
            <View style={s.section}>
              <Text style={s.sectionLabel}>CONFIRM DETAILS</Text>

              {/* Detected vehicle summary */}
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

              {/* Fuel consumption */}
              <View style={[s.infoCard,
                (fuelSource === 'epa' || fuelSource === 'nrcan' || fuelSource === 'ai') && s.infoCardSuccess,
                fuelSource === 'suggested' && s.infoCardWarning,
              ]}>
                <Text style={s.infoCardLabel}>
                  {fuelSource === 'epa'       && '✓ FUEL CONSUMPTION — EPA DATA'}
                  {fuelSource === 'nrcan'     && '✓ FUEL CONSUMPTION — NRCAN DATA'}
                  {fuelSource === 'ai'        && '✓ FUEL CONSUMPTION — AI LOOKUP'}
                  {fuelSource === 'suggested' && '⚡ FUEL CONSUMPTION — ESTIMATED'}
                  {fuelSource === 'manual'    && 'FUEL CONSUMPTION — ENTER MANUALLY'}
                  {fuelSource === null        && 'FUEL CONSUMPTION'}
                </Text>
                {fuelSource === 'epa' && (
                  <Text style={s.infoCardNote}>
                    EPA combined city/highway figure for your trim, converted to L/100km.
                    Adjust to match your real-world driving.
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
                    WLTP figure sourced via AI (Gemini). Accurate for most models —
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
                    ⚠ No fuel data found for this vehicle. Enter your average
                    consumption below (check your car manual or fuel log).
                  </Text>
                )}
                <View style={s.fuelRow}>
                  <TextInput
                    style={[s.input, s.fuelInput]}
                    value={fuelL100km}
                    onChangeText={setFuelL100km}
                    keyboardType="decimal-pad"
                    placeholder="e.g. 8.7"
                    placeholderTextColor={c.Dashboard.textSecondary}
                  />
                  <Text style={s.fuelUnit}>L / 100km</Text>
                </View>
              </View>

              {/* License plate */}
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

// ─── Styles (Soft Tech design system, theme-aware) ────────────────────────────

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

  // Plate-step hero
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

  // Israeli license-plate input
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
