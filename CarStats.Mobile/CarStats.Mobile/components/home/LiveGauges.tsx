/**
 * שעוני המנוע החיים: סל"ד, מהירות, טמפרטורה ודלק, מתרעננים פעם בשנייה.
 * אריח הדלק משמש גם ככניסה להגדרת מפלס ידני ברכבים שלא מדווחים אותו.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LiveData } from '@/services/scanner';
import { createThemedStyles, useTheme } from '@/context/ThemeContext';

export default function LiveGauges({
  data,
  estimatedFuel,
  onSetFuel,
}: {
  data: LiveData;
  estimatedFuel: number | null;
  onSetFuel: () => void;
}) {
  const { colors: c } = useTheme();
  const gaugeStyles = useGaugeStyles();
  const rpmPct  = Math.min(data.rpm / 7000, 1);

  // איזה ערך דלק להציג
  const fuelValue    = data.fuelPercent ?? estimatedFuel;
  const fuelIsReal   = data.fuelPercent != null;
  const fuelIsEst    = data.fuelPercent == null && estimatedFuel != null;

  return (
    <View style={gaugeStyles.card}>
      <Text style={gaugeStyles.cardTitle}>LIVE ENGINE DATA</Text>
      <View style={gaugeStyles.grid}>
        <GaugeTile
          label="RPM"
          value={data.rpm.toLocaleString()}
          subValue={`${data.engineLoadPct}% load`}
          barPct={rpmPct}
          barColor={rpmPct > 0.8 ? c.Severity.red : rpmPct > 0.6 ? c.Severity.yellow : c.Severity.green}
        />
        <GaugeTile
          label="SPEED"
          value={`${data.speedKmh}`}
          subValue="km/h"
          barPct={Math.min(data.speedKmh / 200, 1)}
          barColor={c.Dashboard.accent}
        />
        <GaugeTile
          label="COOLANT"
          value={`${data.coolantCelsius}°`}
          subValue="Celsius"
          barPct={Math.min((data.coolantCelsius + 40) / 160, 1)}
          barColor={data.coolantCelsius > 110 ? c.Severity.red : data.coolantCelsius > 95 ? c.Severity.yellow : c.Severity.green}
        />
        {/* ── אריח הדלק: לחיצה מגדירה מפלס כשהרכב לא מדווח ── */}
        <Pressable
          style={[gaugeStyles.tile, !fuelIsReal && gaugeStyles.tileTappable]}
          onPress={!fuelIsReal ? onSetFuel : undefined}
        >
          <View style={gaugeStyles.tileLabelRow}>
            <Text style={gaugeStyles.tileLabel}>FUEL</Text>
            {!fuelIsReal && (
              <Text style={gaugeStyles.tileSetBtn}>{fuelIsEst ? 'UPDATE' : 'SET'}</Text>
            )}
          </View>
          <Text style={gaugeStyles.tileValue}>
            {fuelValue != null ? `${fuelValue}%` : '—'}
          </Text>
          <Text style={gaugeStyles.tileSub}>
            {fuelIsReal ? 'in tank' : fuelIsEst ? 'estimated' : 'tap to set'}
          </Text>
          {/* הערה שמוצגת כשהרכב לא מדווח מפלס דלק */}
          {!fuelIsReal && (
            <Text style={gaugeStyles.tileNote}>
              {fuelIsEst
                ? '⚠ OBD fuel not supported — using estimate'
                : '⚠ Car does not report fuel level via OBD-II (PID 0x2F unsupported)'}
            </Text>
          )}
          <View style={gaugeStyles.barTrack}>
            <View style={[
              gaugeStyles.barFill,
              {
                width: `${Math.round((fuelValue ?? 0) / 100 * 100)}%`,
                backgroundColor: fuelValue == null  ? c.Dashboard.cardBorder
                  : fuelValue < 15 ? c.Severity.red
                  : fuelValue < 30 ? c.Severity.yellow
                  : fuelIsEst      ? c.Dashboard.accent + 'AA'  // עמום כשמדובר בהערכה
                  : c.Severity.green,
              },
            ]} />
          </View>
        </Pressable>
      </View>
    </View>
  );
}

function GaugeTile({
  label,
  value,
  subValue,
  barPct,
  barColor,
}: {
  label: string;
  value: string;
  subValue: string;
  barPct: number;
  barColor: string;
}) {
  const gaugeStyles = useGaugeStyles();
  return (
    <View style={gaugeStyles.tile}>
      <Text style={gaugeStyles.tileLabel}>{label}</Text>
      <Text style={gaugeStyles.tileValue}>{value}</Text>
      <Text style={gaugeStyles.tileSub}>{subValue}</Text>
      <View style={gaugeStyles.barTrack}>
        <View style={[gaugeStyles.barFill, { width: `${Math.round(barPct * 100)}%`, backgroundColor: barColor }]} />
      </View>
    </View>
  );
}

const useGaugeStyles = createThemedStyles((c) => StyleSheet.create({
  card: {
    backgroundColor: c.Dashboard.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.Dashboard.cardBorder,
    padding: 16,
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 11,
    color: c.Dashboard.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 14,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  tile: {
    width: '47%',
    backgroundColor: c.Dashboard.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.Dashboard.cardBorder,
    padding: 12,
  },
  tileTappable: {
    borderColor: c.Dashboard.accent + '66',
    borderStyle: 'dashed',
  },
  tileLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  tileLabel: {
    fontSize: 10,
    color: c.Dashboard.textSecondary,
    letterSpacing: 1.5,
  },
  tileSetBtn: {
    fontSize: 9,
    color: c.Dashboard.accent,
    fontWeight: '700',
    letterSpacing: 1,
  },
  tileValue: {
    fontSize: 26,
    fontWeight: '700',
    color: c.Dashboard.textPrimary,
  },
  tileSub: {
    fontSize: 11,
    color: c.Dashboard.textSecondary,
    marginBottom: 6,
  },
  tileNote: {
    fontSize: 9,
    color: c.Severity.yellow,
    lineHeight: 13,
    marginBottom: 6,
  },
  barTrack: {
    height: 4,
    backgroundColor: c.Dashboard.cardBorder,
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: 4,
    borderRadius: 2,
  },
}));
