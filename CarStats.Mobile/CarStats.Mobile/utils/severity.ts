
import { ReportDtcResponse, SeverityLevel } from '@/services/api';
import { ThemeColors } from '@/constants/theme';

/** צבע הערכה לפי דרגת חומרה. חומרה לא ידועה מקבלת צהוב. */
export const severityColor = (c: ThemeColors, s: SeverityLevel | undefined): string => {
  switch (s) {
    case SeverityLevel.Green: return c.Severity.green;
    case SeverityLevel.Red:   return c.Severity.red;
    default:                  return c.Severity.yellow;
  }
};

/** תווית וצבע התג לפי דרגת חומרה. */
export const severityMeta = (c: ThemeColors, s: SeverityLevel | undefined) => {
  switch (s) {
    case SeverityLevel.Green: return { label: 'OK',       color: c.Severity.green };
    case SeverityLevel.Red:   return { label: 'CRITICAL', color: c.Severity.red };
    default:                  return { label: 'WARNING',  color: c.Severity.yellow };
  }
};

/** החומרה של תוצאת סריקה בודדת. קוד לא מוכר מקבל אזהרה. */
export const resultSeverity = (r: ReportDtcResponse): SeverityLevel =>
  (r.translation?.severity ?? r.severity ?? SeverityLevel.Yellow) as SeverityLevel;

/** החומרה הגבוהה ביותר בסריקה, או null אם לא נמצאו תקלות. */
export const worstSeverity = (results: ReportDtcResponse[]): SeverityLevel | null =>
  results.reduce<SeverityLevel | null>((worst, r) => {
    const s = resultSeverity(r);
    return worst == null || s > worst ? s : worst;
  }, null);
