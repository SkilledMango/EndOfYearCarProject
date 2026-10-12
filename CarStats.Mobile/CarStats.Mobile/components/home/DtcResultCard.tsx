import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CarIdentity, ReportDtcResponse } from '@/services/api';
import { createThemedStyles, useTheme } from '@/context/ThemeContext';
import { resultSeverity, severityMeta } from '@/utils/severity';
import { faultParams } from '@/utils/faultRoute';
import { useRouter } from 'expo-router';

// איתור: כרטיס תוצאת תקלה
export default function DtcResultCard({
  result,
  rawCode,
  vehicle,
}: {
  result: ReportDtcResponse;
  rawCode?: string;
  vehicle?: CarIdentity | null;
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
      onPress={code ? () => router.push({ pathname: '/fault/[code]', params: faultParams(code, vehicle) }) : undefined}
      disabled={!code}
    >
      <View style={styles.resultHeader}>
        <Text style={[styles.resultBadge, { color: meta.color }]}>{meta.label}</Text>
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
  tapHint:               { fontSize: 13, fontWeight: '800', letterSpacing: 1 },
}));
