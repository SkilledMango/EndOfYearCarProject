import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/context/AuthContext';
import { Dashboard } from '@/constants/theme';

export const unstable_settings = {
  anchor: '(tabs)',
};

// ─── Inner navigator — has access to AuthContext ───────────────────────────────
function RootNavigator() {
  const { user, isLoading } = useAuth();
  const router   = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading) return;

    const onLoginScreen = segments[0] === 'login';

    if (!user && !onLoginScreen) {
      // Not logged in — go to login
      router.replace('/login');
    } else if (user && onLoginScreen) {
      // Already logged in — go to main app
      router.replace('/(tabs)');
    }
  }, [user, isLoading, segments]);

  // Splash while restoring session from storage
  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: Dashboard.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={Dashboard.accent} />
      </View>
    );
  }

  return (
    <ThemeProvider value={DarkTheme}>
      <Stack>
        <Stack.Screen name="(tabs)"    options={{ headerShown: false }} />
        <Stack.Screen name="login"     options={{ headerShown: false }} />
        <Stack.Screen name="register"  options={{ headerShown: false }} />
        <Stack.Screen name="modal"     options={{ presentation: 'modal', headerShown: false }} />
      </Stack>
      <StatusBar style="light" />
    </ThemeProvider>
  );
}

// ─── Root layout — provides AuthContext to the whole app ──────────────────────
export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
