/**
 * מתרגם את ערכת הצבעים שלנו לספריית react-native-paper.
 *
 * רכיבי Paper קוראים צבעים מערכת נושא משלהם ולא מהטוקנים שלנו, ולכן בלי
 * הקובץ הזה כל כפתור היה נצבע בסגול ברירת המחדל ונראה כמו אפליקציה אחרת.
 * זה המקום היחיד שבו התרגום קורה; המסכים ממשיכים להשתמש ב-useTheme כרגיל.
 */

import { MD3DarkTheme, MD3LightTheme, MD3Theme } from 'react-native-paper';
import { DarkColors, LightColors, ThemeColors } from './theme';

function toPaperTheme(base: MD3Theme, c: ThemeColors): MD3Theme {
  return {
    ...base,
    // הכרטיסים והשדות שלנו מעוגלים יותר מברירת המחדל של Paper
    roundness: 12,
    colors: {
      ...base.colors,

      primary:            c.Dashboard.accent,
      onPrimary:          c.Dashboard.onAccent,
      primaryContainer:   c.Dashboard.accentSoft,
      onPrimaryContainer: c.Dashboard.accentDeep,

      // אין בפלטה שלנו צבע משני נפרד, ולכן נעשה שימוש חוזר בצבע הראשי
      // כדי ש-Paper לא ייפול לסגול שלו
      secondary:            c.Dashboard.accent,
      onSecondary:          c.Dashboard.onAccent,
      secondaryContainer:   c.Dashboard.accentSoft,
      onSecondaryContainer: c.Dashboard.accentDeep,

      background:   c.Dashboard.bg,
      onBackground: c.Dashboard.textPrimary,
      surface:      c.Dashboard.card,
      onSurface:    c.Dashboard.textPrimary,

      // משטח משני: טקסט משני ומסגרות שדות
      surfaceVariant:   c.Fuel.chipBg,
      onSurfaceVariant: c.Dashboard.textSecondary,
      outline:          c.Dashboard.cardBorder,
      outlineVariant:   c.Dashboard.cardBorder,

      error:            c.Severity.red,
      onError:          c.Dashboard.onAccent,
      errorContainer:   c.SeveritySoft.red,
      onErrorContainer: c.Scan.errorDeep,

      // Paper צובע משטחים מוגבהים בגוון הצבע הראשי. הכרטיסים שלנו שטוחים
      // בכוונה, ולכן כל רמות ההגבהה נשארות בצבע הכרטיס
      elevation: {
        level0: 'transparent',
        level1: c.Dashboard.card,
        level2: c.Dashboard.card,
        level3: c.Dashboard.card,
        level4: c.Dashboard.card,
        level5: c.Dashboard.card,
      },
    },
  };
}

export const PaperLightTheme = toPaperTheme(MD3LightTheme, LightColors);
export const PaperDarkTheme  = toPaperTheme(MD3DarkTheme,  DarkColors);
