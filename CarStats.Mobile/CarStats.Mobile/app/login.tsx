/**
 * Login screen.
 *
 * Built with react-native-paper components (TextInput, Button, Card,
 * HelperText) themed to the CarStats palette via constants/paperTheme.ts —
 * so the app gets the library's accessibility, focus states and floating
 * labels for free without adopting Paper's stock Material look.
 */

import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button, Card, HelperText, TextInput } from 'react-native-paper';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { createThemedStyles, useTheme } from '@/context/ThemeContext';

export default function LoginScreen() {
  const { login } = useAuth();
  const { colors: c } = useTheme();
  const styles = useStyles();
  const router    = useRouter();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const handleLogin = async () => {
    setError(null);

    if (!email.trim())    { setError('Please enter your email.');    return; }
    if (!password.trim()) { setError('Please enter your password.'); return; }

    setLoading(true);
    try {
      await login(email.trim(), password);
      // AuthContext sets the user → _layout.tsx automatically navigates to tabs
    } catch (err: any) {
      // Unverified account — the API just emailed a fresh code. Send them to
      // the verification step with their email pre-filled.
      if (err?.code === 'EMAIL_NOT_VERIFIED') {
        router.push({ pathname: '/register', params: { verifyEmail: err.email ?? email.trim() } });
        return;
      }
      setError(err.message ?? 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo / branding */}
        <View style={styles.brand}>
          <View style={styles.logoSquare}>
            <MaterialIcons name="directions-car" size={40} color={c.Dashboard.onAccent} />
          </View>
          <Text style={styles.appName}>CarStats</Text>
          <Text style={styles.tagline}>Understand your car&apos;s language.</Text>
        </View>

        <Card mode="elevated" style={styles.card}>
          <Card.Content style={styles.cardContent}>
            <TextInput
              mode="outlined"
              label="Email Address"
              placeholder="you@example.com"
              value={email}
              onChangeText={t => { setEmail(t); setError(null); }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              returnKeyType="next"
              disabled={loading}
              error={!!error}
              left={<TextInput.Icon icon="email-outline" />}
            />

            <TextInput
              mode="outlined"
              label="Password"
              value={password}
              onChangeText={t => { setPassword(t); setError(null); }}
              secureTextEntry={!showPass}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              disabled={loading}
              error={!!error}
              left={<TextInput.Icon icon="lock-outline" />}
              right={
                <TextInput.Icon
                  icon={showPass ? 'eye-off' : 'eye'}
                  onPress={() => setShowPass(s => !s)}
                  // Screen readers otherwise announce this as an unlabelled button
                  accessibilityLabel={showPass ? 'Hide password' : 'Show password'}
                />
              }
            />

            {/* visible={false} keeps the row's height reserved, so the button
                doesn't jump down when an error appears. */}
            <HelperText type="error" visible={!!error}>
              {error ?? ' '}
            </HelperText>

            <Button
              mode="contained"
              onPress={handleLogin}
              loading={loading}
              disabled={loading}
              contentStyle={styles.buttonContent}
              labelStyle={styles.buttonLabel}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </Button>
          </Card.Content>
        </Card>

        <Pressable onPress={() => router.push('/register')} style={styles.registerLink}>
          <Text style={styles.registerLinkText}>
            Don&apos;t have an account?{'  '}
            <Text style={{ color: c.Dashboard.accent, fontWeight: '700' }}>Create one.</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = createThemedStyles((c) => StyleSheet.create({
  root:      { flex: 1, backgroundColor: c.Dashboard.bg },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
    paddingBottom: 48,
  },

  // Branding
  brand:      { alignItems: 'center', marginBottom: 32 },
  logoSquare: {
    width: 84,
    height: 84,
    borderRadius: 24,
    backgroundColor: c.Dashboard.accentDeep,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
    shadowColor: c.Dashboard.accentDeep,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  appName: {
    fontSize: 34,
    fontWeight: '800',
    color: c.Dashboard.textPrimary,
    letterSpacing: -0.5,
  },
  tagline: { fontSize: 16, color: c.Dashboard.textSecondary, marginTop: 8 },

  // Card — Paper handles the surface color and elevation; the 24pt radius is
  // ours, larger than the theme's global roundness.
  card:        { borderRadius: 24 },
  cardContent: { paddingVertical: 8, gap: 10 },

  buttonContent: { paddingVertical: 8 },
  buttonLabel:   { fontSize: 18, fontWeight: '700' },

  registerLink:     { alignItems: 'center', marginTop: 28 },
  registerLinkText: { fontSize: 15, color: c.Dashboard.textSecondary },
}));
