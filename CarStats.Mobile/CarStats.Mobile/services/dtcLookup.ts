/**
 * הסבר מבוסס AI לקודים שאינם במילון שלנו.
 *
 * המילון מכסה את הקודים הגנריים הנפוצים, אבל קודים ייחודיים ליצרן מגיעים
 * לאלפים ומשתנים בין יצרן ליצרן. במקום להציג לנהג קוד עירום ו"עיין במדריך",
 * מתבקש כאן הסבר באותה שפה פשוטה שבה כתוב המילון.
 *
 * השאלה עצמה נשאלת בשרת (Groq ואז Gemini), שגם שומר כל תשובה במטמון.
 * כאן נשאר רק מטמון מקומי שחוסך את הפנייה לשרת לגמרי.
 *
 * שתי מגבלות מכוונות:
 *  - לא מבקשים מחיר תיקון. מספר שגוי גרוע ממספר חסר, ומודל שפה לא יכול
 *    לדעת מחירי מוסכים בישראל לרכב מסוים.
 *  - התוצאה מסומנת תמיד בממשק כתוכן שנוצר ע"י AI, ולעולם לא מוצגת
 *    כרשומה מהמילון.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { SeverityLevel, explainFaultCode } from './api';

/** מטמון ההסברים, כדי שכל קוד יעלה בקשה אחת בלבד אי פעם. */
const CACHE_PREFIX = '@carstats_dtc_ai_';

export interface AiFaultExplanation {
  humanTitle:     string;
  description:    string;
  actionRequired: string;
  severity:       SeverityLevel;
}

/** למה לא חזר הסבר, כדי שהמסך יוכל להגיד משהו מדויק. */
export type AiFailureReason = 'no-key' | 'rate-limited' | 'unavailable';

export type AiLookupResult =
  | { ok: true;  explanation: AiFaultExplanation; cached: boolean }
  | { ok: false; reason: AiFailureReason };

async function readCache(code: string): Promise<AiFaultExplanation | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + code.toUpperCase());
    return raw ? (JSON.parse(raw) as AiFaultExplanation) : null;
  } catch {
    return null;
  }
}

async function writeCache(code: string, value: AiFaultExplanation): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_PREFIX + code.toUpperCase(), JSON.stringify(value));
  } catch { /* האחסון מלא — ההסבר פשוט יעלה בקשה נוספת בפעם הבאה */ }
}

/** ממפה את מילת החומרה שהמודל החזיר לדרגות שלנו. ברירת המחדל היא אזהרה. */
function parseSeverity(word: string): SeverityLevel {
  const w = word.trim().toLowerCase();
  if (w.startsWith('low'))  return SeverityLevel.Green;
  if (w.startsWith('high')) return SeverityLevel.Red;
  // כל ערך לא מוכר הופך לאזהרה. לעולם לא "הכול תקין" בשקט.
  return SeverityLevel.Yellow;
}

/** מתרגם שגיאה מהשרת לאחת משלוש הסיבות שהמסך יודע להציג. */
function failureReason(err: any): AiFailureReason {
  const reason = err?.response?.data?.reason;
  if (reason === 'no-key' || reason === 'rate-limited') return reason;
  return 'unavailable';
}

/**
 * מסבירה קוד תקלה בשפה פשוטה.
 *
 * לעולם לא זורקת שגיאה — ההסבר הוא תוספת מעל המילון, וכישלון שלו חייב
 * להשאיר את המסך שמיש.
 */
export async function explainFaultWithAi(
  code: string,
  vehicle?: { make: string; model: string; year: number },
): Promise<AiLookupResult> {
  if (!code) return { ok: false, reason: 'unavailable' };

  const cached = await readCache(code);
  if (cached) return { ok: true, explanation: cached, cached: true };

  try {
    const data = await explainFaultCode(code, vehicle);
    const explanation: AiFaultExplanation = {
      humanTitle:     data.title,
      description:    data.description,
      actionRequired: data.action,
      severity:       parseSeverity(data.severity ?? ''),
    };
    await writeCache(code, explanation);
    return { ok: true, explanation, cached: false };
  } catch (err) {
    console.warn('[dtcLookup] server could not explain', code, err);
    return { ok: false, reason: failureReason(err) };
  }
}
