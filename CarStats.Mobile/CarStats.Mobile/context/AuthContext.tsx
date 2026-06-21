/**
 * AuthContext
 * Manages the logged-in user across the whole app.
 * Persists the session to AsyncStorage so the user stays logged in
 * after closing and reopening the app.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppUser, api, getUser } from '@/services/api';

const STORAGE_KEY = '@carstats_user';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthContextValue {
  /** The currently logged-in user, or null if not logged in */
  user: AppUser | null;
  /** True while the app is checking AsyncStorage on first launch */
  isLoading: boolean;
  /**
   * Call with email + password. Throws a string error message on failure.
   * If the account exists but isn't verified, throws an error with
   * `code === 'EMAIL_NOT_VERIFIED'` and an `email` field (a fresh code is sent).
   */
  login: (email: string, password: string) => Promise<void>;
  /**
   * Creates a new account (unverified) and triggers a verification email.
   * Resolves with the new user but does NOT start a session — the user must
   * verify the emailed code via verifyCode() first.
   */
  register: (fullName: string, email: string, password: string) => Promise<AppUser>;
  /** Confirms the emailed 6-digit code; on success starts the session. */
  verifyCode: (email: string, code: string) => Promise<AppUser>;
  /** Sends a fresh verification code to the given email. */
  resendCode: (email: string) => Promise<void>;
  /** Re-fetches the current user from the API and updates the session */
  refreshUser: () => Promise<void>;
  /** Clears the session and returns to the login screen */
  logout: () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  login: async () => {},
  register: async () => ({} as AppUser),
  verifyCode: async () => ({} as AppUser),
  resendCode: async () => {},
  refreshUser: async () => {},
  logout: async () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]         = useState<AppUser | null>(null);
  const [isLoading, setLoading] = useState(true);

  // On first mount — restore session from storage
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) setUser(JSON.parse(stored));
      } catch {
        // Corrupted storage — start fresh
        await AsyncStorage.removeItem(STORAGE_KEY);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── login ────────────────────────────────────────────────────────────────
  const login = async (email: string, password: string) => {
    try {
      const { data } = await api.post<AppUser>('/auth/login', { email, password });
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      setUser(data);
    } catch (err: any) {
      const status = err?.response?.status;

      // Account exists but isn't verified — the API just emailed a fresh code.
      // Signal the login screen to route into the verification step.
      if (status === 403 && err?.response?.data?.code === 'EMAIL_NOT_VERIFIED') {
        const notVerified: any = new Error('EMAIL_NOT_VERIFIED');
        notVerified.code  = 'EMAIL_NOT_VERIFIED';
        notVerified.email = err.response.data.email ?? email;
        throw notVerified;
      }

      const message =
        status === 401
          ? 'Incorrect email or password.'
          : 'Could not reach the server. Check your connection.';
      throw new Error(message);
    }
  };

  // ── register ─────────────────────────────────────────────────────────────
  const register = async (fullName: string, email: string, password: string) => {
    try {
      // Creates the account as unverified and triggers the verification email.
      // We deliberately do NOT start a session here — verifyCode() does that.
      const { data } = await api.post<AppUser>('/auth/register', { fullName, email, password });
      return data;
    } catch (err: any) {
      const status = err?.response?.status;
      const message =
        status === 409 ? 'An account with that email already exists.' :
        status === 400 ? err.response.data :
        'Could not reach the server. Check your connection.';
      throw new Error(typeof message === 'string' ? message : 'Registration failed.');
    }
  };

  // ── verifyCode ───────────────────────────────────────────────────────────
  const verifyCode = async (email: string, code: string): Promise<AppUser> => {
    try {
      const { data } = await api.post<AppUser>('/auth/verify-code', { email, code });
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      setUser(data);   // verified → start the session
      return data;
    } catch (err: any) {
      const status = err?.response?.status;
      const message =
        status === 400 ? err.response.data :
        status === 404 ? 'No account found for that email.' :
        'Could not reach the server. Check your connection.';
      throw new Error(typeof message === 'string' ? message : 'Invalid or expired code.');
    }
  };

  // ── resendCode ───────────────────────────────────────────────────────────
  const resendCode = async (email: string): Promise<void> => {
    try {
      await api.post('/auth/resend-code', { email });
    } catch (err: any) {
      const status = err?.response?.status;
      const message =
        status === 400 ? err.response.data :
        'Could not reach the server. Check your connection.';
      throw new Error(typeof message === 'string' ? message : 'Could not resend the code.');
    }
  };

  // ── refreshUser ──────────────────────────────────────────────────────────
  // Re-fetches the logged-in user (e.g. after adding a vehicle) so the
  // in-memory session reflects the latest data from the server.
  const refreshUser = async () => {
    if (!user) return;
    try {
      const fresh = await getUser(user.id);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      setUser(fresh);
    } catch {
      // Network hiccup — keep the existing session as-is
    }
  };

  // ── logout ───────────────────────────────────────────────────────────────
  const logout = async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, verifyCode, resendCode, refreshUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth() {
  return useContext(AuthContext);
}
