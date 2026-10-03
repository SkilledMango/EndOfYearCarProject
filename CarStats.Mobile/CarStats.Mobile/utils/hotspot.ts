/**
 * בדיקת שם וסיסמה של נקודת גישה, לפני שהם נשלחים למתאם.
 *
 * אותם כללים כמו בקושחה, שהם הכללים של WiFi עצמו: שם רשת עד 32 בתים,
 * וסיסמת WPA2 בין 8 ל-63 תווים. סיסמה ריקה = נקודת גישה פתוחה.
 * בודקים כאן ולא רק במתאם, כי בזמן האשף הטלפון מחובר לרשת של המתאם —
 * עדיף לתפוס טעות הקלדה לפני שהנהג מחליף רשת.
 */

/** null כשהכול תקין, אחרת מה לתקן. */
export function hotspotError(ssid: string, pass: string): string | null {
  const name = ssid.trim();
  if (!name) return 'Enter the hotspot name.';
  if (utf8Length(name) > 32) return 'That name is too long — hotspot names are at most 32 characters.';
  if (pass.length > 0 && pass.length < 8) return 'Hotspot passwords are at least 8 characters.';
  if (pass.length > 63) return 'That password is too long — the most a hotspot allows is 63 characters.';
  return null;
}

// שם בעברית או עם אימוג'י תופס יותר מבית אחד לתו, והמגבלה היא בבתים
function utf8Length(text: string): number {
  let bytes = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}
