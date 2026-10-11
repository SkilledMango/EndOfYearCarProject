/**
 * המיקום הנוכחי של הטלפון, לכל המסכים שצריכים אותו.
 *
 * באנדרואיד, כשהגדרת "דיוק מיקום" של גוגל כבויה, הבקשה מקפיצה חלון שמבקש
 * להדליק אותה. מי שעונה "לא תודה" מקבל שגיאה, גם כשה-GPS עצמו עובד מצוין.
 * לכן אחרי סירוב מנסים שוב דרך ה-GPS בלבד, בלי החלון, ולא מציקים שוב
 * באותה הפעלה של האפליקציה.
 */

import * as Location from 'expo-location';

/** GPS בלבד יכול לחכות הרבה בתוך מבנה; אחרי זה עדיף המיקום האחרון הידוע. */
const GPS_ONLY_TIMEOUT_MS = 10_000;

/** מיקום שנקלט בשתי הדקות האחרונות נחשב עדכני. */
const RECENT_FIX_MS = 2 * 60 * 1000;

let accuracyPromptDeclined = false;

// איתור: מיקום נוכחי של הטלפון
export async function getCurrentPosition(): Promise<Location.LocationObject> {
  if (!accuracyPromptDeclined) {
    try {
      return await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    } catch {
      accuracyPromptDeclined = true;
    }
  }

  // GPS בלבד איטי. מיקום מהדקות האחרונות טוב באותה מידה לחיפוש מוסך או
  // לתכנון נסיעה, ולכן אין סיבה לחכות לקליטה חדשה בכל לחיצה.
  const recent = await Location.getLastKnownPositionAsync({ maxAge: RECENT_FIX_MS }).catch(() => null);
  if (recent) return recent;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        mayShowUserSettingsDialog: false,
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('No GPS fix in time')), GPS_ONLY_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** לבדיקות בלבד: מחזיר את המצב של "המשתמש עוד לא סירב". */
export function resetAccuracyPromptForTests(): void {
  accuracyPromptDeclined = false;
}
