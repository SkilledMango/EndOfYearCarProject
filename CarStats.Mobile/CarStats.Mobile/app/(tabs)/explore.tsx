import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  VehicleEventEnriched,
  getUserEvents,
} from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { createThemedStyles, useTheme } from '@/context/ThemeContext';
import { severityMeta } from '@/utils/severity';

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });

export default function HistoryScreen() {
  const { user: authUser }      = useAuth();
  const { colors: c } = useTheme();
  const styles = useStyles();
  const [events, setEvents]     = useState<VehicleEventEnriched[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!authUser) return;
    if (isRefresh) setRefreshing(true);
    try {
      const data = await getUserEvents(authUser.id);
      setEvents(data);
    } catch {
      // API unreachable — show empty state
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // Keyed on the id so a different account signing in reloads the history,
    // without refetching every time refreshUser() returns a new user object.
  }, [authUser?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={c.Dashboard.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => load(true)}
          tintColor={c.Dashboard.accent}
        />
      }
    >
      <Text style={styles.screenTitle}>FAULT HISTORY</Text>

      {events.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>✓</Text>
          <Text style={styles.emptyText}>No faults recorded yet.</Text>
          <Text style={styles.emptySubtext}>
            Scan a code from the Dashboard to log your first event.
          </Text>
        </View>
      ) : (
        events.map(ev => {
          const sev = severityMeta(c, ev.translation?.severity);
          return (
            <View key={ev.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.rawCode}>{ev.rawErrorCode}</Text>
                <View style={[styles.badge, { borderColor: sev.color }]}>
                  <Text style={[styles.badgeText, { color: sev.color }]}>{sev.label}</Text>
                </View>
              </View>

              <Text style={styles.humanTitle}>
                {ev.translation?.humanTitle ?? 'Unknown fault code'}
              </Text>

              {ev.translation?.description ? (
                <Text style={styles.description} numberOfLines={2}>
                  {ev.translation.description}
                </Text>
              ) : null}

              <View style={styles.cardFooter}>
                <Text style={styles.timestamp}>{formatDate(ev.timestamp)}</Text>
                {ev.translation && (
                  <Text style={[styles.costRange, { color: sev.color }]}>
                    ₪{ev.translation.estimatedCostMin} – ₪{ev.translation.estimatedCostMax}
                  </Text>
                )}
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const useStyles = createThemedStyles((c) => StyleSheet.create({
  container:    { flex: 1, backgroundColor: c.Dashboard.bg },
  centered:     { justifyContent: 'center', alignItems: 'center' },
  content:      { padding: 24, paddingTop: 64, paddingBottom: 40 },

  screenTitle:  { fontSize: 11, color: c.Dashboard.textSecondary, letterSpacing: 1.5, marginBottom: 20 },

  emptyState:   { alignItems: 'center', paddingTop: 80 },
  emptyIcon:    { fontSize: 48, color: c.Severity.green },
  emptyText:    { fontSize: 17, fontWeight: '600', color: c.Dashboard.textPrimary, marginTop: 12 },
  emptySubtext: { fontSize: 13, color: c.Dashboard.textSecondary, marginTop: 6, textAlign: 'center' },

  card:         {
    backgroundColor: c.Dashboard.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.Dashboard.cardBorder,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  rawCode:      { fontSize: 13, fontWeight: '700', color: c.Dashboard.textSecondary, letterSpacing: 1 },
  badge:        { borderWidth: 1, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText:    { fontSize: 10, fontWeight: '700', letterSpacing: 1 },

  humanTitle:   { fontSize: 16, fontWeight: '600', color: c.Dashboard.textPrimary, marginBottom: 6 },
  description:  { fontSize: 13, color: c.Dashboard.textSecondary, lineHeight: 18, marginBottom: 12 },

  cardFooter:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  timestamp:    { fontSize: 12, color: c.Dashboard.textSecondary },
  costRange:    { fontSize: 13, fontWeight: '600' },
}));
