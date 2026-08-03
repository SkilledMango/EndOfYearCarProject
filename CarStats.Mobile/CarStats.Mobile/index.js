/**
 * App entry point.
 *
 * Exists only so LogBox is configured before expo-router starts. expo-router
 * enumerates and loads every file under app/ itself, in its own order, so a
 * route module can pull in a noisy library before app/_layout.tsx has run —
 * which is why configuring LogBox inside the layout does not work.
 *
 * Everything here must run before `expo-router/entry`.
 */

import './utils/logbox';
import 'expo-router/entry';
