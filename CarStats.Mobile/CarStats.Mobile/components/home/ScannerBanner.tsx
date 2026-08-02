/**
 * Connection banner for the ESP32 OBD-II adapter, shown at the top of the
 * Garage screen. Also carries the RETRY control, which is the user's way back
 * after the adapter has been marked offline.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ScannerStatus } from '@/services/scanner';
import { createThemedStyles, useTheme } from '@/context/ThemeContext';

export default function ScannerBanner({
  online,
  status,
  onRetry,
}: {
  online: boolean;
  status: ScannerStatus | null;
  onRetry: () => void;
}) {
  const { colors: c } = useTheme();
  const bannerStyles = useBannerStyles();
  return (
    <View style={[bannerStyles.row, online ? bannerStyles.online : bannerStyles.offline]}>
      <View style={[bannerStyles.dot, { backgroundColor: online ? c.Severity.green : c.Severity.unknown }]} />
      <View style={{ flex: 1 }}>
        <Text style={bannerStyles.title}>
          {online ? 'OBD-II Adapter Connected' : 'Adapter Not Found'}
        </Text>
        {online && status ? (
          <Text style={bannerStyles.sub}>
            {status.simMode ? '⚠ Simulation mode — no car connected' : '✓ Reading live car data'}
            {'  ·  Uptime '}{Math.floor(status.uptimeSeconds / 60)}m
          </Text>
        ) : (
          <Text style={bannerStyles.sub}>Looking for carstats-scanner.local on your network…</Text>
        )}
      </View>
      {!online && (
        <Pressable onPress={onRetry} style={bannerStyles.retryBtn}>
          <Text style={bannerStyles.retryText}>RETRY</Text>
        </Pressable>
      )}
    </View>
  );
}

const useBannerStyles = createThemedStyles((c) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 20,
    gap: 10,
  },
  online:    { borderColor: c.Severity.green  + '55', backgroundColor: c.Severity.green  + '11' },
  offline:   { borderColor: c.Dashboard.cardBorder,   backgroundColor: c.Dashboard.card },
  dot:       { width: 8, height: 8, borderRadius: 4 },
  title:     { fontSize: 13, fontWeight: '600', color: c.Dashboard.textPrimary },
  sub:       { fontSize: 11, color: c.Dashboard.textSecondary, marginTop: 2 },
  retryBtn:  { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: c.Dashboard.accent },
  retryText: { fontSize: 11, fontWeight: '700', color: c.Dashboard.accent, letterSpacing: 1 },
}));
