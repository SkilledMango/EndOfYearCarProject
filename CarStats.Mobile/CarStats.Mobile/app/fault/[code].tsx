/**
 * Fault code detail.
 *
 * Reached by tapping a fault anywhere it appears — a fresh scan result or a
 * row in the history. Shows the plain-language explanation, what to do about
 * it, and the repair estimate, which is the whole point of the app: an OBD
 * code on its own tells a driver nothing.
 *
 * Takes only the code in the route. The dictionary is small, so it is fetched
 * and filtered here rather than passed through navigation params — that keeps
 * the screen deep-linkable and means history rows (whose payload omits the
 * action text) show the same detail as a fresh scan.
 */

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Divider } from 'react-native-paper';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { DiagnosticCode, getDiagnosticCodes } from '@/services/api';
import { AiFailureReason, AiFaultExplanation, explainFaultWithAi } from '@/services/dtcLookup';
import { createThemedStyles, useTheme } from '@/context/ThemeContext';
import { severityMeta } from '@/utils/severity';

export default function FaultDetailScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { colors: c } = useTheme();
  const s = useStyles();
  const router = useRouter();

  const [dtc, setDtc]         = useState<DiagnosticCode | null>(null);
  const [ai, setAi]           = useState<AiFaultExplanation | null>(null);
  // Why the AI had nothing, so the screen can say something true rather than
  // implying the code simply is not covered.
  const [aiFailure, setAiFailure] = useState<AiFailureReason | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed]   = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all   = await getDiagnosticCodes();
        const match = all.find(d => d.errorCode.toUpperCase() === (code ?? '').toUpperCase());
        if (cancelled) return;

        if (match) {
          setDtc(match);
        } else {
          // Not in the dictionary — manufacturer-specific codes run into the
          // thousands, so ask the model rather than showing a bare code.
          const explained = await explainFaultWithAi(code ?? '');
          if (!cancelled) {
            if (explained.ok) setAi(explained.explanation);
            else setAiFailure(explained.reason);
          }
        }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [code]);

  if (loading) {
    return (
      <View style={[s.screen, s.centered]}>
        <ActivityIndicator size="large" color={c.Dashboard.accent} />
      </View>
    );
  }

  // Whichever source produced the explanation also sets the badge, so the
  // header never contradicts the text underneath it.
  const meta = severityMeta(c, dtc?.severity ?? ai?.severity);

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <Stack.Screen options={{ title: code ?? 'Fault code' }} />

      {/* Header: the raw code plus its severity, so the seriousness is the
          first thing read rather than something inferred from the text. */}
      <View style={[s.hero, { borderColor: meta.color }]}>
        <Text style={s.code}>{code}</Text>
        <Text style={[s.badge, { color: meta.color }]}>{meta.label}</Text>
      </View>

      {failed ? (
        <Card mode="elevated" style={s.card}>
          <Card.Content>
            <Text style={s.title}>Could not load this code</Text>
            <Text style={s.body}>
              Check your connection and try again. The code itself is {code}.
            </Text>
          </Card.Content>
        </Card>
      ) : !dtc && ai ? (
        <>
          {/* Labelled before the content, not after: the reader should know
              what they are looking at before they read it. */}
          <View style={s.aiNotice}>
            <Text style={s.aiNoticeText}>
              ✨ Not in our dictionary — explained by AI. Treat it as a starting
              point and confirm with a mechanic.
            </Text>
          </View>

          <Card mode="elevated" style={s.card}>
            <Card.Content>
              <Text style={s.title}>{ai.humanTitle}</Text>
              <Text style={s.body}>{ai.description}</Text>
            </Card.Content>
          </Card>

          {!!ai.actionRequired && (
            <Card mode="elevated" style={s.card}>
              <Card.Content>
                <Text style={s.sectionLabel}>WHAT TO DO</Text>
                <Text style={s.body}>{ai.actionRequired}</Text>
              </Card.Content>
            </Card>
          )}

          {/* Deliberately no cost estimate: a made-up price is worse than none. */}
          <Card mode="elevated" style={s.card}>
            <Card.Content>
              <Text style={s.sectionLabel}>ESTIMATED REPAIR COST</Text>
              <Text style={s.body}>
                No estimate for this code yet. A mechanic can price it once they
                have read the fault on your car.
              </Text>
            </Card.Content>
          </Card>

          <Button
            mode="contained"
            icon="wrench"
            onPress={() => router.push('/navigate')}
            style={s.action}
            contentStyle={s.actionContent}
          >
            Find a mechanic
          </Button>
        </>
      ) : !dtc ? (
        <Card mode="elevated" style={s.card}>
          <Card.Content>
            <Text style={s.title}>
              {aiFailure === 'rate-limited'
                ? 'Explanation unavailable right now'
                : 'Not in our dictionary yet'}
            </Text>
            <Text style={s.body}>
              {aiFailure === 'rate-limited'
                ? `${code} is not one of the codes we cover, and today's limit for AI explanations has been reached. It resets tomorrow — until then, a mechanic can tell you what this code means for your car.`
                : `${code} is a valid OBD-II code but we do not have a plain-language explanation for it. Treat it as worth checking, and ask a mechanic what it means for your car.`}
            </Text>
          </Card.Content>
        </Card>
      ) : (
        <>
          <Card mode="elevated" style={s.card}>
            <Card.Content>
              <Text style={s.title}>{dtc.humanTitle}</Text>
              <Text style={s.body}>{dtc.description}</Text>
            </Card.Content>
          </Card>

          {!!dtc.actionRequired && (
            <Card mode="elevated" style={s.card}>
              <Card.Content>
                <Text style={s.sectionLabel}>WHAT TO DO</Text>
                <Text style={s.body}>{dtc.actionRequired}</Text>
              </Card.Content>
            </Card>
          )}

          <Card mode="elevated" style={s.card}>
            <Card.Content>
              <Text style={s.sectionLabel}>ESTIMATED REPAIR COST</Text>
              <Text style={[s.cost, { color: meta.color }]}>
                ₪{dtc.estimatedCostMin} – ₪{dtc.estimatedCostMax}
              </Text>
              <Divider style={s.divider} />
              <Text style={s.note}>
                A typical range for this repair in Israel. The actual price
                depends on your car and the garage.
              </Text>
            </Card.Content>
          </Card>

          <Button
            mode="contained"
            icon="wrench"
            onPress={() => router.push('/navigate')}
            style={s.action}
            contentStyle={s.actionContent}
          >
            Find a mechanic
          </Button>
        </>
      )}
    </ScrollView>
  );
}

const useStyles = createThemedStyles((c) => StyleSheet.create({
  screen:   { flex: 1, backgroundColor: c.Dashboard.bg },
  centered: { justifyContent: 'center', alignItems: 'center' },
  content:  { padding: 20, paddingBottom: 40 },

  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: c.Dashboard.card,
    borderWidth: 2,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 16,
  },
  code:  { fontSize: 26, fontWeight: '800', color: c.Dashboard.textPrimary, letterSpacing: 1 },
  badge: { fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },

  card:  { borderRadius: 14, marginBottom: 12 },

  aiNotice: {
    backgroundColor: c.Dashboard.accentSoft,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  aiNoticeText: { fontSize: 13, color: c.Dashboard.accentDeep, lineHeight: 19 },
  title: { fontSize: 18, fontWeight: '700', color: c.Dashboard.textPrimary, marginBottom: 8 },
  body:  { fontSize: 15, color: c.Dashboard.textSecondary, lineHeight: 22 },

  sectionLabel: {
    fontSize: 11,
    color: c.Dashboard.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  cost:    { fontSize: 26, fontWeight: '800' },
  divider: { marginVertical: 12 },
  note:    { fontSize: 12, color: c.Dashboard.textSecondary, lineHeight: 17 },

  action:        { marginTop: 8 },
  actionContent: { paddingVertical: 8 },
}));
