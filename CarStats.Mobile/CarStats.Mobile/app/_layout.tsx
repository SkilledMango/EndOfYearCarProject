import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
// Side-effect import: registers the child-reminder geofence task + the
// notification handler on every launch (including background launches).
import '@/services/notifications';

export const unstable_settings = {
  anchor: '(tabs)',
};

// ─── Inner navigator — has access to AuthContext ───────────────────────────────
function RootNavigator() {
  const { user, isLoading } = useAuth();
  const { colors: c, isDark } = useTheme();
  const router   = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading) return;

    const onLoginScreen    = segments[0] === 'login';
    const onRegisterScreen = segments[0] === 'register';
    const inAuthFlow       = onLoginScreen || onRegisterScreen;

    if (!user && !inAuthFlow) {
      // Not logged in and not on an auth screen — go to login
      router.replace('/login');
    } else if (user && onLoginScreen) {
      // Already logged in on the login screen — go to main app.
      // NOTE: we intentionally do NOT redirect away from the register screen
      // when a user exists, so the post-signup "add your first car" step can show.
      router.replace('/(tabs)');
    }
  }, [user, isLoading, segments]);

  // Splash while restoring session from storage
  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.Dashboard.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={c.Dashboard.accent} />
      </View>
    );
  }

  // Match the navigation chrome to the active palette so transitions
  // don't flash a mismatched color.
  const navTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme : DefaultTheme).colors,
      background: c.Dashboard.bg,
      card: c.Dashboard.card,
      primary: c.Dashboard.accent,
      text: c.Dashboard.textPrimary,
      border: c.Dashboard.cardBorder,
    },
  };

  return (
    <NavThemeProvider value={navTheme}>
      <Stack>
        <Stack.Screen name="(tabs)"    options={{ headerShown: false }} />
        <Stack.Screen name="login"     options={{ headerShown: false }} />
        <Stack.Screen name="register"  options={{ headerShown: false }} />
        <Stack.Screen name="trip-planner" options={{ title: 'Trip Fuel Planner' }} />
        <Stack.Screen name="settings"  options={{ title: 'Settings' }} />
      </Stack>
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </NavThemeProvider>
  );
}

// ─── Root layout — provides Theme + Auth contexts to the whole app ────────────
export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}
