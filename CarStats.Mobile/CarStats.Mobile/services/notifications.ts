/**
 * Notification preferences + the two notification features:
 *
 *  1. Fault scan alerts — a local notification when an OBD-II scan finds
 *     fault codes (fires from the scan flow on the home screen).
 *
 *  2. Child safety arrival reminder — a geofence around the user's saved
 *     home location; arriving there fires a "check the back seat" reminder
 *     even when the app is backgrounded (expo-location geofencing +
 *     expo-task-manager).
 *
 * Preferences persist in AsyncStorage and are edited on the Settings screen.
 * This module is imported from the root layout so the geofence task is
 * registered on every app launch, including background launches.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

const PREFS_KEY = '@carstats_notif_prefs';
const CHILD_REMINDER_TASK = 'carstats-child-reminder';
const HOME_RADIUS_METERS = 150;

export interface NotifPrefs {
  faultAlerts: boolean;
  childReminder: boolean;
  homeLat: number | null;
  homeLng: number | null;
}

export const DEFAULT_PREFS: NotifPrefs = {
  faultAlerts: false,
  childReminder: false,
  homeLat: null,
  homeLng: null,
};

// Show alerts even while the app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ─── Geofence task (module scope — must exist before the OS wakes us) ─────────

/**
 * The arrival reminder itself, separate from what triggers it.
 *
 * Split out so it can be fired directly as well as by the geofence. The
 * geofence needs background location, which Expo Go does not grant, so
 * without this the notification could not be seen at all without a
 * development build — and the notification is the part worth showing.
 */
export async function showChildReminderNotification(): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '👶 Arrived — check the back seat',
      body: "You've reached your saved location. Make sure no child or pet is left in the car.",
      sound: true,
    },
    trigger: null, // immediately
  });
}

TaskManager.defineTask(CHILD_REMINDER_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const { eventType } = data as { eventType: Location.GeofencingEventType };
  if (eventType === Location.GeofencingEventType.Enter) {
    await showChildReminderNotification();
  }
});

// ─── Preferences ───────────────────────────────────────────────────────────────

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
  } catch { /* storage unavailable — settings just won't survive a restart */ }
}

// ─── Permissions ───────────────────────────────────────────────────────────────

/** Ask for notification permission. Returns true when granted. */
export async function ensureNotifPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

// ─── Fault scan alerts ─────────────────────────────────────────────────────────

/** Fires a local notification summarizing a completed scan (if enabled). */
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
  } catch { /* notifications unavailable on this platform/runtime */ }
}

// ─── Child safety arrival reminder ─────────────────────────────────────────────

/**
 * Starts geofencing around the saved home location.
 * Requires notification + foreground + background location permissions;
 * throws with a user-readable message when something is missing.
 */
export async function enableChildReminder(lat: number, lng: number): Promise<void> {
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

  await Location.startGeofencingAsync(CHILD_REMINDER_TASK, [
    {
      latitude: lat,
      longitude: lng,
      radius: HOME_RADIUS_METERS,
      notifyOnEnter: true,
      notifyOnExit: false,
    },
  ]);
}

export async function disableChildReminder(): Promise<void> {
  try {
    const started = await Location.hasStartedGeofencingAsync(CHILD_REMINDER_TASK);
    if (started) await Location.stopGeofencingAsync(CHILD_REMINDER_TASK);
  } catch { /* task was never registered on this device */ }
}

/** Grabs the current position to save as "home" for the geofence. */
export async function captureHomeLocation(): Promise<{ lat: number; lng: number }> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') {
    throw new Error('Location permission is required to save your home location.');
  }
  const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { lat: loc.coords.latitude, lng: loc.coords.longitude };
}
