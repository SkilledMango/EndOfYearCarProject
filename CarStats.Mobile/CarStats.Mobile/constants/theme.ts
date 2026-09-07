/**
 * צבעי האפליקציה — המקור היחיד לכל צבע במערכת.
 *
 * שתי ערכות מלאות: בהירה מהעיצוב המקורי, וכהה שנגזרת ממנה. מסכים לעולם
 * לא מייבאים ערכה ישירות אלא קוראים את הפעילה דרך ThemeContext, וכך
 * מתג המצב הכהה משנה את כל האפליקציה בבת אחת.
 */

export interface ThemeColors {
  Dashboard: {
    bg: string;            // רקע הדף
    card: string;          // כרטיסים
    cardBorder: string;    // מסגרת עדינה לכרטיס ולשדה קלט
    textPrimary: string;   // טקסט ראשי
    textSecondary: string;
    accent: string;        // הכחול הראשי: כפתורים ומצבים פעילים
    accentDeep: string;    // כחול כהה יותר ללחיצה ולהדגשה
    accentSoft: string;    // גוון בהיר לרקע אייקונים וטאב פעיל
    onAccent: string;      // טקסט ואייקונים על גבי הצבע הראשי
  };
  // צבעי דרגות החומרה, מקבילים ל-SeverityLevel בשרת
  Severity: { green: string; yellow: string; red: string; unknown: string };
  // רקעים רכים לכרטיסי מצב
  SeveritySoft: { green: string; yellow: string; red: string };
  // צבעי מסך הדלק
  Fuel: {
    mintBar: string;    // פס ההדגשה בכרטיס העליון
    trendGreen: string; // מגמת שיפור מול החודש הקודם
    chipBg: string;     // עיגול רקע לאייקון ולכפתור רך
    gridLine: string;   // קווי הרשת בגרף
    axisLabel: string;  // תוויות ציר וטקסט יחידות
    starAmber: string;  // כוכב הדירוג של מוסך
  };
  // צבעי מסך הסריקה
  Scan: {
    ringTrack: string; // רקע טבעת ההתקדמות
    ringGlow: string;  // הטבעת הפנימית הדקורטיבית
    errorDeep: string; // טקסט בתגי תקלה אדומים
    amberInk: string;  // טקסט בתגים כתומים
    greenInk: string;  // טקסט בתגים ירוקים
  };
}

// ── ערכה בהירה — הפלטה מהעיצוב המקורי ──────────────────────────────────────
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

// ── ערכה כהה — אותם צבעי בסיס במיפוי כהה ───────────────────────────────────
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

// צבעי לוחית הרישוי הישראלית. עצם פיזי, ולכן זהה בשתי הערכות.
export const Plate = {
  yellow: '#FFD700',
  border: '#191B23',
  tabBlue: '#1353D8',
};
