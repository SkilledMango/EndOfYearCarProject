/**
 * מנהל את המשתמש המחובר בכל האפליקציה.
 * שומר את הסשן במכשיר, כך שהמשתמש נשאר מחובר גם אחרי סגירת האפליקציה.
 */

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppUser, AuthSession, api, getUser, setAuthToken } from '@/services/api';
import { clearPrefs, disableChildReminder } from '@/services/notifications';

// שם המפתח הוחלף כשהסשן קיבל טוקן: רשומה ישנה בלי טוקן כבר לא יכולה
// לפנות לשרת, ולכן היא נזרקת והמשתמש מתחבר פעם אחת מחדש.
const STORAGE_KEY = '@carstats_session';
const LEGACY_STORAGE_KEY = '@carstats_user';

// ─── טיפוסים ─────────────────────────────────────────────────────────────────

interface AuthContextValue {
  /** המשתמש המחובר, או null אם אין חיבור */
  user: AppUser | null;
  /** אמת בזמן שהאפליקציה בודקת אם קיים סשן שמור */
  isLoading: boolean;
  /**
   * התחברות עם מייל וסיסמה. זורקת הודעת שגיאה בכישלון.
   * אם החשבון קיים אך לא מאומת, נזרקת שגיאה עם הקוד EMAIL_NOT_VERIFIED
   * ונשלח קוד אימות חדש.
   */
  login: (email: string, password: string) => Promise<void>;
  /**
   * יוצרת חשבון חדש לא מאומת ושולחת מייל עם קוד.
   * לא פותחת סשן: קודם צריך לאמת את הקוד.
   */
  register: (fullName: string, email: string, password: string) => Promise<AppUser>;
  /** מאמתת את הקוד בן שש הספרות, ובהצלחה פותחת סשן. */
  verifyCode: (email: string, code: string) => Promise<AppUser>;
  /** שולחת קוד אימות חדש לכתובת שנמסרה. */
  resendCode: (email: string) => Promise<void>;
  /** מושכת מחדש את המשתמש מהשרת ומעדכנת את הסשן */
  refreshUser: () => Promise<void>;
  /** מנקה את הסשן ומחזירה למסך ההתחברות */
  logout: () => Promise<void>;
}

// ─── ההקשר ───────────────────────────────────────────────────────────────────

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

// ─── הספק ────────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]         = useState<AppUser | null>(null);
  const [isLoading, setLoading] = useState(true);
  // משקף אם יש טוקן פעיל, כדי שאפשר יהיה לקרוא אותו בתוך מיירט השגיאות
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

  // בטעינה הראשונה: שחזור הסשן מהאחסון
  useEffect(() => {
    (async () => {
      try {
        await AsyncStorage.removeItem(LEGACY_STORAGE_KEY); // סשנים ישנים מלפני הטוקנים
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
        // אחסון פגום — מתחילים מחדש
        await AsyncStorage.removeItem(STORAGE_KEY);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // טוקן שפג או בוטל גורם לכל קריאה לחזור עם 401, ואז חוזרים למסך
  // ההתחברות. נקודות ההתחברות עצמן פטורות: סיסמה שגויה צריכה להופיע
  // כשגיאה בטופס ולא כהתנתקות.
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

  // ── התחברות ──────────────────────────────────────────────────────────────
  const login = async (email: string, password: string) => {
    try {
      const { data } = await api.post<AuthSession>('/auth/login', { email, password });
      await startSession(data);
    } catch (err: any) {
      const status = err?.response?.status;

      // החשבון קיים אך לא מאומת, והשרת בדיוק שלח קוד חדש.
      // מסמנים למסך ההתחברות לעבור לשלב האימות.
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

  // ── הרשמה ────────────────────────────────────────────────────────────────
  const register = async (fullName: string, email: string, password: string) => {
    try {
      // יוצר חשבון לא מאומת ושולח את מייל האימות.
      // במכוון לא נפתח כאן סשן; זה קורה רק אחרי אימות הקוד.
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

  // ── אימות הקוד ───────────────────────────────────────────────────────────
  const verifyCode = async (email: string, code: string): Promise<AppUser> => {
    try {
      const { data } = await api.post<AuthSession>('/auth/verify-code', { email, code });
      await startSession(data);   // אומת — פותחים סשן
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

  // ── שליחת קוד חוזרת ──────────────────────────────────────────────────────
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

  // ── רענון המשתמש ─────────────────────────────────────────────────────────
  // מושך מחדש את המשתמש, למשל אחרי הוספת רכב, כדי שהסשן בזיכרון
  // ישקף את המצב העדכני בשרת.
  const refreshUser = async () => {
    if (!user) return;
    try {
      const fresh = await getUser(user.id);
      // הטוקן נשאר; רק תמונת המשתמש מתעדכנת
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      const token  = stored ? (JSON.parse(stored) as AuthSession).token : null;
      if (token) {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user: fresh }));
      }
      setUser(fresh);
    } catch {
      // תקלת רשת — משאירים את הסשן כמו שהוא
    }
  };

  // ── התנתקות ──────────────────────────────────────────────────────────────
  const logout = async () => {
    // הגדר הגיאוגרפית רשומה אצל מערכת ההפעלה ולא באחסון, ולכן היא שורדת
    // התנתקות והייתה מתריעה למשתמש הבא על הבית של מישהו אחר.
    // ניסיון בלבד: כישלון ניקוי לא יעצור את ההתנתקות.
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

// ─── הוק ─────────────────────────────────────────────────────────────────────

export function useAuth() {
  return useContext(AuthContext);
}
