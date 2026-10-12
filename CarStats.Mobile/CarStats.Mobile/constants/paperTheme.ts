import { MD3DarkTheme, MD3LightTheme, MD3Theme } from 'react-native-paper';
import { DarkColors, LightColors, ThemeColors } from './theme';

function toPaperTheme(base: MD3Theme, c: ThemeColors): MD3Theme {
  return {
    ...base,
    roundness: 12,
    colors: {
      ...base.colors,

      primary:            c.Dashboard.accent,
      onPrimary:          c.Dashboard.onAccent,
      primaryContainer:   c.Dashboard.accentSoft,
      onPrimaryContainer: c.Dashboard.accentDeep,

      secondary:            c.Dashboard.accent,
      onSecondary:          c.Dashboard.onAccent,
      secondaryContainer:   c.Dashboard.accentSoft,
      onSecondaryContainer: c.Dashboard.accentDeep,

      background:   c.Dashboard.bg,
      onBackground: c.Dashboard.textPrimary,
      surface:      c.Dashboard.card,
      onSurface:    c.Dashboard.textPrimary,

      surfaceVariant:   c.Fuel.chipBg,
      onSurfaceVariant: c.Dashboard.textSecondary,
      outline:          c.Dashboard.cardBorder,
      outlineVariant:   c.Dashboard.cardBorder,

      error:            c.Severity.red,
      onError:          c.Dashboard.onAccent,
      errorContainer:   c.SeveritySoft.red,
      onErrorContainer: c.Scan.errorDeep,

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
