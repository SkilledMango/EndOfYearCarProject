/**
 * Severity helpers — these decide the colour and label a driver sees for a
 * fault code, and which code "wins" when a scan returns several. Getting the
 * fold wrong would show a green badge on a scan containing a critical fault.
 */

import { LightColors } from '@/constants/theme';
import { ReportDtcResponse, SeverityLevel } from '@/services/api';
import {
  resultSeverity,
  severityColor,
  severityMeta,
  worstSeverity,
} from '@/utils/severity';

const c = LightColors;

/** Minimal scan result carrying just the severity the helpers read. */
function result(severity?: SeverityLevel, viaTranslation = true): ReportDtcResponse {
  return (viaTranslation
    ? { status: 'Logged', translation: severity == null ? undefined : { severity } }
    : { status: 'Logged', severity }) as unknown as ReportDtcResponse;
}

describe('severityColor', () => {
  it('maps each known level to its palette colour', () => {
    expect(severityColor(c, SeverityLevel.Green)).toBe(c.Severity.green);
    expect(severityColor(c, SeverityLevel.Red)).toBe(c.Severity.red);
    expect(severityColor(c, SeverityLevel.Yellow)).toBe(c.Severity.yellow);
  });

  it('falls back to caution yellow for an unknown level', () => {
    // An unrecognised code must never render as green "all clear".
    expect(severityColor(c, undefined)).toBe(c.Severity.yellow);
  });
});

describe('severityMeta', () => {
  it('labels each known level', () => {
    expect(severityMeta(c, SeverityLevel.Green).label).toBe('OK');
    expect(severityMeta(c, SeverityLevel.Red).label).toBe('CRITICAL');
    expect(severityMeta(c, SeverityLevel.Yellow).label).toBe('WARNING');
  });

  it('labels an unknown level as a warning, not as OK', () => {
    expect(severityMeta(c, undefined).label).toBe('WARNING');
  });
});

describe('resultSeverity', () => {
  it('prefers the dictionary translation over the top-level severity', () => {
    const r = {
      status: 'Logged',
      severity: SeverityLevel.Green,
      translation: { severity: SeverityLevel.Red },
    } as unknown as ReportDtcResponse;
    expect(resultSeverity(r)).toBe(SeverityLevel.Red);
  });

  it('falls back to the top-level severity when there is no translation', () => {
    expect(resultSeverity(result(SeverityLevel.Red, false))).toBe(SeverityLevel.Red);
  });

  it('defaults an untranslated code to Yellow', () => {
    expect(resultSeverity(result(undefined))).toBe(SeverityLevel.Yellow);
  });
});

describe('worstSeverity', () => {
  it('returns null for an empty scan', () => {
    expect(worstSeverity([])).toBeNull();
  });

  it('returns the single severity when only one result', () => {
    expect(worstSeverity([result(SeverityLevel.Green)])).toBe(SeverityLevel.Green);
  });

  it('picks the most severe regardless of order', () => {
    const mixed = [
      result(SeverityLevel.Green),
      result(SeverityLevel.Red),
      result(SeverityLevel.Yellow),
    ];
    expect(worstSeverity(mixed)).toBe(SeverityLevel.Red);
    expect(worstSeverity([...mixed].reverse())).toBe(SeverityLevel.Red);
  });

  it('does not let a leading green mask a later critical fault', () => {
    // The reduce seeds from null, so a first-element Green must not win.
    expect(worstSeverity([result(SeverityLevel.Green), result(SeverityLevel.Red)]))
      .toBe(SeverityLevel.Red);
  });

  it('treats untranslated codes as Yellow when folding', () => {
    expect(worstSeverity([result(SeverityLevel.Green), result(undefined)]))
      .toBe(SeverityLevel.Yellow);
  });
});
