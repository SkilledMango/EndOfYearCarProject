// מקביל ל-PasswordPolicy.cs בשרת; האכיפה האמיתית בשרת

export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_REQUIREMENTS =
  'Password must be at least 8 characters and include at least one letter and one number.';

// איתור: חוקי סיסמה (אפליקציה)
export function validatePassword(password: string): string | null {
  if (!password) return 'Please enter a password.';
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (!/[a-zA-Z]/.test(password)) return 'Password must include at least one letter.';
  if (!/[0-9]/.test(password))    return 'Password must include at least one number.';
  return null;
}

export function isPasswordAcceptable(password: string): boolean {
  return validatePassword(password) === null;
}
