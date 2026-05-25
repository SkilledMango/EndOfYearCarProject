import React, { useRef, useState } from 'react';
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

export default function RegisterScreen() {
  const { register }                    = useAuth();
  const router                          = useRouter();
  const [fullName, setFullName]         = useState('');
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [confirmPassword, setConfirm]   = useState('');
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);

  // Refs for keyboard "next" navigation
  const emailRef   = useRef<TextInput>(null);
  const passRef    = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const handleRegister = async () => {
    setError(null);

    if (!fullName.trim())      { setError('Please enter your full name.');         return; }
    if (!email.trim())         { setError('Please enter your email address.');     return; }
    if (password.length < 6)   { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.');       return; }

    setLoading(true);
    try {
      await register(fullName.trim(), email.trim(), password);
      // AuthContext sets the user → _layout.tsx automatically navigates to tabs
    } catch (err: any) {
      setError(err.message ?? 'Registration failed. Please try again.');
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
        {/* Branding */}
        <View style={styles.brand}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoText}>CS</Text>
          </View>
          <Text style={styles.appName}>CarStats</Text>
          <Text style={styles.tagline}>Create your account</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>CREATE ACCOUNT</Text>

          {/* Full name */}
          <Text style={styles.label}>FULL NAME</Text>
          <TextInput
            style={styles.input}
            placeholder="John Smith"
            placeholderTextColor={Dashboard.textSecondary}
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
            editable={!loading}
          />

          {/* Email */}
          <Text style={styles.label}>EMAIL</Text>
          <TextInput
            ref={emailRef}
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={Dashboard.textSecondary}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            returnKeyType="next"
            onSubmitEditing={() => passRef.current?.focus()}
            editable={!loading}
          />

          {/* Password */}
          <Text style={styles.label}>PASSWORD</Text>
          <TextInput
            ref={passRef}
            style={styles.input}
            placeholder="Min. 6 characters"
            placeholderTextColor={Dashboard.textSecondary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
            editable={!loading}
          />

          {/* Confirm password */}
          <Text style={styles.label}>CONFIRM PASSWORD</Text>
          <TextInput
            ref={confirmRef}
            style={styles.input}
            placeholder="Re-enter your password"
            placeholderTextColor={Dashboard.textSecondary}
            value={confirmPassword}
            onChangeText={setConfirm}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleRegister}
            editable={!loading}
          />

          {/* Error */}
          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Register button */}
          <Pressable
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>CREATE ACCOUNT</Text>}
          </Pressable>
        </View>

        {/* Back to login */}
        <Pressable onPress={() => router.back()} style={styles.loginLink}>
          <Text style={styles.loginLinkText}>
            Already have an account?{'  '}
            <Text style={{ color: Dashboard.accent, fontWeight: '600' }}>Sign in</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: Dashboard.bg },
  container:     {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    paddingBottom: 48,
  },

  brand:         { alignItems: 'center', marginBottom: 40 },
  logoCircle:    {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Dashboard.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  logoText:      { fontSize: 26, fontWeight: '800', color: '#fff' },
  appName:       { fontSize: 30, fontWeight: '800', color: Dashboard.textPrimary, letterSpacing: 1 },
  tagline:       { fontSize: 13, color: Dashboard.textSecondary, marginTop: 6 },

  card:          {
    backgroundColor: Dashboard.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Dashboard.cardBorder,
    padding: 24,
    gap: 6,
  },
  cardTitle:     {
    fontSize: 11,
    fontWeight: '700',
    color: Dashboard.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  label:         {
    fontSize: 11,
    color: Dashboard.textSecondary,
    letterSpacing: 1.2,
    marginTop: 10,
    marginBottom: 4,
  },
  input:         {
    backgroundColor: Dashboard.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Dashboard.cardBorder,
    color: Dashboard.textPrimary,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  errorBox:      {
    backgroundColor: Severity.red + '18',
    borderWidth: 1,
    borderColor: Severity.red + '55',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  errorText:     { color: Severity.red, fontSize: 13, lineHeight: 18 },

  button:        {
    backgroundColor: Dashboard.accent,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText:    { color: '#fff', fontWeight: '700', fontSize: 15, letterSpacing: 1.5 },

  loginLink:     { alignItems: 'center', marginTop: 24 },
  loginLinkText: { fontSize: 13, color: Dashboard.textSecondary },
});
