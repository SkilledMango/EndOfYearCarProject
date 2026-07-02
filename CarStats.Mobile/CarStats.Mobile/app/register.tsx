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
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { AddVehicleModal } from '@/components/AddVehicleModal';
import { Dashboard, Severity, SeveritySoft } from '@/constants/theme';

// Simple but solid email-format check (mirrors the backend MailAddress check)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Step = 'account' | 'verify' | 'vehicle';
const STEP_ORDER: Step[] = ['account', 'verify', 'vehicle'];
const STEP_LABELS = ['Account', 'Verify', 'Car'];

/** Outlined input with a floating label cut into the top border (Stitch style). */
function OutlinedField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.fieldOuter}>
      <View style={styles.fieldBox}>{children}</View>
      <Text style={styles.fieldLabel}>{label}</Text>
    </View>
  );
}

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
  const [code, setCode]           = useState('');
  const [resendMsg, setResendMsg] = useState<string | null>(null);

  // ── First-vehicle step ──
  const [newUserId, setNewUserId]  = useState<number | null>(null);
  const [addCarVisible, setAddCar] = useState(false);

  // ── Shared UI ──
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

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
        <Pressable style={styles.backCircle} onPress={handleBackHeader} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={22} color={Dashboard.textPrimary} />
        </Pressable>
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
              Enter your details to start managing your vehicle's health.
            </Text>

            <OutlinedField label="Full Name">
              <TextInput
                style={styles.fieldInput}
                placeholder="e.g. John Doe"
                placeholderTextColor={Dashboard.textSecondary}
                value={fullName}
                onChangeText={t => { setFullName(t); setError(null); }}
                autoCapitalize="words"
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
                editable={!loading}
              />
            </OutlinedField>

            <OutlinedField label="Email Address">
              <MaterialIcons name="mail-outline" size={20} color={Dashboard.textSecondary} />
              <TextInput
                ref={emailRef}
                style={styles.fieldInput}
                placeholder="name@example.com"
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
            </OutlinedField>

            <OutlinedField label="Password">
              <MaterialIcons name="lock-outline" size={20} color={Dashboard.textSecondary} />
              <TextInput
                ref={passRef}
                style={styles.fieldInput}
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
                <MaterialIcons
                  name={showPass ? 'visibility' : 'visibility-off'}
                  size={20}
                  color={Dashboard.textSecondary}
                />
              </Pressable>
            </OutlinedField>

            <OutlinedField label="Confirm Password">
              <MaterialIcons name="lock-outline" size={20} color={Dashboard.textSecondary} />
              <TextInput
                ref={confirmRef}
                style={styles.fieldInput}
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
                <MaterialIcons
                  name={showConfirm ? 'visibility' : 'visibility-off'}
                  size={20}
                  color={Dashboard.textSecondary}
                />
              </Pressable>
            </OutlinedField>

            {error && <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>}

            <Pressable
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : (
                  <View style={styles.buttonRow}>
                    <Text style={styles.buttonText}>Continue</Text>
                    <MaterialIcons name="arrow-forward" size={20} color="#fff" />
                  </View>
                )}
            </Pressable>

            <Pressable onPress={() => router.back()} style={styles.footerLink}>
              <Text style={styles.footerLinkText}>
                Already have an account?{'  '}
                <Text style={{ color: Dashboard.accent, fontWeight: '700' }}>Log in</Text>
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
              <Text style={{ color: Dashboard.textPrimary, fontWeight: '700' }}>{email}</Text>
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

            <Pressable
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleVerify}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify</Text>}
            </Pressable>

            <Pressable style={styles.footerLink} onPress={handleResend} disabled={loading}>
              <Text style={styles.footerLinkText}>
                Didn't get it?{'  '}
                <Text style={{ color: Dashboard.accent, fontWeight: '700' }}>Resend code</Text>
              </Text>
            </Pressable>
          </>
        )}

        {/* ─────────── STEP 3: first car ─────────── */}
        {step === 'vehicle' && (
          <View style={styles.successCard}>
            <View style={styles.successIconCircle}>
              <MaterialIcons name="directions-car" size={36} color={Dashboard.accent} />
            </View>
            <Text style={styles.successTitle}>Welcome aboard, {firstName}!</Text>
            <Text style={styles.successSub}>
              Add your first car to start tracking fuel economy and fault codes.
              You can always add more later.
            </Text>

            <Pressable style={[styles.button, { alignSelf: 'stretch' }]} onPress={() => setAddCar(true)}>
              <Text style={styles.buttonText}>Add My Car</Text>
            </Pressable>
            <Pressable style={styles.footerLink} onPress={goToApp}>
              <Text style={styles.footerLinkText}>Skip for now</Text>
            </Pressable>
          </View>
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
  root: { flex: 1, backgroundColor: Dashboard.bg },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  backCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Dashboard.card,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  backCircleSpacer: { width: 44 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '800',
    color: Dashboard.textPrimary,
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
    backgroundColor: Dashboard.cardBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepCircleActive: { backgroundColor: Dashboard.accentDeep },
  stepNum:          { fontSize: 14, fontWeight: '700', color: Dashboard.textSecondary },
  stepNumActive:    { color: '#fff' },
  stepLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Dashboard.textSecondary,
    marginTop: 6,
  },
  stepLabelActive: { color: Dashboard.accentDeep },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: Dashboard.cardBorder,
    marginTop: 17,
    marginHorizontal: 4,
  },
  stepLineActive: { backgroundColor: Dashboard.accentDeep },

  container: { flexGrow: 1, padding: 20, paddingTop: 12, paddingBottom: 48 },

  headline: {
    fontSize: 30,
    fontWeight: '800',
    color: Dashboard.textPrimary,
    letterSpacing: -0.5,
    marginTop: 8,
  },
  subhead: {
    fontSize: 16,
    color: Dashboard.textSecondary,
    lineHeight: 24,
    marginTop: 6,
    marginBottom: 18,
  },

  // Outlined fields with floating labels
  fieldOuter: { marginTop: 14 },
  fieldBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: Dashboard.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: 'transparent',
  },
  fieldLabel: {
    position: 'absolute',
    top: -9,
    left: 14,
    backgroundColor: Dashboard.bg,
    paddingHorizontal: 5,
    fontSize: 13,
    fontWeight: '700',
    color: Dashboard.textPrimary,
  },
  fieldInput: {
    flex: 1,
    color: Dashboard.textPrimary,
    fontSize: 16,
    paddingVertical: 16,
  },

  // Verify code
  codeInput: {
    backgroundColor: Dashboard.card,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Dashboard.accent + '66',
    color: Dashboard.textPrimary,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 8,
    paddingVertical: 18,
    marginTop: 10,
  },
  resendOk: { fontSize: 13, color: Severity.green, textAlign: 'center', marginTop: 10 },

  // Error
  errorBox: {
    backgroundColor: SeveritySoft.red,
    borderWidth: 1,
    borderColor: Severity.red + '55',
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
  },
  errorText: { color: Severity.red, fontSize: 13, lineHeight: 18 },

  // Button
  button: {
    backgroundColor: Dashboard.accentDeep,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
    shadowColor: Dashboard.accentDeep,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  buttonText:     { color: '#fff', fontWeight: '700', fontSize: 18 },

  footerLink:     { alignItems: 'center', marginTop: 20, paddingVertical: 6 },
  footerLinkText: { fontSize: 15, color: Dashboard.textSecondary },

  // Step 3
  successCard: {
    backgroundColor: Dashboard.card,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    marginTop: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  successIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Dashboard.accentSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Dashboard.textPrimary,
    textAlign: 'center',
  },
  successSub: {
    fontSize: 14,
    color: Dashboard.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 10,
    marginBottom: 8,
  },
});
