/**
 * CarStats theme tokens — single source of truth for colors used across the app.
 */

// CarStats "Soft Tech" light palette (from the Stitch design system).
// Token names kept from the old dark theme so every screen re-skins at once.
export const Dashboard = {
  bg: '#F1F1F9',          // page background — light cool lavender-grey
  card: '#FFFFFF',        // white surface cards
  cardBorder: '#E2E1ED',  // subtle card/input outline
  textPrimary: '#191B23', // near-black ink
  textSecondary: '#5B5F70',
  accent: '#1353D8',      // Engine Blue — buttons, active states
  accentDeep: '#003FB1',  // pressed / emphasis blue
  accentSoft: '#DBE1FF',  // light blue tint (icon chips, active tab pill)
};

// Israeli license-plate component colors (Stitch design)
export const Plate = {
  yellow: '#FFD700',
  border: '#191B23',
  tabBlue: '#1353D8',
};

// OBD-II severity colors — maps to SeverityLevel enum (Green=1, Yellow=2, Red=3)
// High-chroma but dark enough to stay readable on light surfaces.
export const Severity = {
  green: '#059669',   // Emerald — healthy / connected
  yellow: '#D97706',  // Warm amber — caution
  red: '#BA1A1A',     // Crimson — urgent
  unknown: '#6B7280',
};

// Soft tinted containers behind status content (design "containers")
export const SeveritySoft = {
  green: '#DEF7EC',
  yellow: '#FDF0DC',
  red: '#FFDAD6',
};

// Live-scan screen accents (Stitch live_scan export tokens)
export const Scan = {
  ringTrack: '#E7E7F3', // surface-container-high — progress ring background
  ringGlow: '#B5C4FF',  // primary-fixed-dim — decorative inner ring
  errorDeep: '#93000A', // on-error-container — text inside red fault chips
  amberInk: '#653E00',  // on-tertiary-fixed-variant — text on amber chips
  greenInk: '#005236',  // on-secondary-fixed-variant — text on green chips
};

// Fuel screen accents (Stitch fuel_tracking export tokens)
export const Fuel = {
  mintBar: '#4EDEA3',    // secondary-fixed-dim — hero card left accent bar
  trendGreen: '#006C49', // secondary — "% from last month" improving trend
  chipBg: '#EDEDF8',     // surface-container — circle chip behind pump icon
  gridLine: '#E2E1ED',   // surface-variant — chart grid lines
  axisLabel: '#737686',  // outline — chart Y-axis labels
  starAmber: '#FFB95F',  // tertiary-fixed-dim — mechanic rating star
};
