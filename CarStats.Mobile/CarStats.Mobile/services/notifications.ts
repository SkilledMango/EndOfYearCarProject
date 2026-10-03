/**
 * העדפות ההתראות ושתי תכונות ההתראה:
 *
 *  1. התראת סריקה — התראה מקומית כשסריקה מוצאת קודי תקלה.
 *
 *  2. תזכורת בטיחות ילדים — גדר גיאוגרפית סביב הבית ומקום העבודה השמורים.
 *     הגעה לאחד מהם מפעילה תזכורת "בדוק את המושב האחורי" גם כשהאפליקציה סגורה.
 *
 * ההעדפות נשמרות במכשיר ונערכות במסך ההגדרות. הקובץ מיובא מהפריסה הראשית
 * כדי שהגדר תירשם מחדש בכל הפעלה, כולל הפעלה ברקע.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { ReminderPlace, placeFromRegion } from '@/utils/reminderRegions';

const PREFS_KEY = '@carstats_notif_prefs';
const CHILD_REMINDER_TASK = 'carstats-child-reminder';

export interface NotifPrefs {
  faultAlerts: boolean;
  childReminder: boolean;
  homeLat: number | null;
  homeLng: number | null;
  /**
   * כתובת הבית כפי שהמשתמש היה מתאר אותה, למשל "אגמון 13, חדרה".
   * הגדר צריכה קואורדינטות, אבל אף אחד לא רוצה לקרוא אותן.
   * null עבור בתים שנשמרו לפני שהשדה הזה נוסף, ולכן הממשק חייב להתמודד
   * עם היעדרו.
   */
  homeLabel: string | null;
  /** מקום העבודה — עיגול שני לתזכורת. null כשלא נשמר. */
  workLat: number | null;
  workLng: number | null;
  workLabel: string | null;
}

export const DEFAULT_PREFS: NotifPrefs = {
  faultAlerts: false,
  childReminder: false,
  homeLat: null,
  homeLng: null,
  homeLabel: null,
  workLat: null,
  workLng: null,
  workLabel: null,
};

// להציג התראות גם כשהאפליקציה פתוחה
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});


const ARRIVED_TITLE: Record<ReminderPlace, string> = {
  home: '👶 Arrived home — check the back seat',
  work: '👶 Arrived at work — check the back seat',
};

/** place אומר לאן הגעת; בלי place — הנוסח הכללי של עיגולים ישנים. */
export async function showChildReminderNotification(place?: ReminderPlace | null): Promise<void> {
  // פונקציה מוכנה של ספריית ההתראות: בונה את ההתראה מהתוכן שנתנו לה
  await Notifications.scheduleNotificationAsync({
    content: {
      title: place ? ARRIVED_TITLE[place] : '👶 Arrived — check the back seat',
      body: "You've reached your saved location. Make sure no child or pet is left in the car.",
      sound: true,
    },
    trigger: null, // להציג מיד, בלי תזמון
  });
}
// מגדיר את הפונקציה ככה שהיא תעבוד גם כשהאפליקציה סגורה (מערכת ההפעלה עוקבת אחרי המיקום)
TaskManager.defineTask(CHILD_REMINDER_TASK, async ({ data, error }) => {
  if (error || !data) return;
  // סוג האירוע שקרה (כניסה או יציאה), ולאיזה עיגול — בית או עבודה
  const { eventType, region } = data as { eventType: Location.GeofencingEventType; region?: Location.LocationRegion };
  if (eventType === Location.GeofencingEventType.Enter) { // רק בכניסה לעיגול, לא ביציאה ממנו
    await showChildReminderNotification(placeFromRegion(region?.identifier));
  }
});

// ─── העדפות ──────────────────────────────────────────────────────────────────

export async function loadPrefs(): Promise<NotifPrefs> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function savePrefs(prefs: NotifPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch { /* האחסון לא זמין — ההגדרות פשוט לא ישרדו הפעלה מחדש */ }
}

// ─── הרשאות ──────────────────────────────────────────────────────────────────

export async function clearPrefs(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PREFS_KEY);
  } catch { /* הכתיבה הבאה תדרוס את זה בלאו הכי */ }
}

/** מבקש הרשאת התראות. מחזיר אמת כשההרשאה ניתנה. */
export async function ensureNotifPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

// ─── התראות סריקה ────────────────────────────────────────────────────────────

/** שולחת התראה מקומית שמסכמת סריקה שהסתיימה, אם ההתראות מופעלות. */
export async function sendFaultAlert(faultCount: number, worstLabel: string) {
  const prefs = await loadPrefs();
  if (!prefs.faultAlerts) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: faultCount === 1 ? '1 fault code found' : `${faultCount} fault codes found`,
        body: `Worst severity: ${worstLabel}. Open CarStats for details and repair estimates.`,
        sound: true,
      },
      trigger: null,
    });
  } catch { /* התראות לא זמינות בסביבה הזו */ }
}

// ─── תזכורת בטיחות ילדים ─────────────────────────────────────────────────────

/**
 * מתחיל מעקב אחר העיגולים — הבית, העבודה או שניהם (ראו reminderRegions).
 * קריאה חוזרת מחליפה את העיגולים הקודמים, כך שאותה פונקציה גם מעדכנת.
 * דורש שלוש הרשאות: התראות, מיקום רגיל ומיקום ברקע
 */
export async function enableChildReminder(regions: Location.LocationRegion[]): Promise<void> {
  if (regions.length === 0) {
    throw new Error('Save a home or work location first.');
  }
  if (!(await ensureNotifPermission())) {
    throw new Error('Notification permission is required for the reminder.');
  }
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') {
    throw new Error('Location permission is required to detect arrival.');
  }
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') {
    throw new Error(
      "Background location is required so the reminder works while driving. On Android choose 'Allow all the time'.",
    );
  }

  // מערכת ההפעלה עוקבת אחרי העיגולים והפונקציה למעלה תופעל כשנכנסים לאחד מהם
  await Location.startGeofencingAsync(CHILD_REMINDER_TASK, regions);
}

export async function disableChildReminder(): Promise<void> {
  try {
    const started = await Location.hasStartedGeofencingAsync(CHILD_REMINDER_TASK);
    if (started) await Location.stopGeofencingAsync(CHILD_REMINDER_TASK);
  } catch { /* המשימה מעולם לא נרשמה במכשיר הזה */ }
}

/** לוקח את המיקום הנוכחי כדי לשמור אותו כבית או כעבודה עבור הגאופנס. */
export async function captureCurrentLocation(): Promise<{ lat: number; lng: number }> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') {
    throw new Error('Location permission is required to save this location.');
  }
  try {
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: loc.coords.latitude, lng: loc.coords.longitude };
  } catch {
    // באנדרואיד הבקשה נכשלת כשהגדרת "דיוק מיקום" כבויה, גם כשהטלפון יודע
    // איפה הוא. המיקום האחרון הידוע (עד 10 דקות) מספיק כדי לשמור כתובת.
    const last = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60 * 1000 }).catch(() => null);
    if (last) return { lat: last.coords.latitude, lng: last.coords.longitude };
    throw new Error('Your location is not available right now. Turn location on, or type the address instead.');
  }
}
