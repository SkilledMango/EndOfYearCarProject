/**
 * Shared severity helpers — the single place that maps SeverityLevel to
 * colors/labels and folds scan results down to their worst severity.
 * (Previously copy-pasted across the home, history, and scan-overlay screens.)
 */

import { ReportDtcResponse, SeverityLevel } from '@/services/api';
import { ThemeColors } from '@/constants/theme';

/** Theme color for a severity (unknown → caution yellow). */
export const severityColor = (c: ThemeColors, s: SeverityLevel | undefined): string => {
  switch (s) {
    case SeverityLevel.Green: return c.Severity.green;
    case SeverityLevel.Red:   return c.Severity.red;
    default:                  return c.Severity.yellow;
  }
};

/** Badge label + color for a severity. */
export const severityMeta = (c: ThemeColors, s: SeverityLevel | undefined) => {
  switch (s) {
    case SeverityLevel.Green: return { label: 'OK',       color: c.Severity.green };
    case SeverityLevel.Red:   return { label: 'CRITICAL', color: c.Severity.red };
    default:                  return { label: 'WARNING',  color: c.Severity.yellow };
  }
};

/** Severity of a single scan result (unknown codes default to WARNING). */
export const resultSeverity = (r: ReportDtcResponse): SeverityLevel =>
  (r.translation?.severity ?? r.severity ?? SeverityLevel.Yellow) as SeverityLevel;

/** Worst severity across a scan's results, or null for an empty scan. */
export const worstSeverity = (results: ReportDtcResponse[]): SeverityLevel | null =>
  results.reduce<SeverityLevel | null>((worst, r) => {
    const s = resultSeverity(r);
    return worst == null || s > worst ? s : worst;
  }, null);
