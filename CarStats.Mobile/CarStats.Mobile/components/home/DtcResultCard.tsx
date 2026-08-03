/**
 * One fault code from a completed scan: plain-language title, description and
 * the estimated repair cost, tinted by severity.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ReportDtcResponse } from '@/services/api';
import { createThemedStyles, useTheme } from '@/context/ThemeContext';
import { resultSeverity, severityMeta } from '@/utils/severity';
import { useRouter } from 'expo-router';

export default function DtcResultCard({ result }: { result: ReportDtcResponse }) {
  const { colors: c } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const t      = result.translation;
  const meta   = severityMeta(c, resultSeverity(result));
  const code   = t?.errorCode;

  return (
    <Pressable
      style={[styles.resultCard, { borderColor: meta.color }]}
      onPress={code ? () => router.push({ pathname: '/fault/[code]', params: { code } }) : undefined}
      // An untranslated code has no detail page to open, so it stays inert
      // rather than navigating to an empty screen.
      disabled={!code}
    >
      <View style={styles.resultHeader}>
        <Text style={[styles.resultBadge, { color: meta.color }]}>{meta.label}</Text>
        {t && <Text style={styles.resultCode}>{t.errorCode}</Text>}
      </View>
      <Text style={styles.resultTitle}>{t?.humanTitle ?? 'Unknown code detected'}</Text>
      <Text style={styles.resultBody}>
        {t?.description ?? result.message ?? 'Please contact support or check your manual.'}
      </Text>
      {t && (
        <View style={[styles.costPill, { borderColor: meta.color }]}>
          <Text style={styles.costLabel}>EST. REPAIR COST</Text>
          <Text style={[styles.costValue, { color: meta.color }]}>
            ₪{t.estimatedCostMin} – ₪{t.estimatedCostMax}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const useStyles = createThemedStyles((c) => StyleSheet.create({
  resultCard:            {
    backgroundColor: c.Dashboard.card,
    borderRadius: 12,
    borderWidth: 1,
    padding: 20,
    marginBottom: 12,
    gap: 10,
  },
  resultHeader:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resultBadge:           { fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  resultCode:            { fontSize: 13, fontWeight: '700', color: c.Dashboard.textSecondary, letterSpacing: 1 },
  resultTitle:           { fontSize: 20, fontWeight: '700', color: c.Dashboard.textPrimary },
  resultBody:            { fontSize: 14, color: c.Dashboard.textSecondary, lineHeight: 20 },
  costPill:              {
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  costLabel:             { fontSize: 10, color: c.Dashboard.textSecondary, letterSpacing: 1.5, marginBottom: 4 },
  costValue:             { fontSize: 22, fontWeight: '700' },
}));
