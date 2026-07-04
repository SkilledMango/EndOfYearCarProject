/**
 * ThemeContext — resolves the active color palette from the user's
 * Appearance setting (light / dark / follow-system), persists the choice,
 * and hands palettes to screens via useTheme() and createThemedStyles().
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

  // Restore the saved preference once on launch
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(stored => {
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setModeState(stored);
        }
      })
      .catch(() => { /* corrupted storage — stay on system */ });
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
 * Wraps a style factory so each component gets styles built from the active
 * palette (and rebuilt only when the theme flips):
 *
 *   const useStyles = createThemedStyles((c) => StyleSheet.create({ ... }));
 *   // inside the component:
 *   const styles = useStyles();
 */
export function createThemedStyles<T>(factory: (c: ThemeColors) => T) {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => factory(colors), [colors]);
  };
}
