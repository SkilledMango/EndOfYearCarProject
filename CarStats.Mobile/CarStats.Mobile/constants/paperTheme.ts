/**
 * Bridges the CarStats "Soft Tech" palette into react-native-paper.
 *
 * Paper components (Button, TextInput, Card, Switch…) read their colors from
 * an MD3 theme rather than from our tokens, so without this they would render
 * in Paper's stock purple and look like a different app. This file is the one
 * place that translation happens: screens keep using useTheme() from
 * ThemeContext exactly as before, and Paper components come out matching.
 *
 * The mapping is close to 1:1 because our palette was already built on
 * Material-3 role names — accent is primary, accentSoft is the container
 * tint, onAccent is what sits on top of accent.
 */

import { MD3DarkTheme, MD3LightTheme, MD3Theme } from 'react-native-paper';
import { DarkColors, LightColors, ThemeColors } from './theme';

function toPaperTheme(base: MD3Theme, c: ThemeColors): MD3Theme {
  return {
    ...base,
    // Our cards and inputs are 12–14pt rounded; Paper's default is tighter.
    roundness: 12,
    colors: {
      ...base.colors,

      primary:            c.Dashboard.accent,
      onPrimary:          c.Dashboard.onAccent,
      primaryContainer:   c.Dashboard.accentSoft,
      onPrimaryContainer: c.Dashboard.accentDeep,

      // No separate secondary in our palette — reuse the accent family so
      // Paper never falls back to its stock purple.
      secondary:            c.Dashboard.accent,
      onSecondary:          c.Dashboard.onAccent,
      secondaryContainer:   c.Dashboard.accentSoft,
      onSecondaryContainer: c.Dashboard.accentDeep,

      background:   c.Dashboard.bg,
      onBackground: c.Dashboard.textPrimary,
      surface:      c.Dashboard.card,
      onSurface:    c.Dashboard.textPrimary,

      // Surface variant carries our secondary ink and input outlines.
      surfaceVariant:   c.Fuel.chipBg,
      onSurfaceVariant: c.Dashboard.textSecondary,
      outline:          c.Dashboard.cardBorder,
      outlineVariant:   c.Dashboard.cardBorder,

      error:            c.Severity.red,
      onError:          c.Dashboard.onAccent,
      errorContainer:   c.SeveritySoft.red,
      onErrorContainer: c.Scan.errorDeep,

      // Paper tints elevated surfaces by blending in primary. Our cards are
      // flat by design, so every elevation level stays the card color.
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
