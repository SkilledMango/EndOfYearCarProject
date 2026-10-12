import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { PaperDarkTheme, PaperLightTheme } from '@/constants/paperTheme';
// ייבוא בשביל תופעת הלוואי: רושם את משימת תזכורת הילד
import '@/services/notifications';

export const unstable_settings = {
  anchor: '(tabs)',
};

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
      // לא מחובר: למסך ההתחברות
      router.replace('/login');
    } else if (user && onLoginScreen) {
      // מחובר: לאפליקציה (חוץ ממסך ההרשמה, שבו מוסיפים את הרכב הראשון)
      router.replace('/(tabs)');
    }
  }, [user, isLoading, segments]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.Dashboard.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={c.Dashboard.accent} />
      </View>
    );
  }

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
    <PaperProvider theme={isDark ? PaperDarkTheme : PaperLightTheme}>
      <NavThemeProvider value={navTheme}>
        <Stack>
          <Stack.Screen name="(tabs)"    options={{ headerShown: false }} />
          <Stack.Screen name="login"     options={{ headerShown: false }} />
          <Stack.Screen name="register"  options={{ headerShown: false }} />
          <Stack.Screen name="trip-planner" options={{ title: 'Trip Fuel Planner' }} />
          <Stack.Screen name="settings"  options={{ title: 'Settings' }} />
          <Stack.Screen name="scanner-setup" options={{ title: 'Connect scanner' }} />
          <Stack.Screen name="fault/[code]" options={{ title: 'Fault code' }} />
        </Stack>
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </NavThemeProvider>
    </PaperProvider>
  );
}

// איתור: ניווט בין המסכים (Router)
export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}
