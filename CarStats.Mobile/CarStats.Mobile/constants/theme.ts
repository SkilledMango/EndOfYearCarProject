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
