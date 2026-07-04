/**
 * AuthContext
 * Manages the logged-in user across the whole app.
 * Persists the session to AsyncStorage so the user stays logged in
 * after closing and reopening the app.
 */

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppUser, AuthSession, api, getUser, setAuthToken } from '@/services/api';

// Bumped from '@carstats_user' when sessions gained a JWT — old entries
// (a bare AppUser with no token) can't call the API anymore, so a stored
// session without a token is discarded and the user logs in again once.
const STORAGE_KEY = '@carstats_session';
const LEGACY_STORAGE_KEY = '@carstats_user';

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
  // Mirrors whether a token is active, readable inside the 401 interceptor
  const hasSession = useRef(false);

  const startSession = async (session: AuthSession) => {
    setAuthToken(session.token);
    hasSession.current = true;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    setUser(session.user);
  };

  const endSession = async () => {
    setAuthToken(null);
    hasSession.current = false;
    await AsyncStorage.removeItem(STORAGE_KEY);
    setUser(null);
  };

  // On first mount — restore session from storage
  useEffect(() => {
    (async () => {
      try {
        await AsyncStorage.removeItem(LEGACY_STORAGE_KEY); // pre-JWT sessions
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const session: AuthSession = JSON.parse(stored);
          if (session?.token && session?.user) {
            setAuthToken(session.token);
            hasSession.current = true;
            setUser(session.user);
          } else {
            await AsyncStorage.removeItem(STORAGE_KEY);
          }
        }
      } catch {
        // Corrupted storage — start fresh
        await AsyncStorage.removeItem(STORAGE_KEY);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Expired/revoked token → any API call comes back 401 → drop to the login
  // screen. Auth endpoints themselves are exempt (no session is active yet,
  // and a wrong password must surface as a form error, not a logout).
  useEffect(() => {
    const id = api.interceptors.response.use(
      (res) => res,
      async (err) => {
        if (err?.response?.status === 401 && hasSession.current) {
          await endSession();
        }
        throw err;
      },
    );
    return () => api.interceptors.response.eject(id);
  }, []);

  // ── login ────────────────────────────────────────────────────────────────
  const login = async (email: string, password: string) => {
    try {
      const { data } = await api.post<AuthSession>('/auth/login', { email, password });
      await startSession(data);
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
      const { data } = await api.post<AuthSession>('/auth/verify-code', { email, code });
      await startSession(data);   // verified → start the session
      return data.user;
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
      // Keep the existing token — only the user snapshot changes
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      const token  = stored ? (JSON.parse(stored) as AuthSession).token : null;
      if (token) {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user: fresh }));
      }
      setUser(fresh);
    } catch {
      // Network hiccup — keep the existing session as-is
    }
  };

  // ── logout ───────────────────────────────────────────────────────────────
  const logout = async () => {
    await endSession();
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
