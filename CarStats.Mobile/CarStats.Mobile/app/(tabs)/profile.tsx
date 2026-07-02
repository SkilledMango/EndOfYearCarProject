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
import { useAuth } from '@/context/AuthContext';
import { UserRole } from '@/services/api';
import { Dashboard, Severity } from '@/constants/theme';

export default function ProfileScreen() {
  const { user, logout, refreshUser } = useAuth();
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
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Dashboard.accent} />
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
      <Pressable style={s.logoutBtn} onPress={confirmLogout} disabled={loggingOut}>
        {loggingOut
          ? <ActivityIndicator color={Severity.red} />
          : <Text style={s.logoutText}>LOG OUT</Text>}
      </Pressable>

      <Text style={s.version}>CarStats · end-of-year project</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: Dashboard.bg },
  content: { padding: 20, paddingTop: 64, paddingBottom: 48, gap: 12 },

  pageTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Dashboard.textPrimary,
    letterSpacing: 1.5,
    marginBottom: 4,
  },

  card: {
    backgroundColor: Dashboard.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Dashboard.cardBorder,
    padding: 18,
    gap: 12,
  },

  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Dashboard.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '800', color: '#fff' },
  name:  { fontSize: 18, fontWeight: '700', color: Dashboard.textPrimary },
  email: { fontSize: 13, color: Dashboard.textSecondary, marginTop: 2 },

  roleChip: {
    alignSelf: 'flex-start',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Dashboard.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  roleChipPremium:     { borderColor: Severity.yellow + '88', backgroundColor: Severity.yellow + '14' },
  roleChipText:        { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, color: Dashboard.textSecondary },
  roleChipTextPremium: { color: Severity.yellow },

  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: {
    flex: 1,
    backgroundColor: Dashboard.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Dashboard.cardBorder,
    paddingVertical: 16,
    alignItems: 'center',
  },
  statValue: { fontSize: 24, fontWeight: '800', color: Dashboard.textPrimary },
  statLabel: { fontSize: 10, color: Dashboard.textSecondary, letterSpacing: 1.2, marginTop: 4 },

  sectionLabel: {
    fontSize: 11,
    color: Dashboard.textSecondary,
    letterSpacing: 1.5,
    marginTop: 10,
  },

  emptyText: { fontSize: 13, color: Dashboard.textSecondary, lineHeight: 18 },

  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Dashboard.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Dashboard.cardBorder,
    padding: 14,
  },
  vehicleName:  { fontSize: 15, fontWeight: '600', color: Dashboard.textPrimary },
  vehiclePlate: { fontSize: 12, color: Dashboard.textSecondary, marginTop: 2 },
  vehicleFuel:  { fontSize: 12, color: Dashboard.textSecondary, fontWeight: '600' },

  logoutBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Severity.red + '66',
    backgroundColor: Severity.red + '10',
    paddingVertical: 14,
    alignItems: 'center',
  },
  logoutText: { color: Severity.red, fontWeight: '700', fontSize: 14, letterSpacing: 1.5 },

  version: { fontSize: 11, color: Dashboard.textSecondary, textAlign: 'center', marginTop: 16 },
});
