/**
 * AuthContext
 * Manages the logged-in user across the whole app.
 * Persists the session to AsyncStorage so the user stays logged in
 * after closing and reopening the app.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppUser, api } from '@/services/api';

const STORAGE_KEY = '@carstats_user';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthContextValue {
  /** The currently logged-in user, or null if not logged in */
  user: AppUser | null;
  /** True while the app is checking AsyncStorage on first launch */
  isLoading: boolean;
  /** Call with email + password — throws a string error message on failure */
  login: (email: string, password: string) => Promise<void>;
  /** Creates a new account and logs in automatically */
  register: (fullName: string, email: string, password: string) => Promise<void>;
  /** Clears the session and returns to the login screen */
  logout: () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  login: async () => {},
  register: async () => {},
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
      // Surface a readable message to the login screen
      const message =
        err?.response?.status === 401
          ? 'Incorrect email or password.'
          : 'Could not reach the server. Check your connection.';
      throw new Error(message);
    }
  };

  // ── register ─────────────────────────────────────────────────────────────
  const register = async (fullName: string, email: string, password: string) => {
    try {
      const { data } = await api.post<AppUser>('/auth/register', { fullName, email, password });
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      setUser(data);
    } catch (err: any) {
      const status = err?.response?.status;
      const message =
        status === 409 ? 'An account with that email already exists.' :
        status === 400 ? err.response.data :
        'Could not reach the server. Check your connection.';
      throw new Error(message);
    }
  };

  // ── logout ───────────────────────────────────────────────────────────────
  const logout = async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth() {
  return useContext(AuthContext);
}
