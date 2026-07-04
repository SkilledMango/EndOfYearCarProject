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
          <Text style={styles.tagline}>Understand your car's language.</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          {/* Email */}
          <Text style={styles.label}>Email Address</Text>
          <View style={styles.inputWrap}>
            <MaterialIcons name="mail-outline" size={20} color={c.Dashboard.textSecondary} />
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={c.Dashboard.textSecondary}
              value={email}
              onChangeText={t => { setEmail(t); setError(null); }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              returnKeyType="next"
              editable={!loading}
            />
          </View>

          {/* Password */}
          <Text style={styles.label}>Password</Text>
          <View style={styles.inputWrap}>
            <MaterialIcons name="lock-outline" size={20} color={c.Dashboard.textSecondary} />
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={c.Dashboard.textSecondary}
              value={password}
              onChangeText={t => { setPassword(t); setError(null); }}
              secureTextEntry={!showPass}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              editable={!loading}
            />
            <Pressable onPress={() => setShowPass(s => !s)} hitSlop={8}>
              <MaterialIcons
                name={showPass ? 'visibility' : 'visibility-off'}
                size={20}
                color={c.Dashboard.textSecondary}
              />
            </Pressable>
          </View>

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
              ? <ActivityIndicator color={c.Dashboard.onAccent} />
              : <Text style={styles.buttonText}>Sign In</Text>}
          </Pressable>
        </View>

        <Pressable onPress={() => router.push('/register')} style={styles.registerLink}>
          <Text style={styles.registerLinkText}>
            Don't have an account?{'  '}
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

  // Card
  card: {
    backgroundColor: c.Dashboard.card,
    borderRadius: 24,
    padding: 24,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: c.Dashboard.textPrimary,
    letterSpacing: 0.3,
    marginTop: 10,
    marginBottom: 6,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: c.Dashboard.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.Dashboard.cardBorder,
    paddingHorizontal: 14,
  },
  input: {
    flex: 1,
    color: c.Dashboard.textPrimary,
    fontSize: 16,
    paddingVertical: 14,
  },

  // Error
  errorBox: {
    backgroundColor: c.SeveritySoft.red,
    borderWidth: 1,
    borderColor: c.Severity.red + '55',
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  errorText: { color: c.Severity.red, fontSize: 13, lineHeight: 18 },

  // Button
  button: {
    backgroundColor: c.Dashboard.accentDeep,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 18,
    shadowColor: c.Dashboard.accentDeep,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText:     { color: c.Dashboard.onAccent, fontWeight: '700', fontSize: 18 },

  registerLink:     { alignItems: 'center', marginTop: 28 },
  registerLinkText: { fontSize: 15, color: c.Dashboard.textSecondary },
}));
