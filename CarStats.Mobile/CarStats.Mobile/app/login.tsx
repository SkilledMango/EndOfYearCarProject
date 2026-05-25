import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { Dashboard, Severity } from '@/constants/theme';

export default function LoginScreen() {
  const { login } = useAuth();
  const router    = useRouter();
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const handleLogin = async () => {
    setError(null);

    if (!email.trim())    { setError('Please enter your email.');    return; }
    if (!password.trim()) { setError('Please enter your password.'); return; }

    setLoading(true);
    try {
      await login(email.trim(), password);
      // AuthContext sets the user → _layout.tsx automatically navigates to tabs
    } catch (err: any) {
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
          <View style={styles.logoCircle}>
            <Text style={styles.logoText}>CS</Text>
          </View>
          <Text style={styles.appName}>CarStats</Text>
          <Text style={styles.tagline}>Vehicle diagnostics in your pocket</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>SIGN IN</Text>

          {/* Email */}
          <Text style={styles.label}>EMAIL</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={Dashboard.textSecondary}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            returnKeyType="next"
            editable={!loading}
          />

          {/* Password */}
          <Text style={styles.label}>PASSWORD</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor={Dashboard.textSecondary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleLogin}
            editable={!loading}
          />

          {/* Error message */}
          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Login button */}
          <Pressable
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>SIGN IN</Text>}
          </Pressable>
        </View>

        <Pressable onPress={() => router.push('/register')} style={styles.registerLink}>
          <Text style={styles.registerLinkText}>
            Don't have an account?{'  '}
            <Text style={{ color: Dashboard.accent, fontWeight: '600' }}>Create one</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root:         { flex: 1, backgroundColor: Dashboard.bg },
  container:    {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    paddingBottom: 48,
  },

  // Branding
  brand:        { alignItems: 'center', marginBottom: 40 },
  logoCircle:   {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Dashboard.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  logoText:     { fontSize: 26, fontWeight: '800', color: '#fff' },
  appName:      { fontSize: 30, fontWeight: '800', color: Dashboard.textPrimary, letterSpacing: 1 },
  tagline:      { fontSize: 13, color: Dashboard.textSecondary, marginTop: 6 },

  // Card
  card:         {
    backgroundColor: Dashboard.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Dashboard.cardBorder,
    padding: 24,
    gap: 6,
  },
  cardTitle:    {
    fontSize: 11,
    fontWeight: '700',
    color: Dashboard.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  label:        {
    fontSize: 11,
    color: Dashboard.textSecondary,
    letterSpacing: 1.2,
    marginTop: 10,
    marginBottom: 4,
  },
  input:        {
    backgroundColor: Dashboard.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Dashboard.cardBorder,
    color: Dashboard.textPrimary,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  // Error
  errorBox:     {
    backgroundColor: Severity.red + '18',
    borderWidth: 1,
    borderColor: Severity.red + '55',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  errorText:    { color: Severity.red, fontSize: 13, lineHeight: 18 },

  // Button
  button:       {
    backgroundColor: Dashboard.accent,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText:   { color: '#fff', fontWeight: '700', fontSize: 15, letterSpacing: 1.5 },

  registerLink:     { alignItems: 'center', marginTop: 24 },
  registerLinkText: { fontSize: 13, color: Dashboard.textSecondary },
});
