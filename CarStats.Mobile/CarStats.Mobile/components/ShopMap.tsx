/**
 * גרסת הווב של המפה. ספריית המפות היא native בלבד, ולכן בדפדפן מוצג
 * מלבן מעוצב במקומה — אחרת בניית הווב נשברת.
 * המפה האמיתית נמצאת ב-ShopMap.native.tsx.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { createThemedStyles, useTheme } from '@/context/ThemeContext';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { ShopMapProps } from './ShopMap.types';

export default function ShopMap({ shops }: ShopMapProps) {
  const { colors: c } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.placeholder}>
      <View style={styles.pin}>
        <IconSymbol name="wrench.fill" size={18} color={c.Dashboard.onAccent} />
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

const useStyles = createThemedStyles((c) => StyleSheet.create({
  placeholder: {
    flex: 1,
    backgroundColor: c.Dashboard.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  pin: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: c.Dashboard.accentDeep,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  text:    { fontSize: 15, fontWeight: '600', color: c.Dashboard.textPrimary },
  subText: { fontSize: 13, color: c.Dashboard.textSecondary },
}));
