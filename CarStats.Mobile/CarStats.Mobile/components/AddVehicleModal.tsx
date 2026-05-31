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
import { Dashboard, Severity }                    from '@/constants/theme';

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
  const runFuelLookupChain = async (
    make: string, model: string, year: number, hFuelType: string,
  ) => {
    // Stage 2: EPA (US-market cars)
    try {
      const trimItems = await getTrims(year, make, model);
      if (trimItems.length > 0) {
        setTrims(trimItems);
        setLoading(false);
        setStep('trim');
        return;
      }
    } catch { /* not in EPA — continue */ }

    // Stage 3: NRCan (Canadian dataset — European petrol + all Asian/US)
    const nrcanL100km = await getNRCanL100km(make, model, year);
    if (nrcanL100km) {
      setFuelL100km(String(nrcanL100km));
      setFuelSource('nrcan');
      setLoading(false);
      setStep('details');
      return;
    }

    // Stage 3.5: Gemini AI (global knowledge — covers any model)
    const aiL100km = await getGeminiL100km(make, model, year, hFuelType);
    if (aiL100km) {
      setFuelL100km(String(aiL100km));
      setFuelSource('ai');
      setLoading(false);
      setStep('details');
      return;
    }

    // Stage 4: Smart default from fuel type
    const suggested = suggestL100kmByFuelType(hFuelType);
    if (suggested !== null) {
      setFuelL100km(String(suggested));
      setFuelSource('suggested');
    } else {
      setFuelSource('manual');  // electric — L/100km not applicable
    }
    setLoading(false);
    setStep('details');
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

    // EPA trim had no fuel data — run NRCan → Gemini → smart default
    const year = parseInt(yearText, 10);
    if (selectedMake && selectedModel && year) {
      const nrcanL100km = await getNRCanL100km(selectedMake, selectedModel, year);
      if (nrcanL100km) { setFuelL100km(String(nrcanL100km)); setFuelSource('nrcan'); setStep('details'); setLoading(false); return; }
      const aiL100km = await getGeminiL100km(selectedMake, selectedModel, year, fuelType);
      if (aiL100km) { setFuelL100km(String(aiL100km)); setFuelSource('ai'); setStep('details'); setLoading(false); return; }
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

              {/* Primary: look up by plate */}
              <Text style={s.sectionLabel}>ENTER LICENSE PLATE</Text>
              <Text style={s.sectionHint}>
                We'll look up your car's details automatically from the Israeli vehicle registry.
              </Text>

              <TextInput
                style={s.input}
                value={plateText}
                onChangeText={t => { setPlateText(t); setLookupError(null); }}
                placeholder="e.g. 12-345-67"
                placeholderTextColor={Dashboard.textSecondary}
                keyboardType="default"
                autoCapitalize="none"
                autoFocus
                returnKeyType="search"
                onSubmitEditing={handlePlateLookup}
              />

              {!!lookupError && (
                <Text style={s.lookupError}>{lookupError}</Text>
              )}

              <Pressable
                style={[s.primaryBtn, (loading || plateText.length < 5) && s.btnDisabled]}
                onPress={handlePlateLookup}
                disabled={loading || plateText.length < 5}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.primaryBtnText}>LOOK UP CAR →</Text>}
              </Pressable>

              {/* Divider */}
              <View style={s.divider}>
                <View style={s.dividerLine} />
                <Text style={s.dividerText}>or</Text>
                <View style={s.dividerLine} />
              </View>

              {/* Fallback: manual entry */}
              <Pressable style={s.secondaryBtn} onPress={() => setStep('year')}>
                <Text style={s.secondaryBtnText}>Enter details manually</Text>
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
                placeholderTextColor={Dashboard.textSecondary}
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
                  ? <ActivityIndicator color="#fff" />
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
                  placeholderTextColor={Dashboard.textSecondary}
                  clearButtonMode="while-editing"
                  autoCorrect={false}
                />
              )}
              {loading
                ? <ActivityIndicator color={Dashboard.accent} style={{ marginTop: 32 }} />
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
                  placeholderTextColor={Dashboard.textSecondary}
                  clearButtonMode="while-editing"
                  autoCorrect={false}
                />
              )}
              {loading
                ? <ActivityIndicator color={Dashboard.accent} style={{ marginTop: 32 }} />
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
                  placeholderTextColor={Dashboard.textSecondary}
                  clearButtonMode="while-editing"
                  autoCorrect={false}
                />
              )}
              {loading
                ? <ActivityIndicator color={Dashboard.accent} style={{ marginTop: 32 }} />
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
                  <Text style={s.vehicleSummaryLabel}>DETECTED VEHICLE</Text>
                  <Text style={s.vehicleSummaryName}>
                    {yearText} {selectedMake} {selectedModel}
                  </Text>
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
                  <Text style={[s.infoCardNote, { color: Severity.yellow }]}>
                    ⚡ No database entry found for this model. Pre-filled with a typical
                    figure for its fuel type — edit to match your actual consumption.
                  </Text>
                )}
                {(fuelSource === 'manual' || fuelSource === null) && (
                  <Text style={[s.infoCardNote, { color: Severity.yellow }]}>
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
                    placeholderTextColor={Dashboard.textSecondary}
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
                placeholderTextColor={Dashboard.textSecondary}
                autoCapitalize="characters"
              />

              <Pressable
                style={[s.primaryBtn, (saving || !plate.trim()) && s.btnDisabled]}
                onPress={handleSubmit}
                disabled={saving || !plate.trim()}
              >
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.primaryBtnText}>ADD TO MY GARAGE ✓</Text>}
              </Pressable>
            </View>
          )}

        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Dashboard.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Dashboard.cardBorder,
  },
  backBtn:      { width: 60 },
  backText:     { fontSize: 14, color: Dashboard.accent, fontWeight: '600' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle:  { fontSize: 13, fontWeight: '800', color: Dashboard.textPrimary, letterSpacing: 1.5 },
  headerCrumb:  { fontSize: 11, color: Dashboard.textSecondary, marginTop: 2 },
  closeBtn:     { width: 60, alignItems: 'flex-end' },
  closeText:    { fontSize: 18, color: Dashboard.textSecondary },

  body:        { flex: 1 },
  bodyContent: { padding: 24, paddingBottom: 48, gap: 0 },

  errorBox: {
    color: Severity.red,
    fontSize: 13,
    marginBottom: 16,
    padding: 12,
    backgroundColor: Severity.red + '11',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Severity.red + '44',
  },
  lookupError: {
    color: Severity.yellow,
    fontSize: 13,
    lineHeight: 18,
  },

  section:      { gap: 12 },
  sectionLabel: { fontSize: 11, color: Dashboard.textSecondary, letterSpacing: 1.5, marginBottom: 2 },
  sectionHint:  { fontSize: 12, color: Dashboard.textSecondary, lineHeight: 17, marginTop: -6 },

  input: {
    backgroundColor: Dashboard.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Dashboard.cardBorder,
    padding: 14,
    fontSize: 16,
    color: Dashboard.textPrimary,
  },

  primaryBtn: {
    backgroundColor: Dashboard.accent,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  btnDisabled:    { opacity: 0.4 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15, letterSpacing: 1 },

  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 4,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: Dashboard.cardBorder },
  dividerText: { fontSize: 12, color: Dashboard.textSecondary },

  secondaryBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Dashboard.cardBorder,
    paddingVertical: 13,
    alignItems: 'center',
  },
  secondaryBtnText: { fontSize: 14, color: Dashboard.textSecondary, fontWeight: '500' },

  searchInput: {
    backgroundColor: Dashboard.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Dashboard.accent + '55',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: Dashboard.textPrimary,
  },

  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Dashboard.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Dashboard.cardBorder,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  listText:  { flex: 1, fontSize: 15, color: Dashboard.textPrimary },
  listArrow: { fontSize: 20, color: Dashboard.textSecondary, marginLeft: 8 },

  vehicleSummaryCard: {
    backgroundColor: Dashboard.accent + '15',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Dashboard.accent + '44',
    padding: 14,
  },
  vehicleSummaryLabel: {
    fontSize: 10,
    color: Dashboard.accent,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  vehicleSummaryName: {
    fontSize: 18,
    fontWeight: '700',
    color: Dashboard.textPrimary,
  },

  infoCard: {
    backgroundColor: Dashboard.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Dashboard.cardBorder,
    padding: 16,
    gap: 8,
  },
  infoCardSuccess: {
    borderColor: Severity.green + '66',
    backgroundColor: Severity.green + '0A',
  },
  infoCardWarning: {
    borderColor: Severity.yellow + '66',
    backgroundColor: Severity.yellow + '0A',
  },
  infoCardLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Dashboard.textSecondary,
    letterSpacing: 1.2,
  },
  infoCardNote: {
    fontSize: 12,
    color: Dashboard.textSecondary,
    lineHeight: 18,
  },
  fuelRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fuelInput: { flex: 1 },
  fuelUnit:  { fontSize: 14, color: Dashboard.textSecondary, fontWeight: '600' },

  fieldLabel: {
    fontSize: 11,
    color: Dashboard.textSecondary,
    letterSpacing: 1.5,
    marginTop: 4,
  },
});
