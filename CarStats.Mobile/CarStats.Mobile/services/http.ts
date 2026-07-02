/**
 * Shared fetch() wrapper that aborts after `timeoutMs` so the UI never hangs
 * on an unreachable host (government API, ESP32 scanner, NHTSA, Gemini…).
 *
 * Defaults to `Accept: application/json`; pass `init.headers` to override.
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
