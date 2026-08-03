/**
 * Google Directions status → driver-facing message.
 *
 * Regression guard: NOT_FOUND and ZERO_RESULTS used to share one message that
 * blamed the destination. ZERO_RESULTS actually means both ends were
 * understood but no drivable route joins them — which is what a device
 * reporting a position on another continent produces, and telling the user to
 * rewrite their address sends them chasing the wrong problem.
 */

import { routeErrorMessage } from '@/utils/route';

describe('routeErrorMessage', () => {
  it('blames the address only for NOT_FOUND', () => {
    expect(routeErrorMessage('NOT_FOUND')).toMatch(/destination not found/i);
  });

  it('points at the route, not the address, for ZERO_RESULTS', () => {
    const msg = routeErrorMessage('ZERO_RESULTS');
    expect(msg).toMatch(/no driving route/i);
    // The whole point of the fix: it must not tell the user their address is wrong.
    expect(msg).not.toMatch(/destination not found/i);
  });

  it('mentions the user location for ZERO_RESULTS', () => {
    // The realistic cause is a wrong or default GPS position, so the message
    // should send the user to check that rather than retype the address.
    expect(routeErrorMessage('ZERO_RESULTS')).toMatch(/location/i);
  });

  it('gives NOT_FOUND and ZERO_RESULTS different messages', () => {
    expect(routeErrorMessage('NOT_FOUND')).not.toBe(routeErrorMessage('ZERO_RESULTS'));
  });

  it('handles the quota and permission statuses without leaking the raw code', () => {
    expect(routeErrorMessage('OVER_QUERY_LIMIT')).not.toMatch(/OVER_QUERY_LIMIT/);
    expect(routeErrorMessage('REQUEST_DENIED')).not.toMatch(/REQUEST_DENIED/);
  });

  it('falls back to naming the status for anything unrecognised', () => {
    // An unknown status should still be diagnosable rather than silently generic.
    expect(routeErrorMessage('SOME_NEW_STATUS')).toMatch(/SOME_NEW_STATUS/);
  });

  it('never returns an empty message', () => {
    for (const s of ['NOT_FOUND', 'ZERO_RESULTS', 'REQUEST_DENIED', 'OVER_QUERY_LIMIT', 'INVALID_REQUEST', '']) {
      expect(routeErrorMessage(s).length).toBeGreaterThan(0);
    }
  });
});
