/**
 * Registration — a three-step flow: account details, emailed code, first car.
 *
 * Inputs and buttons are react-native-paper components themed to the CarStats
 * palette (see constants/paperTheme.ts). Paper's outlined TextInput gives the
 * floating-label-cut-into-the-border treatment this screen previously hand-rolled.
 */

import React, { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput as RNTextInput,
  View,
} from 'react-native';
import { Button, Card, HelperText, IconButton, TextInput } from 'react-native-paper';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { AddVehicleModal } from '@/components/AddVehicleModal';
import { createThemedStyles, useTheme } from '@/context/ThemeContext';

// Simple but solid email-format check (mirrors the backend MailAddress check)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Step = 'account' | 'verify' | 'vehicle';
const STEP_ORDER: Step[] = ['account', 'verify', 'vehicle'];
const STEP_LABELS = ['Account', 'Verify', 'Car'];

/**
 * Paper's TextInput forwards its ref to the native one. It accepts a ref
 * satisfying both its own handle type and RN's TextInput, and the native
 * TextInput covers both — so that is what the refs are typed as.
 */
type FieldRef = RNTextInput;

export default function RegisterScreen() {
  const { register, verifyCode, resendCode, refreshUser } = useAuth();
  const { colors: c } = useTheme();
  const styles = useStyles();
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
  const [code, setCode]           = useState('');
  const [resendMsg, setResendMsg] = useState<string | null>(null);

  // ── First-vehicle step ──
  const [newUserId, setNewUserId]  = useState<number | null>(null);
  const [addCarVisible, setAddCar] = useState(false);

  // ── Shared UI ──
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const emailRef   = useRef<FieldRef>(null);
  const passRef    = useRef<FieldRef>(null);
  const confirmRef = useRef<FieldRef>(null);

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
        goToApp();   // was just confirming an existing account
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

  const handleBackHeader = () => {
    if (step === 'verify' && !fromLogin) { setStep('account'); return; }
    if (fromLogin) { router.replace('/login'); return; }
    router.back();
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header: circular back button + centered title */}
      <View style={styles.header}>
        <IconButton
          icon="arrow-left"
          size={22}
          mode="contained-tonal"
          onPress={handleBackHeader}
          accessibilityLabel="Go back"
        />
        <Text style={styles.headerTitle}>REGISTRATION</Text>
        <View style={styles.backCircleSpacer} />
      </View>

      {/* Numbered step indicator */}
      <View style={styles.stepper}>
        {STEP_LABELS.map((label, i) => (
          <React.Fragment key={label}>
            {i > 0 && (
              <View style={[styles.stepLine, i <= currentIndex && styles.stepLineActive]} />
            )}
            <View style={styles.stepItem}>
              <View style={[styles.stepCircle, i <= currentIndex && styles.stepCircleActive]}>
                <Text style={[styles.stepNum, i <= currentIndex && styles.stepNumActive]}>
                  {i + 1}
                </Text>
              </View>
              <Text style={[styles.stepLabel, i <= currentIndex && styles.stepLabelActive]}>
                {label}
              </Text>
            </View>
          </React.Fragment>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        {/* ─────────── STEP 1: account ─────────── */}
        {step === 'account' && (
          <>
            <Text style={styles.headline}>Create Account</Text>
            <Text style={styles.subhead}>
              Enter your details to start managing your vehicle&apos;s health.
            </Text>

            <TextInput
              mode="outlined"
              label="Full Name"
              placeholder="e.g. John Doe"
              style={styles.field}
              value={fullName}
              onChangeText={t => { setFullName(t); setError(null); }}
              autoCapitalize="words"
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
              disabled={loading}
              left={<TextInput.Icon icon="account-outline" />}
            />

            <TextInput
              ref={emailRef}
              mode="outlined"
              label="Email Address"
              placeholder="name@example.com"
              style={styles.field}
              value={email}
              onChangeText={t => { setEmail(t); setError(null); }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              returnKeyType="next"
              onSubmitEditing={() => passRef.current?.focus()}
              disabled={loading}
              left={<TextInput.Icon icon="email-outline" />}
            />

            <TextInput
              ref={passRef}
              mode="outlined"
              label="Password"
              placeholder="Min. 6 characters"
              style={styles.field}
              value={password}
              onChangeText={t => { setPassword(t); setError(null); }}
              secureTextEntry={!showPass}
              returnKeyType="next"
              onSubmitEditing={() => confirmRef.current?.focus()}
              disabled={loading}
              left={<TextInput.Icon icon="lock-outline" />}
              right={
                <TextInput.Icon
                  icon={showPass ? 'eye-off' : 'eye'}
                  onPress={() => setShowPass(s => !s)}
                  accessibilityLabel={showPass ? 'Hide password' : 'Show password'}
                />
              }
            />

            <TextInput
              ref={confirmRef}
              mode="outlined"
              label="Confirm Password"
              placeholder="Re-enter your password"
              style={styles.field}
              value={confirmPassword}
              onChangeText={t => { setConfirm(t); setError(null); }}
              secureTextEntry={!showConfirm}
              returnKeyType="done"
              onSubmitEditing={handleRegister}
              disabled={loading}
              left={<TextInput.Icon icon="lock-outline" />}
              right={
                <TextInput.Icon
                  icon={showConfirm ? 'eye-off' : 'eye'}
                  onPress={() => setShowConfirm(s => !s)}
                  accessibilityLabel={showConfirm ? 'Hide password' : 'Show password'}
                />
              }
            />

            <HelperText type="error" visible={!!error}>{error ?? ' '}</HelperText>

            <Button
              mode="contained"
              onPress={handleRegister}
              loading={loading}
              disabled={loading}
              icon="arrow-right"
              contentStyle={styles.buttonContent}
              labelStyle={styles.buttonLabel}
            >
              {loading ? 'Creating account…' : 'Continue'}
            </Button>

            <Pressable onPress={() => router.back()} style={styles.footerLink}>
              <Text style={styles.footerLinkText}>
                Already have an account?{'  '}
                <Text style={{ color: c.Dashboard.accent, fontWeight: '700' }}>Log in</Text>
              </Text>
            </Pressable>
          </>
        )}

        {/* ─────────── STEP 2: verify code ─────────── */}
        {step === 'verify' && (
          <>
            <Text style={styles.headline}>Check your email</Text>
            <Text style={styles.subhead}>
              We sent a 6-digit code to{' '}
              <Text style={{ color: c.Dashboard.textPrimary, fontWeight: '700' }}>{email}</Text>
            </Text>

            <TextInput
              mode="outlined"
              label="6-digit code"
              placeholder="● ● ● ● ● ●"
              style={[styles.field, styles.codeField]}
              contentStyle={styles.codeFieldContent}
              value={code}
              onChangeText={t => { setCode(t.replace(/\D/g, '').slice(0, 6)); setError(null); }}
              keyboardType="number-pad"
              maxLength={6}
              returnKeyType="done"
              onSubmitEditing={handleVerify}
              autoFocus
              disabled={loading}
              error={!!error}
            />

            <HelperText type="error" visible={!!error}>{error ?? ' '}</HelperText>
            {resendMsg && <Text style={styles.resendOk}>{resendMsg}</Text>}

            <Button
              mode="contained"
              onPress={handleVerify}
              loading={loading}
              disabled={loading}
              contentStyle={styles.buttonContent}
              labelStyle={styles.buttonLabel}
            >
              {loading ? 'Verifying…' : 'Verify'}
            </Button>

            <Button mode="text" onPress={handleResend} disabled={loading} style={styles.footerLink}>
              Didn&apos;t get it? Resend code
            </Button>
          </>
        )}

        {/* ─────────── STEP 3: first car ─────────── */}
        {step === 'vehicle' && (
          <Card mode="elevated" style={styles.successCard}>
            <Card.Content style={styles.successContent}>
              <View style={styles.successIconCircle}>
                <MaterialIcons name="directions-car" size={36} color={c.Dashboard.accent} />
              </View>
              <Text style={styles.successTitle}>Welcome aboard, {firstName}!</Text>
              <Text style={styles.successSub}>
                Add your first car to start tracking fuel economy and fault codes.
                You can always add more later.
              </Text>

              <Button
                mode="contained"
                icon="car"
                onPress={() => setAddCar(true)}
                style={styles.successBtn}
                contentStyle={styles.buttonContent}
                labelStyle={styles.buttonLabel}
              >
                Add My Car
              </Button>
              <Button mode="text" onPress={goToApp}>Skip for now</Button>
            </Card.Content>
          </Card>
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

const useStyles = createThemedStyles((c) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.Dashboard.bg },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  // Balances the IconButton on the left so the title stays optically centered.
  backCircleSpacer: { width: 44 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '800',
    color: c.Dashboard.textPrimary,
    letterSpacing: 2,
  },

  // Stepper
  stepper: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 28,
    paddingTop: 16,
    paddingBottom: 8,
  },
  stepItem:   { alignItems: 'center', width: 56 },
  stepCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: c.Dashboard.cardBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepCircleActive: { backgroundColor: c.Dashboard.accentDeep },
  stepNum:          { fontSize: 14, fontWeight: '700', color: c.Dashboard.textSecondary },
  stepNumActive:    { color: c.Dashboard.onAccent },
  stepLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: c.Dashboard.textSecondary,
    marginTop: 6,
  },
  stepLabelActive: { color: c.Dashboard.accentDeep },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: c.Dashboard.cardBorder,
    marginTop: 17,
    marginHorizontal: 4,
  },
  stepLineActive: { backgroundColor: c.Dashboard.accentDeep },

  container: { flexGrow: 1, padding: 20, paddingTop: 12, paddingBottom: 48 },

  headline: {
    fontSize: 30,
    fontWeight: '800',
    color: c.Dashboard.textPrimary,
    letterSpacing: -0.5,
    marginTop: 8,
  },
  subhead: {
    fontSize: 16,
    color: c.Dashboard.textSecondary,
    lineHeight: 24,
    marginTop: 6,
    marginBottom: 18,
  },

  // Paper's outlined TextInput draws its own border and floating label — these
  // only handle spacing and the oversized verification-code treatment.
  field: { marginTop: 14 },
  codeField:        { marginTop: 10 },
  codeFieldContent: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 8,
    textAlign: 'center',
  },
  resendOk: { fontSize: 13, color: c.Severity.green, textAlign: 'center', marginTop: 10 },

  // Buttons
  buttonContent: { paddingVertical: 8, flexDirection: 'row-reverse' },
  buttonLabel:   { fontSize: 18, fontWeight: '700' },

  footerLink:     { alignItems: 'center', marginTop: 20, paddingVertical: 6 },
  footerLinkText: { fontSize: 15, color: c.Dashboard.textSecondary },

  // Step 3
  successCard:    { borderRadius: 24, marginTop: 12 },
  successContent: { alignItems: 'center', paddingVertical: 12 },
  successBtn:     { alignSelf: 'stretch', marginTop: 8 },
  successIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: c.Dashboard.accentSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: c.Dashboard.textPrimary,
    textAlign: 'center',
  },
  successSub: {
    fontSize: 14,
    color: c.Dashboard.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 10,
    marginBottom: 8,
  },
}));
