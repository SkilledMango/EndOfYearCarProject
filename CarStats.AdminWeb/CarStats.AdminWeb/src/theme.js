import { createTheme } from '@mui/material/styles';

/**
 * The admin panel's MUI theme, built from the same "Soft Tech" tokens the
 * mobile app uses in CarStats.Mobile/constants/theme.ts.
 *
 * Kept as literal values rather than imported: the two projects build
 * separately and share no package, so a copy with a pointer back to the
 * source is honest about the coupling. If a colour changes there, change it
 * here too — they are meant to look like one product.
 */

// ── CarStats Soft Tech palette (light) ───────────────────────────────────────
const Ink        = '#191B23';
const InkMuted   = '#5B5F70';
const Bg         = '#F1F1F9';
const Surface    = '#FFFFFF';
const Border     = '#E2E1ED';
const Accent     = '#1353D8';
const AccentDeep = '#003FB1';
const AccentSoft = '#DBE1FF';

const Green  = '#059669';
const Yellow = '#D97706';
const Red    = '#BA1A1A';

/**
 * Exported so components can reference the palette directly (charts and
 * severity chips need raw colour values, not MUI palette slots) without
 * inventing their own.
 */
export const Palette = {
  ink: Ink, inkMuted: InkMuted, bg: Bg, surface: Surface, border: Border,
  accent: Accent, accentDeep: AccentDeep, accentSoft: AccentSoft,
  green: Green, yellow: Yellow, red: Red,
  // Soft tints behind status content — the app's SeveritySoft tokens.
  greenSoft: '#DEF7EC', yellowSoft: '#FDF0DC', redSoft: '#FFDAD6',
};

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary:   { main: Accent, dark: AccentDeep, light: AccentSoft, contrastText: '#FFFFFF' },
    secondary: { main: AccentDeep },
    success:   { main: Green },
    warning:   { main: Yellow },
    error:     { main: Red },
    background: { default: Bg, paper: Surface },
    text:       { primary: Ink, secondary: InkMuted },
    divider: Border,
  },

  shape: { borderRadius: 12 },

  typography: {
    fontFamily: `'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif`,
    h5: { fontWeight: 800, letterSpacing: -0.3, color: Ink },
    h6: { fontWeight: 800, letterSpacing: -0.2, color: Ink },
    h3: { fontWeight: 800, letterSpacing: -0.5 },
    button: { fontWeight: 700, textTransform: 'none', letterSpacing: 0.2 },
    body2: { color: InkMuted },
  },

  components: {
    // Flat, outlined surfaces — the app has no drop shadows on cards, and
    // matching that is most of what makes the two look like one product.
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          border: `1px solid ${Border}`,
          backgroundImage: 'none',
        },
      },
    },

    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'inherit' },
      styleOverrides: {
        root: {
          backgroundColor: Surface,
          borderBottom: `1px solid ${Border}`,
          borderLeft: 'none',
          borderRight: 'none',
          borderTop: 'none',
        },
      },
    },

    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root:     { borderRadius: 10, paddingInline: 18, paddingBlock: 8 },
        containedPrimary: {
          backgroundColor: AccentDeep,
          '&:hover': { backgroundColor: Accent },
        },
      },
    },

    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 700,
          fontSize: 14,
          color: InkMuted,
          '&.Mui-selected': { color: Accent },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: { height: 3, borderRadius: 3, backgroundColor: Accent },
      },
    },

    // Table headers in the app's uppercase micro-label idiom.
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          color: InkMuted,
          backgroundColor: Bg,
          borderBottom: `1px solid ${Border}`,
        },
        root: { borderBottom: `1px solid ${Border}` },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: { '&:last-child td': { borderBottom: 'none' } },
      },
    },

    MuiTextField: { defaultProps: { size: 'small' } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          backgroundColor: Surface,
          '& fieldset': { borderColor: Border },
          '&:hover fieldset': { borderColor: Accent },
        },
      },
    },

    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 700, borderRadius: 6 },
      },
    },

    MuiDialog: {
      styleOverrides: { paper: { borderRadius: 16 } },
    },

    MuiAlert: {
      styleOverrides: { root: { borderRadius: 10 } },
    },
  },
});

export default theme;
