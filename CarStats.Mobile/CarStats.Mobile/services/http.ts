// איתור: בקשות רשת עם הגבלת זמן
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
