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

export default function DtcResultCard({
  result,
  rawCode,
}: {
  result: ReportDtcResponse;
  /** The code that was scanned. Needed because an untranslated fault has no
      translation object to read it from — and those are precisely the ones
      whose detail screen has something to add, via the AI explanation. */
  rawCode?: string;
}) {
  const { colors: c } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const t      = result.translation;
  const meta   = severityMeta(c, resultSeverity(result));
  const code   = t?.errorCode ?? rawCode;

  return (
    <Pressable
      style={[styles.resultCard, { borderColor: meta.color }]}
      onPress={code ? () => router.push({ pathname: '/fault/[code]', params: { code } }) : undefined}
      // Only inert if we genuinely have no code to look up.
      disabled={!code}
    >
      <View style={styles.resultHeader}>
        <Text style={[styles.resultBadge, { color: meta.color }]}>{meta.label}</Text>
        {/* The code is worth showing whether or not we have an entry for it —
            it is what a mechanic will ask for. */}
        {!!code && <Text style={styles.resultCode}>{code}</Text>}
      </View>

      <Text style={styles.resultTitle}>
        {t?.humanTitle ?? 'Not in our dictionary'}
      </Text>

      <Text style={styles.resultBody}>
        {t?.description
          ?? (code
            ? 'This code is not one of the common ones we cover. Tap to see an AI explanation of what it means for your car.'
            : result.message
            ?? 'Please contact support or check your manual.')}
      </Text>

      {t ? (
        <View style={[styles.costPill, { borderColor: meta.color }]}>
          <Text style={styles.costLabel}>EST. REPAIR COST</Text>
          <Text style={[styles.costValue, { color: meta.color }]}>
            ₪{t.estimatedCostMin} – ₪{t.estimatedCostMax}
          </Text>
        </View>
      ) : code ? (
        // Says plainly that there is more behind the card. Without it the
        // card reads as a dead end, which is what it used to be.
        <View style={[styles.costPill, { borderColor: meta.color }]}>
          <Text style={[styles.costValue, styles.tapHint, { color: meta.color }]}>
            ✨ TAP FOR AI EXPLANATION
          </Text>
        </View>
      ) : null}
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
  // Same pill as the cost, but this is a label rather than a number.
  tapHint:               { fontSize: 13, fontWeight: '800', letterSpacing: 1 },
}));
