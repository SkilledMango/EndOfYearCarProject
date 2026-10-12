// איתור: צבעי האפליקציה
export interface ThemeColors {
  Dashboard: {
    bg: string;
    card: string;
    cardBorder: string;
    textPrimary: string;
    textSecondary: string;
    accent: string;
    accentDeep: string;
    accentSoft: string;
    onAccent: string;
  };
  // צבעי דרגות החומרה, מקבילים ל-SeverityLevel בשרת
  Severity: { green: string; yellow: string; red: string; unknown: string };
  SeveritySoft: { green: string; yellow: string; red: string };
  Fuel: {
    mintBar: string;
    trendGreen: string;
    chipBg: string;
    gridLine: string;
    axisLabel: string;
    starAmber: string;
  };
  Scan: {
    ringTrack: string;
    ringGlow: string;
    errorDeep: string;
    amberInk: string;
    greenInk: string;
  };
}

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

export const Plate = {
  yellow: '#FFD700',
  border: '#191B23',
  tabBlue: '#1353D8',
};
