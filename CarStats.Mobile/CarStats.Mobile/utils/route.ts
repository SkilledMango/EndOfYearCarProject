/**
 * טיפול בסטטוסים של Google Directions עבור מתכנן הנסיעה.
 *
 * יושב כאן ולא במסך, כדי שאפשר יהיה לבדוק אותו בלי ניווט, אימות ואחסון.
 */

/**
 * מתרגמת סטטוס של Google Directions להודעה שהנהג יכול לפעול לפיה.
 *
 * NOT_FOUND ו-ZERO_RESULTS הן תקלות שונות: הראשונה אומרת שהכתובת לא זוהתה,
 * והשנייה שאין מסלול נסיע בין שתי נקודות שכן זוהו. הודעה משותפת הייתה
 * שולחת את המשתמש לתקן כתובת תקינה לגמרי.
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
