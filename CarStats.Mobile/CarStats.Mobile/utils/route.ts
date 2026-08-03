/**
 * Google Directions status handling for the trip planner.
 *
 * Lives here rather than in the screen so it can be tested without pulling in
 * navigation, auth and native storage.
 */

/**
 * Turns a Google Directions status into something a driver can act on.
 *
 * NOT_FOUND and ZERO_RESULTS are different failures and used to share a
 * message: NOT_FOUND means Google could not geocode the address, while
 * ZERO_RESULTS means both ends were understood but no drivable route joins
 * them. Blaming the address for the second one sends the user off rewriting a
 * destination that was never the problem — which is exactly what happens when
 * the phone reports a position on another continent.
 */
export function routeErrorMessage(status: string): string {
  switch (status) {
    case 'NOT_FOUND':
      return 'Destination not found. Try a more specific address.';
    case 'ZERO_RESULTS':
      return 'No driving route from your current location to that destination. Check that your location is correct.';
    case 'REQUEST_DENIED':
      return 'The route service rejected the request. Please try again later.';
    case 'OVER_QUERY_LIMIT':
      return 'Too many route lookups right now. Please try again in a minute.';
    case 'INVALID_REQUEST':
      return 'That destination could not be read. Try a different address.';
    default:
      return `Could not get route (${status}). Check your connection.`;
  }
}
