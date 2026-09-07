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
// ייבוא לצורך תופעת הלוואי: רושם את הגדר הגיאוגרפית של תזכורת הילדים
// ואת מטפל ההתראות בכל הפעלה, כולל הפעלה ברקע.
import '@/services/notifications';

export const unstable_settings = {
  anchor: '(tabs)',
};

// ─── הניווט הפנימי, זה שיש לו גישה למשתמש המחובר ─────────────────────────────
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
      // לא מחובר ולא במסך התחברות: מפנים למסך ההתחברות
      router.replace('/login');
    } else if (user && onLoginScreen) {
      // כבר מחובר ונמצא במסך ההתחברות: מפנים לאפליקציה.
      // במכוון לא מפנים ממסך ההרשמה, כדי ששלב "הוסף את הרכב הראשון"
      // שאחרי ההרשמה יוכל להופיע.
      router.replace('/(tabs)');
    }
  }, [user, isLoading, segments]);

  // מסך פתיחה בזמן שחזור הסשן מהאחסון
  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.Dashboard.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={c.Dashboard.accent} />
      </View>
    );
  }

  // התאמת צבעי הניווט לערכה הפעילה, כדי שמעברים לא יהבהבו בצבע לא נכון.
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
          <Stack.Screen name="fault/[code]" options={{ title: 'Fault code' }} />
        </Stack>
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </NavThemeProvider>
    </PaperProvider>
  );
}

// ─── הפריסה הראשית: מספקת את ערכת הצבעים ואת המשתמש לכל האפליקציה ────────────
export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}
