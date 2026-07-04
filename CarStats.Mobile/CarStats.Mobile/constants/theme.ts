/**
 * CarStats theme tokens — single source of truth for colors used across the app.
 *
 * Two full palettes (light "Soft Tech" from the Stitch design system, plus a
 * derived dark variant). Screens never import palettes directly — they read
 * the active one through useTheme() / createThemedStyles() in
 * context/ThemeContext so the Dark Mode setting applies everywhere at once.
 */

export interface ThemeColors {
  Dashboard: {
    bg: string;            // page background
    card: string;          // surface cards
    cardBorder: string;    // subtle card/input outline
    textPrimary: string;   // ink
    textSecondary: string;
    accent: string;        // Engine Blue — buttons, active states
    accentDeep: string;    // pressed / emphasis blue (FABs, titles)
    accentSoft: string;    // light blue tint (icon chips, active tab pill)
    onAccent: string;      // text/icons sitting on accent surfaces
  };
  // OBD-II severity colors — maps to SeverityLevel enum (Green=1, Yellow=2, Red=3)
  Severity: { green: string; yellow: string; red: string; unknown: string };
  // Soft tinted containers behind status content (design "containers")
  SeveritySoft: { green: string; yellow: string; red: string };
  // Fuel screen accents (Stitch fuel_tracking export tokens)
  Fuel: {
    mintBar: string;    // hero card left accent bar
    trendGreen: string; // "% from last month" improving trend
    chipBg: string;     // circle chip behind pump icon / soft button bg
    gridLine: string;   // chart grid lines
    axisLabel: string;  // chart Y-axis labels / unit text
    starAmber: string;  // mechanic rating star
  };
  // Live-scan screen accents (Stitch live_scan export tokens)
  Scan: {
    ringTrack: string; // progress ring background
    ringGlow: string;  // decorative inner ring
    errorDeep: string; // text inside red fault chips
    amberInk: string;  // text on amber chips
    greenInk: string;  // text on green chips
  };
}

// ── Light — CarStats "Soft Tech" palette (from the Stitch design system) ──────
export const LightColors: ThemeColors = {
  Dashboard: {
    bg: '#F1F1F9',
    card: '#FFFFFF',
    cardBorder: '#E2E1ED',
    textPrimary: '#191B23',
    textSecondary: '#5B5F70',
    accent: '#1353D8',
    accentDeep: '#003FB1',
    accentSoft: '#DBE1FF',
    onAccent: '#FFFFFF',
  },
  Severity: { green: '#059669', yellow: '#D97706', red: '#BA1A1A', unknown: '#6B7280' },
  SeveritySoft: { green: '#DEF7EC', yellow: '#FDF0DC', red: '#FFDAD6' },
  Fuel: {
    mintBar: '#4EDEA3',
    trendGreen: '#006C49',
    chipBg: '#EDEDF8',
    gridLine: '#E2E1ED',
    axisLabel: '#737686',
    starAmber: '#FFB95F',
  },
  Scan: {
    ringTrack: '#E7E7F3',
    ringGlow: '#B5C4FF',
    errorDeep: '#93000A',
    amberInk: '#653E00',
    greenInk: '#005236',
  },
};

// ── Dark — Material-3-style dark mapping of the same seed colors ──────────────
export const DarkColors: ThemeColors = {
  Dashboard: {
    bg: '#121318',
    card: '#1D1F27',
    cardBorder: '#353849',
    textPrimary: '#E2E1ED',
    textSecondary: '#A6A9BA',
    accent: '#8FB0FF',
    accentDeep: '#B5C4FF',
    accentSoft: '#243367',
    onAccent: '#0B2E7F',
  },
  Severity: { green: '#4EDEA3', yellow: '#FFB95F', red: '#FFB4AB', unknown: '#8B90A0' },
  SeveritySoft: { green: '#0E3B2C', yellow: '#3F2D0C', red: '#571E1B' },
  Fuel: {
    mintBar: '#4EDEA3',
    trendGreen: '#4EDEA3',
    chipBg: '#262A38',
    gridLine: '#33364A',
    axisLabel: '#8B90A0',
    starAmber: '#FFB95F',
  },
  Scan: {
    ringTrack: '#262A38',
    ringGlow: '#39508F',
    errorDeep: '#FFB4AB',
    amberInk: '#FFDDB8',
    greenInk: '#6FDBB4',
  },
};

// Israeli license-plate component colors — a physical object, same in both themes
export const Plate = {
  yellow: '#FFD700',
  border: '#191B23',
  tabBlue: '#1353D8',
};
