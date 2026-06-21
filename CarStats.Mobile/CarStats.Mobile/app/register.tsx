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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { AddVehicleModal } from '@/components/AddVehicleModal';
import { Dashboard, Severity } from '@/constants/theme';

// Simple but solid email-format check (mirrors the backend MailAddress check)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Step = 'account' | 'verify' | 'vehicle';
const STEP_ORDER: Step[] = ['account', 'verify', 'vehicle'];
const STEP_LABELS = ['Account', 'Verify', 'Your car'];

export default function RegisterScreen() {
  const { register, verifyCode, resendCode, refreshUser } = useAuth();
  const router = useRouter();

  // When arriving from the login screen for an unverified account, we jump
  // straight to the verify step with the email pre-filled.
  const params       = useLocalSearchParams<{ verifyEmail?: string }>();
  const initialEmail = typeof params.verifyEmail === 'string' ? params.verifyEmail : '';
  const fromLogin    = !!initialEmail;

  // ── Flow ──
  const [step, setStep] = useState<Step>(initialEmail ? 'verify' : 'account');

  // ── Account form ──
  const [fullName, setFullName]       = useState('');
  const [email, setEmail]             = useState(initialEmail);
  const [password, setPassword]       = useState('');
  const [confirmPassword, setConfirm] = useState('');
  const [showPass, setShowPass]       = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // ── Verify ──
  const [code, setCode]               = useState('');
  const [resendMsg, setResendMsg]     = useState<string | null>(null);

  // ── First-vehicle step ──
  const [newUserId, setNewUserId]     = useState<number | null>(null);
  const [addCarVisible, setAddCar]    = useState(false);

  // ── Shared UI ──
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const emailRef   = useRef<TextInput>(null);
  const passRef    = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const firstName    = fullName.trim().split(/\s+/)[0] || 'there';
  const currentIndex = STEP_ORDER.indexOf(step);

  // ── Step 1: create account ───────────────────────────────────────────────
  const handleRegister = async () => {
    setError(null);
    if (!fullName.trim())             { setError('Please enter your full name.');            return; }
    if (!EMAIL_RE.test(email.trim())) { setError('Please enter a valid email address.');     return; }
    if (password.length < 6)          { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.');                 return; }

    setLoading(true);
    try {
      await register(fullName.trim(), email.trim(), password);
      setStep('verify');   // a code has been emailed
    } catch (err: any) {
      setError(err.message ?? 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: verify the emailed code ──────────────────────────────────────
  const handleVerify = async () => {
    setError(null);
    if (code.trim().length !== 6) { setError('Enter the 6-digit code from your email.'); return; }

    setLoading(true);
    try {
      const user = await verifyCode(email.trim(), code.trim());
      if (fromLogin) {
        // Was just confirming an existing account → straight into the app.
        goToApp();
      } else {
        setNewUserId(user.id);
        setStep('vehicle');
      }
    } catch (err: any) {
      setError(err.message ?? 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setResendMsg(null);
    try {
      await resendCode(email.trim());
      setResendMsg('A new code is on its way.');
    } catch (err: any) {
      setError(err.message ?? 'Could not resend the code.');
    }
  };

  // ── Step 3: finish ───────────────────────────────────────────────────────
  const goToApp = () => router.replace('/(tabs)');

  const handleCarAdded = async () => {
    setAddCar(false);
    await refreshUser();
    goToApp();
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Branding */}
        <View style={styles.brand}>
          <View style={styles.logoCircle}><Text style={styles.logoText}>CS</Text></View>
          <Text style={styles.appName}>CarStats</Text>
          <Text style={styles.tagline}>
            {step === 'account' ? 'Create your account'
              : step === 'verify' ? 'Confirm your email'
              : `Welcome aboard, ${firstName}!`}
          </Text>
        </View>

        {/* Step indicator */}
        <View style={styles.stepper}>
          {STEP_ORDER.map((s, i) => (
            <React.Fragment key={s}>
              {i > 0 && <View style={[styles.stepBar, i <= currentIndex && styles.stepBarActive]} />}
              <View style={[styles.stepDot, i <= currentIndex && styles.stepDotActive]} />
            </React.Fragment>
          ))}
        </View>
        <View style={styles.stepLabels}>
          {STEP_LABELS.map((label, i) => (
            <Text key={label} style={[styles.stepLabel, i <= currentIndex && styles.stepLabelActive]}>
              {label}
            </Text>
          ))}
        </View>

        {/* ─────────── STEP 1: account ─────────── */}
        {step === 'account' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>CREATE ACCOUNT</Text>

            <Text style={styles.label}>FULL NAME</Text>
            <TextInput
              style={styles.input}
              placeholder="John Smith"
              placeholderTextColor={Dashboard.textSecondary}
              value={fullName}
              onChangeText={t => { setFullName(t); setError(null); }}
              autoCapitalize="words"
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
              editable={!loading}
            />

            <Text style={styles.label}>EMAIL</Text>
            <TextInput
              ref={emailRef}
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={Dashboard.textSecondary}
              value={email}
              onChangeText={t => { setEmail(t); setError(null); }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              returnKeyType="next"
              onSubmitEditing={() => passRef.current?.focus()}
              editable={!loading}
            />

            <Text style={styles.label}>PASSWORD</Text>
            <View style={styles.inputWrap}>
              <TextInput
                ref={passRef}
                style={styles.inputFlex}
                placeholder="Min. 6 characters"
                placeholderTextColor={Dashboard.textSecondary}
                value={password}
                onChangeText={t => { setPassword(t); setError(null); }}
                secureTextEntry={!showPass}
                returnKeyType="next"
                onSubmitEditing={() => confirmRef.current?.focus()}
                editable={!loading}
              />
              <Pressable onPress={() => setShowPass(s => !s)} hitSlop={8}>
                <Text style={styles.toggleText}>{showPass ? 'HIDE' : 'SHOW'}</Text>
              </Pressable>
            </View>

            <Text style={styles.label}>CONFIRM PASSWORD</Text>
            <View style={styles.inputWrap}>
              <TextInput
                ref={confirmRef}
                style={styles.inputFlex}
                placeholder="Re-enter your password"
                placeholderTextColor={Dashboard.textSecondary}
                value={confirmPassword}
                onChangeText={t => { setConfirm(t); setError(null); }}
                secureTextEntry={!showConfirm}
                returnKeyType="done"
                onSubmitEditing={handleRegister}
                editable={!loading}
              />
              <Pressable onPress={() => setShowConfirm(s => !s)} hitSlop={8}>
                <Text style={styles.toggleText}>{showConfirm ? 'HIDE' : 'SHOW'}</Text>
              </Pressable>
            </View>

            {error && <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>}

            <Pressable style={[styles.button, loading && styles.buttonDisabled]} onPress={handleRegister} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>CREATE ACCOUNT</Text>}
            </Pressable>
          </View>
        )}

        {/* ─────────── STEP 2: verify code ─────────── */}
        {step === 'verify' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>CHECK YOUR EMAIL</Text>
            <Text style={styles.verifyHint}>
              We sent a 6-digit code to{'\n'}
              <Text style={styles.verifyEmail}>{email}</Text>
            </Text>

            <TextInput
              style={styles.codeInput}
              placeholder="● ● ● ● ● ●"
              placeholderTextColor={Dashboard.textSecondary}
              value={code}
              onChangeText={t => { setCode(t.replace(/\D/g, '').slice(0, 6)); setError(null); }}
              keyboardType="number-pad"
              maxLength={6}
              textAlign="center"
              returnKeyType="done"
              onSubmitEditing={handleVerify}
              autoFocus
              editable={!loading}
            />

            {error && <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>}
            {resendMsg && <Text style={styles.resendOk}>{resendMsg}</Text>}

            <Pressable style={[styles.button, loading && styles.buttonDisabled]} onPress={handleVerify} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>VERIFY</Text>}
            </Pressable>

            <Pressable style={styles.resendBtn} onPress={handleResend} disabled={loading}>
              <Text style={styles.resendText}>
                Didn't get it?{'  '}
                <Text style={{ color: Dashboard.accent, fontWeight: '600' }}>Resend code</Text>
              </Text>
            </Pressable>
          </View>
        )}

        {/* ─────────── STEP 3: first car ─────────── */}
        {step === 'vehicle' && (
          <View style={styles.card}>
            <Text style={styles.successIcon}>🚗</Text>
            <Text style={styles.successTitle}>Email verified!</Text>
            <Text style={styles.successSub}>
              Add your first car to start tracking fuel economy and fault codes.
              You can always add more later.
            </Text>

            <Pressable style={styles.button} onPress={() => setAddCar(true)}>
              <Text style={styles.buttonText}>ADD MY CAR</Text>
            </Pressable>
            <Pressable style={styles.skipBtn} onPress={goToApp}>
              <Text style={styles.skipText}>Skip for now</Text>
            </Pressable>
          </View>
        )}

        {/* Footer link */}
        {step === 'account' && (
          <Pressable onPress={() => router.back()} style={styles.loginLink}>
            <Text style={styles.loginLinkText}>
              Already have an account?{'  '}
              <Text style={{ color: Dashboard.accent, fontWeight: '600' }}>Sign in</Text>
            </Text>
          </Pressable>
        )}
        {step === 'verify' && (
          <Pressable
            onPress={() => (fromLogin ? router.replace('/login') : setStep('account'))}
            style={styles.loginLink}
          >
            <Text style={styles.loginLinkText}>
              <Text style={{ color: Dashboard.accent, fontWeight: '600' }}>
                {fromLogin ? '← Back to sign in' : '← Use a different email'}
              </Text>
            </Text>
          </Pressable>
        )}
      </ScrollView>

      {/* Add-vehicle modal (first-car step) */}
      {newUserId != null && (
        <AddVehicleModal
          visible={addCarVisible}
          userId={newUserId}
          onAdded={handleCarAdded}
          onClose={() => setAddCar(false)}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root:      { flex: 1, backgroundColor: Dashboard.bg },
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingBottom: 48 },

  brand:      { alignItems: 'center', marginBottom: 24 },
  logoCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: Dashboard.accent, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  logoText:   { fontSize: 26, fontWeight: '800', color: '#fff' },
  appName:    { fontSize: 30, fontWeight: '800', color: Dashboard.textPrimary, letterSpacing: 1 },
  tagline:    { fontSize: 13, color: Dashboard.textSecondary, marginTop: 6 },

  // Step indicator
  stepper:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  stepDot:    { width: 12, height: 12, borderRadius: 6, backgroundColor: Dashboard.cardBorder },
  stepDotActive: { backgroundColor: Dashboard.accent },
  stepBar:    { width: 44, height: 2, backgroundColor: Dashboard.cardBorder, marginHorizontal: 6 },
  stepBarActive: { backgroundColor: Dashboard.accent },
  stepLabels: { flexDirection: 'row', justifyContent: 'center', gap: 30, marginBottom: 22 },
  stepLabel:  { fontSize: 10, color: Dashboard.textSecondary, letterSpacing: 1, fontWeight: '600' },
  stepLabelActive: { color: Dashboard.textPrimary },

  // Card
  card:       { backgroundColor: Dashboard.card, borderRadius: 16, borderWidth: 1, borderColor: Dashboard.cardBorder, padding: 24, gap: 6 },
  cardTitle:  { fontSize: 11, fontWeight: '700', color: Dashboard.textSecondary, letterSpacing: 1.5, marginBottom: 10 },
  label:      { fontSize: 11, color: Dashboard.textSecondary, letterSpacing: 1.2, marginTop: 10, marginBottom: 4 },
  input:      { backgroundColor: Dashboard.bg, borderRadius: 8, borderWidth: 1, borderColor: Dashboard.cardBorder, color: Dashboard.textPrimary, fontSize: 15, paddingHorizontal: 14, paddingVertical: 12 },

  // Password input + show/hide
  inputWrap:  { flexDirection: 'row', alignItems: 'center', backgroundColor: Dashboard.bg, borderRadius: 8, borderWidth: 1, borderColor: Dashboard.cardBorder, paddingHorizontal: 14 },
  inputFlex:  { flex: 1, color: Dashboard.textPrimary, fontSize: 15, paddingVertical: 12 },
  toggleText: { color: Dashboard.accent, fontSize: 11, fontWeight: '700', letterSpacing: 1, paddingLeft: 10 },

  // Verify
  verifyHint:  { fontSize: 13, color: Dashboard.textSecondary, lineHeight: 20, textAlign: 'center', marginBottom: 4 },
  verifyEmail: { color: Dashboard.textPrimary, fontWeight: '700' },
  codeInput:   {
    backgroundColor: Dashboard.bg, borderRadius: 10, borderWidth: 1, borderColor: Dashboard.accent + '66',
    color: Dashboard.textPrimary, fontSize: 28, fontWeight: '800', letterSpacing: 8,
    paddingVertical: 16, marginTop: 14,
  },
  resendBtn:  { alignItems: 'center', paddingVertical: 14, marginTop: 2 },
  resendText: { fontSize: 13, color: Dashboard.textSecondary },
  resendOk:   { fontSize: 12, color: Severity.green, textAlign: 'center', marginTop: 8 },

  // Error
  errorBox:   { backgroundColor: Severity.red + '18', borderWidth: 1, borderColor: Severity.red + '55', borderRadius: 8, padding: 12, marginTop: 8 },
  errorText:  { color: Severity.red, fontSize: 13, lineHeight: 18 },

  // Button
  button:     { backgroundColor: Dashboard.accent, borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15, letterSpacing: 1.5 },

  // Step 3 success
  successIcon:  { fontSize: 44, textAlign: 'center', marginTop: 4 },
  successTitle: { fontSize: 20, fontWeight: '800', color: Dashboard.textPrimary, textAlign: 'center', marginTop: 8 },
  successSub:   { fontSize: 13, color: Dashboard.textSecondary, textAlign: 'center', lineHeight: 19, marginTop: 8, paddingHorizontal: 4 },
  skipBtn:      { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  skipText:     { fontSize: 14, color: Dashboard.textSecondary, fontWeight: '500' },

  loginLink:     { alignItems: 'center', marginTop: 24 },
  loginLinkText: { fontSize: 13, color: Dashboard.textSecondary },
});
