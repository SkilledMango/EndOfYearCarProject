/**
 * הסבר מבוסס AI לקודים שאינם במילון שלנו.
 *
 * המילון מכסה את הקודים הגנריים הנפוצים, אבל קודים ייחודיים ליצרן מגיעים
 * לאלפים ומשתנים בין יצרן ליצרן. במקום להציג לנהג קוד עירום ו"עיין במדריך",
 * מתבקש כאן הסבר באותה שפה פשוטה שבה כתוב המילון.
 *
 * שתי מגבלות מכוונות:
 *  - לא מבקשים מחיר תיקון. מספר שגוי גרוע ממספר חסר, ומודל שפה לא יכול
 *    לדעת מחירי מוסכים בישראל לרכב מסוים.
 *  - התוצאה מסומנת תמיד בממשק כתוכן שנוצר ע"י AI, ולעולם לא מוצגת
 *    כרשומה מהמילון.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchWithTimeout } from './http';
import { SeverityLevel } from './api';

const GEMINI_API_KEY: string = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';

/**
 * המודלים מנוסים לפי הסדר. המכסה היומית בשכבה החינמית נספרת לכל מודל
 * בנפרד, ולכן מודל שני הוא מכסה נוספת אמיתית ולא ניסיון חוזר באותה מכסה
 * שכבר נגמרה.
 */
const GEMINI_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.0-flash'];

const modelUrl = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

/** מטמון ההסברים, כדי שכל קוד יעלה בקשה אחת בלבד אי פעם. */
const CACHE_PREFIX = '@carstats_dtc_ai_';

/** אמת כשהתשובה אומרת "נגמרה המכסה" ולא תקלה אמיתית. */
const isRateLimited = (status: number) => status === 429;

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

/**
 * מבקשת הסבר ממודל אחד.
 * מחזירה את ההסבר או את הסיבה לכישלון. מופרדת מהקורא כדי שהלוגיקה של
 * המעבר למודל אחר תישאר קריאה.
 */
async function askModel(
  model: string,
  code: string,
  prompt: string,
): Promise<AiLookupResult> {
  try {
    const res = await fetchWithTimeout(`${modelUrl(model)}?key=${GEMINI_API_KEY}`, 15000, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body:    JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          // מבקשים JSON ישירות במקום לחלץ אותו מטקסט חופשי, אחרת המודל
          // עוטף את האובייקט או מוסיף משפט לפניו, וזה הצליח רק לפעמים.
          responseMimeType: 'application/json',
          // מרווח בכוונה: חלק מהתקציב נשרף על חשיבה פנימית של המודל,
          // ואם הוא נגמר ה-JSON נחתך באמצע.
          maxOutputTokens: 800,
        },
      }),
    });

    if (isRateLimited(res.status)) {
      console.warn(`[dtcLookup] ${model} is out of quota`);
      return { ok: false, reason: 'rate-limited' };
    }
    if (!res.ok) {
      console.warn(`[dtcLookup] ${model} returned`, res.status);
      return { ok: false, reason: 'unavailable' };
    }

    const json = await res.json();
    const candidate = json?.candidates?.[0];
    const text: string = (candidate?.content?.parts?.[0]?.text ?? '').trim();

    if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
      console.warn('[dtcLookup] response did not finish cleanly:', candidate.finishReason);
    }
    if (!text || text.toLowerCase() === 'unknown') {
      console.warn('[dtcLookup] no usable answer for', code);
      return { ok: false, reason: 'unavailable' };
    }

    // בכל זאת סובלניים לטקסט מיותר: הבקשה ל-JSON הופכת את זה לנדיר ולא
    // לבלתי אפשרי, ותשובה חריגה אחת לא צריכה לאבד הסבר שהמודל כבר יצר.
    const open  = text.indexOf('{');
    const close = text.lastIndexOf('}');
    const jsonText = open >= 0 && close > open ? text.slice(open, close + 1) : text;

    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      console.warn('[dtcLookup] could not parse response:', text.slice(0, 120));
      return { ok: false, reason: 'unavailable' };
    }

    const humanTitle     = String(parsed.title ?? '').trim();
    const description    = String(parsed.description ?? '').trim();
    const actionRequired = String(parsed.action ?? '').trim();

    // חצי הסבר גרוע מכלום
    if (!humanTitle || !description) return { ok: false, reason: 'unavailable' };

    return {
      ok: true,
      cached: false,
      explanation: {
        humanTitle,
        description,
        actionRequired,
        severity: parseSeverity(String(parsed.severity ?? '')),
      },
    };
  } catch (err) {
    console.warn(`[dtcLookup] ${model} failed for ${code}:`, err);
    return { ok: false, reason: 'unavailable' };
  }
}

/**
 * מסבירה קוד תקלה בשפה פשוטה.
 *
 * התשובות נשמרות במטמון לצמיתות לכל קוד, ולכן תקלה עולה בקשה אחת בלבד.
 * זה קריטי: המכסה החינמית מוגבלת ליום, ובלי מטמון עצם הפתיחה החוזרת של
 * אותה תקלה הייתה שורפת אותה עד שההסברים מפסיקים לעבוד.
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

  if (!GEMINI_API_KEY) {
    // קורה גם כשהמפתח קיים ב-env. אבל Metro הגיש חבילה מהמטמון מלפני
    // שהוא נוסף, כי הערכים מוטמעים בזמן הבנייה.
    // הפתרון: הרצה מחדש עם npx expo start --clear
    console.warn('[dtcLookup] no Gemini key in this bundle');
    return { ok: false, reason: 'no-key' };
  }

  const carHint = vehicle
    ? ` on a ${vehicle.year} ${vehicle.make} ${vehicle.model}`
    : '';

  const prompt =
    `You are explaining an OBD-II diagnostic trouble code to a car owner who ` +
    `is not a mechanic. Explain code ${code}${carHint}.

` +
    `Reply as strict JSON with exactly these keys and nothing else:
` +
    `{"title": "...", "description": "...", "action": "...", "severity": "low|medium|high"}

` +
    `title: under 8 words, plain language, no jargon.
` +
    `description: 2 sentences on what is wrong and what the driver would notice.
` +
    `action: 1 sentence on what they should do and how urgently.
` +
    `severity: low if it can wait, medium if it should be booked in, high if ` +
    `driving on could be unsafe or cause damage.
` +
    `Do not mention prices. If you do not recognise the code, reply exactly: unknown`;

  let lastReason: AiFailureReason = 'unavailable';

  for (const model of GEMINI_MODELS) {
    const result = await askModel(model, code, prompt);
    if (result.ok) {
      await writeCache(code, result.explanation);
      return result;
    }
    lastReason = result.reason;
    // רק כישלון מכסה שווה ניסיון במודל אחר, כי המכסה שלו נספרת בנפרד.
    // כל שגיאה אחרת תיכשל פעמיים באותה צורה.
    if (result.reason !== 'rate-limited') break;
  }

  return { ok: false, reason: lastReason };
}
