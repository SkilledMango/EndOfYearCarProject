/**
 * עטיפה ל-fetch שמבטלת את הבקשה אחרי הזמן שנקבע.
 *
 * ל-fetch אין timeout כברירת מחדל, ולכן פנייה לשרת שלא זמין — מתאם שלא
 * ברשת, שירות ממשלתי שנפל — נתקעת לנצח והמסך מסתובב איתה.
 * כל קריאה יוצאת באפליקציה עוברת דרך כאן.
 */
export async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: { Accept: 'application/json' },
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}
