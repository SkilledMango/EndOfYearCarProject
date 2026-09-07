/**
 * דיאלוגים שעובדים גם בדפדפן.
 *
 * React Native for Web לא מממש את Alert בכלל — הקריאה לא נכשלת ולא מדפיסה
 * כלום, פשוט לא קורה דבר. לכן כל כפתור שדורש אישור נראה שבור בדפדפן.
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
