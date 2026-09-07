/**
 * כללי הסיסמה, משוכפלים מ-PasswordPolicy.cs בשרת.
 *
 * קיימים כאן רק לצורך משוב מיידי בזמן ההקלדה; האכיפה האמיתית היא בשרת,
 * כי כל לקוח ניתן לעקיפה. שינוי כלל כאן מחייב שינוי מקביל בשרת, אחרת
 * האפליקציה תאשר סיסמה שה-API ידחה.
 */

export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_REQUIREMENTS =
  'Password must be at least 8 characters and include at least one letter and one number.';

/**
 * מחזירה null אם הסיסמה תקינה, אחרת את הסיבה בניסוח שמובן למשתמש.
 *
 * במכוון אין אורך מקסימלי ואין דרישה לתווים מיוחדים: האורך הוא מה שמקשה
 * על ניחוש, ודרישת סימנים מייצרת בעיקר החלפות צפויות.
 */
export function validatePassword(password: string): string | null {
  if (!password) return 'Please enter a password.';
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (!/[a-zA-Z]/.test(password)) return 'Password must include at least one letter.';
  if (!/[0-9]/.test(password))    return 'Password must include at least one number.';
  return null;
}

/** אמת כשהסיסמה עומדת בכל הכללים. */
export function isPasswordAcceptable(password: string): boolean {
  return validatePassword(password) === null;
}
