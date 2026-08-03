/**
 * LogBox configuration, applied by importing this module.
 *
 * It lives in its own file purely for ordering: ES imports are hoisted and
 * evaluated before any statement in the importing module's body, so calling
 * LogBox.ignoreLogs() inside app/_layout.tsx would run *after* the libraries
 * it needs to precede. Importing this first makes it run first.
 */

import { LogBox } from 'react-native';

// expo-notifications registers a push-token listener the moment it loads, and
// in Expo Go on Android that prints a full-screen red error saying remote push
// was removed in SDK 53. That is a statement about Expo Go, not a fault in this
// app: our notifications are local (scan alerts, the arrival reminder) and work
// normally, and remote push works in a development build.
//
// Hidden so the first thing on screen at launch is the app rather than a red
// box. LogBox exists only in development, so this changes nothing in a release
// build, and it matches one exact message rather than silencing errors broadly.
LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications (remote notifications)',
]);
