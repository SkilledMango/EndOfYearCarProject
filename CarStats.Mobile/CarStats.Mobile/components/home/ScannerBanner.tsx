/**
 * שורת מצב החיבור למתאם, בראש מסך המוסך.
 * מכילה גם את כפתור הניסיון החוזר, שהוא הדרך היחידה לחזור אחרי
 * שהמתאם סומן כמנותק.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ScannerStatus } from '@/services/scanner';
import { createThemedStyles, useTheme } from '@/context/ThemeContext';

export default function ScannerBanner({
  online,
  status,
  demo,
  onRetry,
  onToggleDemo,
  onDisconnect,
}: {
  online: boolean;
  status: ScannerStatus | null;
  /** אמת כל עוד מצב ההדגמה מחליף את המתאם. */
  demo: boolean;
  onRetry: () => void;
  onToggleDemo: () => void;
  /** מסיים את החיבור למתאם בלי לנתק אותו פיזית. */
  onDisconnect: () => void;
}) {
  const { colors: c } = useTheme();
  const bannerStyles = useBannerStyles();

  const dotColor = demo   ? c.Severity.yellow
                 : online ? c.Severity.green
                 : c.Severity.unknown;

  return (
    <View style={[
      bannerStyles.row,
      demo ? bannerStyles.demo : online ? bannerStyles.online : bannerStyles.offline,
    ]}>
      <View style={[bannerStyles.dot, { backgroundColor: dotColor }]} />
      <View style={{ flex: 1 }}>
        <Text style={bannerStyles.title}>
          {demo ? 'Demo Connection' : online ? 'OBD-II Adapter Connected' : 'Adapter Not Found'}
        </Text>
        {/* נתוני הדגמה מסומנים תמיד ככאלה, כדי שאי אפשר יהיה לבלבל
            בינם לבין נתונים מרכב אמיתי. */}
        {demo ? (
          <Text style={bannerStyles.sub}>Simulated readings — no car connected</Text>
        ) : online && status ? (
          <Text style={bannerStyles.sub}>
            {status.simMode ? '⚠ Simulation mode — no car connected' : '✓ Reading live car data'}
            {'  ·  Uptime '}{Math.floor(status.uptimeSeconds / 60)}m
          </Text>
        ) : (
          <Text style={bannerStyles.sub}>Looking for carstats-scanner.local on your network…</Text>
        )}
      </View>

      {demo ? (
        <Pressable onPress={onToggleDemo} style={bannerStyles.retryBtn}>
          <Text style={bannerStyles.retryText}>EXIT DEMO</Text>
        </Pressable>
      ) : online ? (
        <Pressable onPress={onDisconnect} style={bannerStyles.retryBtn}>
          <Text style={bannerStyles.retryText}>DISCONNECT</Text>
        </Pressable>
      ) : (
        <View style={bannerStyles.actions}>
          <Pressable onPress={onRetry} style={bannerStyles.retryBtn}>
            <Text style={bannerStyles.retryText}>RETRY</Text>
          </Pressable>
          <Pressable onPress={onToggleDemo} style={bannerStyles.retryBtn}>
            <Text style={bannerStyles.retryText}>DEMO</Text>
          </Pressable>
        </View>
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
  demo:      { borderColor: c.Severity.yellow + '66', backgroundColor: c.SeveritySoft.yellow },
  actions:   { flexDirection: 'row', gap: 8 },
  dot:       { width: 8, height: 8, borderRadius: 4 },
  title:     { fontSize: 13, fontWeight: '600', color: c.Dashboard.textPrimary },
  sub:       { fontSize: 11, color: c.Dashboard.textSecondary, marginTop: 2 },
  retryBtn:  { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: c.Dashboard.accent },
  retryText: { fontSize: 11, fontWeight: '700', color: c.Dashboard.accent, letterSpacing: 1 },
}));
