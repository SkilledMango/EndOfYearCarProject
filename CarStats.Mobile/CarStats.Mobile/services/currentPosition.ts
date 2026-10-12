// אחרי 'לא תודה' לחלון דיוק המיקום: GPS בלבד, בלי לשאול שוב

import * as Location from 'expo-location';

const GPS_ONLY_TIMEOUT_MS = 10_000;

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

  // מיקום מהדקות האחרונות מספיק, בלי לחכות ל-GPS
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

export function resetAccuracyPromptForTests(): void {
  accuracyPromptDeclined = false;
}
