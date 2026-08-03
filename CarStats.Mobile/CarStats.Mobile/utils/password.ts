/**
 * Password rules, mirroring the server's PasswordPolicy.
 *
 * This exists for immediate feedback while typing — the server is what
 * actually enforces the rules, since any client can be bypassed. If you change
 * a rule here, change Services/PasswordPolicy.cs to match, or the app will
 * accept passwords the API then rejects.
 */

export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_REQUIREMENTS =
  'Password must be at least 8 characters and include at least one letter and one number.';

/**
 * Returns null when the password is acceptable, otherwise the reason it is
 * not — phrased for the user rather than as a rule name.
 *
 * Deliberately no maximum length and no required symbols: length is what makes
 * a password hard to guess, and forcing symbols mostly produces predictable
 * substitutions rather than stronger secrets.
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

/** True when the password passes every rule. */
export function isPasswordAcceptable(password: string): boolean {
  return validatePassword(password) === null;
}
