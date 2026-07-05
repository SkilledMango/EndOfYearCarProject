/**
 * ScanOverlay — full-screen OBD-II scanning experience.
 * Layout and values follow design/stitch_carstats_diagnostic_suite/live_scan:
 * progress ring (r=44, stroke 8, dasharray 276) over decorative rings, a
 * 2-column live-data tile grid, and the "Found Faults" card with an
 * accent-bar + severity chip.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { ReportDtcResponse, SeverityLevel } from '@/services/api';
import { LiveData } from '@/services/scanner';
import { createThemedStyles, useTheme } from '@/context/ThemeContext';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { resultSeverity, worstSeverity } from '@/utils/severity';

const RING_R = 44;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R; // ≈276, matches the design's dasharray

interface Props {
  visible: boolean;
  scanning: boolean;
  vehicleName: string;
  results: ReportDtcResponse[];
  /** Set when the scan ended without fault codes or failed outright */
  finishedMessage: string | null;
  liveData: LiveData | null;
  estimatedFuelPct: number | null;
  onClose: () => void;
}

export default function ScanOverlay({
  visible,
  scanning,
  vehicleName,
  results,
  finishedMessage,
  liveData,
  estimatedFuelPct,
  onClose,
}: Props) {
  const { colors: c } = useTheme();
  const styles = useStyles();
  // Simulated progress while the hardware scan runs (the design's own script
  // does the same) — creeps to 90%, then snaps to 100% when results land.
  const [progress, setProgress] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (visible && scanning) {
      setProgress(0);
      timer.current = setInterval(() => {
        setProgress(p => Math.min(90, p + 2 + Math.random() * 5));
      }, 120);
    } else if (visible && !scanning) {
      setProgress(100);
    }
    return () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };
  }, [visible, scanning]);

  const done   = !scanning;
  const urgent = worstSeverity(results) === SeverityLevel.Red;

  const dashOffset = RING_CIRCUMFERENCE * (1 - progress / 100);

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          {/* ── Header ── */}
          <Text style={styles.title} numberOfLines={1}>
            {scanning ? `Scanning ${vehicleName}...` : `Scan Complete`}
          </Text>
          <View style={styles.statusPill}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>OBD-II Connected</Text>
          </View>

          {/* ── Progress ring ── */}
          <View style={styles.ringWrap}>
            <View style={styles.ringOuterDecor} />
            <View style={styles.ringMidDecor} />
            <View style={styles.ringInnerDecor} />
            <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100">
              <Circle
                cx={50} cy={50} r={RING_R}
                fill="none"
                stroke={c.Scan.ringTrack}
                strokeWidth={8}
              />
              <Circle
                cx={50} cy={50} r={RING_R}
                fill="none"
                stroke={c.Dashboard.accentDeep}
                strokeWidth={8}
                strokeLinecap="round"
                strokeDasharray={`${RING_CIRCUMFERENCE}`}
                strokeDashoffset={dashOffset}
                transform="rotate(-90 50 50)"
              />
            </Svg>
            <View style={styles.ringCenter}>
              <IconSymbol name="qrcode.viewfinder" size={36} color={c.Dashboard.accentDeep} />
              <Text style={styles.ringPct}>{Math.round(progress)}%</Text>
            </View>
          </View>

          {/* ── Live data tiles ── */}
          <View style={styles.tileGrid}>
            <Tile icon="gauge" label="RPM"
              value={liveData ? String(liveData.rpm) : '—'} unit="rev/min" />
            <Tile icon="car.fill" label="SPEED"
              value={liveData ? String(liveData.speedKmh) : '—'} unit="km/h" />
            <Tile icon="thermometer" label="COOLANT"
              value={liveData ? `${liveData.coolantCelsius}°C` : '—'} />
            <Tile icon="fuelpump.fill" label="FUEL"
              value={estimatedFuelPct != null ? `${Math.round(estimatedFuelPct)}%` : '—'} />
          </View>

          {/* ── Found faults ── */}
          {done && results.length > 0 && (
            <View style={styles.faultsCard}>
              <View style={[
                styles.faultsAccentBar,
                { backgroundColor: urgent ? c.Severity.red : c.Severity.yellow },
              ]} />
              <View style={styles.faultsBody}>
                <View style={styles.faultsHeader}>
                  <Text style={styles.faultsTitle}>Found Faults</Text>
                  <View style={[
                    styles.faultsChip,
                    { backgroundColor: urgent ? c.Severity.red : c.Severity.yellow },
                  ]}>
                    <IconSymbol name="exclamationmark.triangle.fill" size={14} color={c.Dashboard.card} />
                    <Text style={styles.faultsChipText}>{urgent ? 'URGENT' : 'CAUTION'}</Text>
                  </View>
                </View>
                {results.map((r, i) => <FaultRow key={i} result={r} />)}
              </View>
            </View>
          )}

          {/* ── Clean result / error ── */}
          {done && results.length === 0 && finishedMessage && (
            <View style={styles.faultsCard}>
              <View style={[styles.faultsAccentBar, { backgroundColor: c.Severity.green }]} />
              <View style={styles.faultsBody}>
                <Text style={styles.faultsTitle}>Scan Result</Text>
                <View style={[styles.faultRow, { backgroundColor: c.SeveritySoft.green }]}>
                  <Text style={[styles.faultRowDesc, { color: c.Scan.greenInk, flex: 1 }]}>
                    {finishedMessage}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* ── Done button ── */}
          {done && (
            <Pressable style={styles.doneBtn} onPress={onClose}>
              <Text style={styles.doneBtnText}>Done</Text>
            </Pressable>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function Tile({ icon, label, value, unit }: {
  icon: React.ComponentProps<typeof IconSymbol>['name'];
  label: string;
  value: string;
  unit?: string;
}) {
  const { colors: c } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.tile}>
      <View style={styles.tileHeader}>
        <IconSymbol name={icon} size={18} color={c.Dashboard.textSecondary} />
        <Text style={styles.tileLabel}>{label}</Text>
      </View>
      <View style={styles.tileValueRow}>
        <Text style={styles.tileValue}>{value}</Text>
        {unit && <Text style={styles.tileUnit}>{unit}</Text>}
      </View>
    </View>
  );
}

function FaultRow({ result }: { result: ReportDtcResponse }) {
  const { colors: c } = useTheme();
  const styles = useStyles();
  const red  = resultSeverity(result) === SeverityLevel.Red;
  const code = result.translation?.errorCode
    ?? result.message?.match(/Code (\w+)/)?.[1]
    ?? 'Unknown';
  const desc = result.translation?.humanTitle ?? result.message ?? 'No description available';
  const bg   = red ? c.SeveritySoft.red : c.SeveritySoft.yellow;
  const ink  = red ? c.Scan.errorDeep : c.Scan.amberInk;

  return (
    <View style={[styles.faultRow, { backgroundColor: bg }]}>
      <IconSymbol name="gearshape.2.fill" size={22} color={ink} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.faultRowCode, { color: ink }]}>{code}</Text>
        <Text style={[styles.faultRowDesc, { color: ink }]}>{desc}</Text>
      </View>
    </View>
  );
}

// ─── Styles (values from the live_scan Stitch export) ─────────────────────────

const useStyles = createThemedStyles((c) => StyleSheet.create({
  container:      { flex: 1, backgroundColor: c.Dashboard.bg },
  content:        { alignItems: 'center', paddingHorizontal: 20, paddingTop: 72, paddingBottom: 48 },

  title:          { fontSize: 24, lineHeight: 32, fontWeight: '700', color: c.Dashboard.textPrimary },
  statusPill:     {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: 999, marginTop: 8,
    backgroundColor: c.Fuel.chipBg,
    borderWidth: 1, borderColor: c.Dashboard.cardBorder,
  },
  statusDot:      { width: 10, height: 10, borderRadius: 5, backgroundColor: c.Severity.green },
  statusText:     { fontSize: 12, fontWeight: '600', letterSpacing: 0.6, color: c.Dashboard.textSecondary },

  // Ring
  ringWrap:       {
    width: 300, height: 300, maxWidth: '100%',
    marginTop: 32, marginBottom: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  ringOuterDecor: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 150, borderWidth: 16, borderColor: c.Scan.ringTrack, opacity: 0.2,
  },
  ringMidDecor:   {
    position: 'absolute', left: 16, right: 16, top: 16, bottom: 16,
    borderRadius: 150, borderWidth: 1, borderColor: c.Dashboard.cardBorder, opacity: 0.3,
  },
  ringInnerDecor: {
    position: 'absolute', left: 40, right: 40, top: 40, bottom: 40,
    borderRadius: 150, borderWidth: 1, borderColor: c.Scan.ringGlow, opacity: 0.4,
  },
  ringCenter:     {
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: c.Dashboard.card,
    borderWidth: 1, borderColor: c.Dashboard.cardBorder,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  ringPct:        { fontSize: 28, lineHeight: 34, fontWeight: '700', color: c.Dashboard.accentDeep, marginTop: 4 },

  // Tiles
  tileGrid:       { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 32 },
  tile:           {
    flexBasis: '45%', flexGrow: 1,
    backgroundColor: c.Dashboard.card,
    borderRadius: 12, borderWidth: 1, borderColor: c.Dashboard.cardBorder,
    padding: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  tileHeader:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  tileLabel:      { fontSize: 12, fontWeight: '600', letterSpacing: 0.6, color: c.Dashboard.textSecondary },
  tileValueRow:   { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  tileValue:      { fontSize: 24, lineHeight: 32, fontWeight: '700', color: c.Dashboard.textPrimary },
  tileUnit:       { fontSize: 12, fontWeight: '600', color: c.Fuel.axisLabel },

  // Faults card
  faultsCard:     {
    width: '100%',
    backgroundColor: c.Dashboard.card,
    borderRadius: 12, borderWidth: 1, borderColor: c.Dashboard.cardBorder,
    overflow: 'hidden',
    marginBottom: 24,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  faultsAccentBar:{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  faultsBody:     { padding: 16, paddingLeft: 20 },
  faultsHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  faultsTitle:    { fontSize: 20, lineHeight: 28, fontWeight: '600', color: c.Dashboard.textPrimary },
  faultsChip:     {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4,
  },
  faultsChipText: { fontSize: 12, fontWeight: '600', letterSpacing: 0.6, color: c.Dashboard.card },
  faultRow:       {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    borderRadius: 8, padding: 12, marginTop: 8,
  },
  faultRowCode:   { fontSize: 16, lineHeight: 24, fontWeight: '700' },
  faultRowDesc:   { fontSize: 14, lineHeight: 20 },

  // Done
  doneBtn:        {
    width: '100%',
    backgroundColor: c.Dashboard.accentDeep,
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  doneBtnText:    { color: c.Dashboard.onAccent, fontSize: 15, fontWeight: '700' },
}));
