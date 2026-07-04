/**
 * ShopMap (web fallback) — react-native-maps is native-only, so on web the
 * map area renders as a styled placeholder instead of crashing the bundler.
 * The real map lives in ShopMap.native.tsx (Metro picks it on iOS/Android).
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Dashboard } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { ShopMapProps } from './ShopMap.types';

export default function ShopMap({ shops }: ShopMapProps) {
  return (
    <View style={styles.placeholder}>
      <View style={styles.pin}>
        <IconSymbol name="wrench.fill" size={18} color="#FFFFFF" />
      </View>
      <Text style={styles.text}>
        Map view is available in the mobile app
      </Text>
      <Text style={styles.subText}>
        {shops.length} mechanic{shops.length === 1 ? '' : 's'} listed below
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    backgroundColor: Dashboard.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  pin: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Dashboard.accentDeep,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  text:    { fontSize: 15, fontWeight: '600', color: Dashboard.textPrimary },
  subText: { fontSize: 13, color: Dashboard.textSecondary },
});
