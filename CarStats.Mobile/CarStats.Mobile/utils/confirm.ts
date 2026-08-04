/**
 * דיאלוגים שעובדים גם בדפדפן.
 *
 * ספריית הרשת של ריאקט נייטיב לא מממשת את Alert בכלל: הקריאה לא נכשלת ולא
 * מדפיסה כלום — היא פשוט לא עושה דבר. לכן כפתור שמסתמך על אישור נראה שבור
 * לגמרי בדפדפן, כי הפעולה שלו רצה רק אחרי לחיצה על כפתור בדיאלוג שלא הופיע.
 */

import { Alert, Platform } from 'react-native';

/**
 * שואל אישור לפני פעולה הרסנית, ומריץ אותה רק אם המשתמש אישר.
 */
export function confirmDestructive(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void,
): void {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    if (globalThis.confirm?.(`${title}\n\n${message}`)) onConfirm();
    return;
  }

  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

/** מודיע למשתמש על משהו שקרה. הודעה בלבד, בלי בחירה. */
export function notify(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    globalThis.alert?.(message ? `${title}\n\n${message}` : title);
    return;
  }

  Alert.alert(title, message);
}
