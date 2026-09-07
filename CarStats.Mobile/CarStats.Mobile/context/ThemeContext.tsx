/**
 * מנהל את ערכת הצבעים הפעילה לפי הבחירה של המשתמש
 * (בהיר / כהה / לפי המערכת), שומר את הבחירה, ומספק את הערכה למסכים.
 */

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkColors, LightColors, ThemeColors } from '@/constants/theme';

const STORAGE_KEY = '@carstats_theme_mode';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  colors: ThemeColors;
  isDark: boolean;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  colors: LightColors,
  isDark: false,
  mode: 'system',
  setMode: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  // טעינת ההעדפה השמורה בהפעלה
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(stored => {
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setModeState(stored);
        }
      })
      .catch(() => { /* אחסון פגום — נשארים על מצב המערכת */ });
  }, []);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  };

  const isDark = mode === 'dark' || (mode === 'system' && systemScheme === 'dark');

  const value = useMemo<ThemeContextValue>(
    () => ({ colors: isDark ? DarkColors : LightColors, isDark, mode, setMode }),
    [isDark, mode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

/**
 * עוטף יצירת סגנונות כך שכל רכיב מקבל סגנונות לפי הערכה הפעילה,
 * ובונה אותם מחדש רק כשהערכה מתחלפת:
 *
 *   const useStyles = createThemedStyles((c) => StyleSheet.create({ ... }));
 *   // בתוך הרכיב:
 *   const styles = useStyles();
 */
export function createThemedStyles<T>(factory: (c: ThemeColors) => T) {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => factory(colors), [colors]);
  };
}
