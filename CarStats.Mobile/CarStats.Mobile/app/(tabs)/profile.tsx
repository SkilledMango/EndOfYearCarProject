/**
 * Profile / settings tab.
 * Shows the logged-in user's identity, account stats, their garage,
 * and account actions (refresh, logout).
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { createThemedStyles, useTheme } from '@/context/ThemeContext';
import { UserRole } from '@/services/api';

export default function ProfileScreen() {
  const { user, logout, refreshUser } = useAuth();
  const { colors: c } = useTheme();
  const s = useStyles();
  const router = useRouter();
  const [refreshing, setRefreshing]   = useState(false);
  const [loggingOut, setLoggingOut]   = useState(false);

  if (!user) return null; // _layout redirects to /login when logged out

  const initials = user.fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]!.toUpperCase())
    .join('');

  const roleLabel =
    user.role === UserRole.SuperAdmin ? 'SUPER ADMIN'
    : user.role === UserRole.Admin    ? 'ADMIN'
    : user.isPremiumMember            ? 'PREMIUM'
    : 'FREE ACCOUNT';

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshUser();
    setRefreshing(false);
  };

  const confirmLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          setLoggingOut(true);
          await logout(); // _layout auto-redirects to /login
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.Dashboard.accent} />
      }
    >
      <Text style={s.pageTitle}>PROFILE</Text>

      {/* Identity card */}
      <View style={s.card}>
        <View style={s.identityRow}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initials || '?'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.name}>{user.fullName}</Text>
            <Text style={s.email}>{user.email}</Text>
          </View>
        </View>
        <View style={[s.roleChip, user.isPremiumMember && s.roleChipPremium]}>
          <Text style={[s.roleChipText, user.isPremiumMember && s.roleChipTextPremium]}>
            {roleLabel}
          </Text>
        </View>
      </View>

      {/* Stats */}
      <View style={s.statsRow}>
        <View style={s.statCard}>
          <Text style={s.statValue}>{user.vehicles?.length ?? 0}</Text>
          <Text style={s.statLabel}>VEHICLES</Text>
        </View>
        <View style={s.statCard}>
          <Text style={s.statValue}>{user.totalFaultsLogged}</Text>
          <Text style={s.statLabel}>FAULTS LOGGED</Text>
        </View>
      </View>

      {/* Garage */}
      <Text style={s.sectionLabel}>MY GARAGE</Text>
      {(user.vehicles ?? []).length === 0 ? (
        <View style={s.card}>
          <Text style={s.emptyText}>No cars yet — add one from the Dashboard tab.</Text>
        </View>
      ) : (
        (user.vehicles ?? []).map(v => (
          <View key={v.id} style={s.vehicleRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.vehicleName}>{v.year} {v.make} {v.model}</Text>
              <Text style={s.vehiclePlate}>{v.licensePlate}</Text>
            </View>
            <Text style={s.vehicleFuel}>
              {v.averageFuelConsumption > 0 ? `${v.averageFuelConsumption} L/100km` : '—'}
            </Text>
          </View>
        ))
      )}

      {/* Account actions */}
      <Text style={s.sectionLabel}>ACCOUNT</Text>
      <Pressable style={s.settingsRow} onPress={() => router.push('/settings')}>
        <Text style={s.settingsIcon}>⚙️</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.settingsTitle}>Settings</Text>
          <Text style={s.settingsSub}>Dark mode, notifications, child safety reminder</Text>
        </View>
        <Text style={s.settingsChevron}>›</Text>
      </Pressable>
      <Pressable style={s.logoutBtn} onPress={confirmLogout} disabled={loggingOut}>
        {loggingOut
          ? <ActivityIndicator color={c.Severity.red} />
          : <Text style={s.logoutText}>LOG OUT</Text>}
      </Pressable>

      <Text style={s.version}>CarStats · end-of-year project</Text>
    </ScrollView>
  );
}

const useStyles = createThemedStyles((c) => StyleSheet.create({
  screen:  { flex: 1, backgroundColor: c.Dashboard.bg },
  content: { padding: 20, paddingTop: 64, paddingBottom: 48, gap: 12 },

  pageTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: c.Dashboard.textPrimary,
    letterSpacing: 1.5,
    marginBottom: 4,
  },

  card: {
    backgroundColor: c.Dashboard.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.Dashboard.cardBorder,
    padding: 18,
    gap: 12,
  },

  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: c.Dashboard.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '800', color: c.Dashboard.onAccent },
  name:  { fontSize: 18, fontWeight: '700', color: c.Dashboard.textPrimary },
  email: { fontSize: 13, color: c.Dashboard.textSecondary, marginTop: 2 },

  roleChip: {
    alignSelf: 'flex-start',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: c.Dashboard.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  roleChipPremium:     { borderColor: c.Severity.yellow + '88', backgroundColor: c.Severity.yellow + '14' },
  roleChipText:        { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, color: c.Dashboard.textSecondary },
  roleChipTextPremium: { color: c.Severity.yellow },

  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: {
    flex: 1,
    backgroundColor: c.Dashboard.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.Dashboard.cardBorder,
    paddingVertical: 16,
    alignItems: 'center',
  },
  statValue: { fontSize: 24, fontWeight: '800', color: c.Dashboard.textPrimary },
  statLabel: { fontSize: 10, color: c.Dashboard.textSecondary, letterSpacing: 1.2, marginTop: 4 },

  sectionLabel: {
    fontSize: 11,
    color: c.Dashboard.textSecondary,
    letterSpacing: 1.5,
    marginTop: 10,
  },

  emptyText: { fontSize: 13, color: c.Dashboard.textSecondary, lineHeight: 18 },

  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.Dashboard.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.Dashboard.cardBorder,
    padding: 14,
  },
  vehicleName:  { fontSize: 15, fontWeight: '600', color: c.Dashboard.textPrimary },
  vehiclePlate: { fontSize: 12, color: c.Dashboard.textSecondary, marginTop: 2 },
  vehicleFuel:  { fontSize: 12, color: c.Dashboard.textSecondary, fontWeight: '600' },

  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: c.Dashboard.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.Dashboard.cardBorder,
    padding: 14,
  },
  settingsIcon:    { fontSize: 20 },
  settingsTitle:   { fontSize: 15, fontWeight: '600', color: c.Dashboard.textPrimary },
  settingsSub:     { fontSize: 12, color: c.Dashboard.textSecondary, marginTop: 2 },
  settingsChevron: { fontSize: 24, color: c.Dashboard.textSecondary, marginTop: -2 },

  logoutBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.Severity.red + '66',
    backgroundColor: c.Severity.red + '10',
    paddingVertical: 14,
    alignItems: 'center',
  },
  logoutText: { color: c.Severity.red, fontWeight: '700', fontSize: 14, letterSpacing: 1.5 },

  version: { fontSize: 11, color: c.Dashboard.textSecondary, textAlign: 'center', marginTop: 16 },
}));
