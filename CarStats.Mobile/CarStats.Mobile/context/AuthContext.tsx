import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppUser, AuthSession, api, getUser, setAuthToken } from '@/services/api';
import { clearPrefs, disableChildReminder } from '@/services/notifications';

const STORAGE_KEY = '@carstats_session';
const LEGACY_STORAGE_KEY = '@carstats_user';

interface AuthContextValue {
  user: AppUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (fullName: string, email: string, password: string) => Promise<AppUser>;
  verifyCode: (email: string, code: string) => Promise<AppUser>;
  resendCode: (email: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
}

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]         = useState<AppUser | null>(null);
  const [isLoading, setLoading] = useState(true);
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

  // איתור: שמירת ושחזור החיבור (סשן) באפליקציה
  useEffect(() => {
    (async () => {
      try {
        await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
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
        await AsyncStorage.removeItem(STORAGE_KEY);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 401 מטוקן שפג: חוזרים למסך ההתחברות (לא בנקודות ההתחברות עצמן)
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

  // איתור: התחברות באפליקציה
  const login = async (email: string, password: string) => {
    try {
      const { data } = await api.post<AuthSession>('/auth/login', { email, password });
      await startSession(data);
    } catch (err: any) {
      const status = err?.response?.status;

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

  // איתור: הרשמה באפליקציה
  const register = async (fullName: string, email: string, password: string) => {
    try {
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

  // איתור: אימות קוד מהמייל (אפליקציה)
  const verifyCode = async (email: string, code: string): Promise<AppUser> => {
    try {
      const { data } = await api.post<AuthSession>('/auth/verify-code', { email, code });
      await startSession(data);
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

  const refreshUser = async () => {
    if (!user) return;
    try {
      const fresh = await getUser(user.id);
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      const token  = stored ? (JSON.parse(stored) as AuthSession).token : null;
      if (token) {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user: fresh }));
      }
      setUser(fresh);
    } catch {
    }
  };

  // איתור: התנתקות
  const logout = async () => {
    // מבטלים את תזכורת המיקום בהתנתקות
    try {
      await disableChildReminder();
      await clearPrefs();
    } catch { /* ניסיון בלבד */ }

    await endSession();
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, verifyCode, resendCode, refreshUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
