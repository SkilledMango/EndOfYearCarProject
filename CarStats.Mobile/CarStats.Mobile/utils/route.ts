// NOT_FOUND = הכתובת לא זוהתה, ZERO_RESULTS = אין מסלול
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
