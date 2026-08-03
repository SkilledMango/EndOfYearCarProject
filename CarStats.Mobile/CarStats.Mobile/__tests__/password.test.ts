/**
 * Password rules.
 *
 * These must stay in step with the server's PasswordPolicy.cs — if the client
 * accepts something the API rejects, the user gets a confusing failure after
 * filling in the whole form.
 */

import {
  PASSWORD_MIN_LENGTH,
  isPasswordAcceptable,
  validatePassword,
} from '@/utils/password';

describe('validatePassword', () => {
  it('accepts a password with letters, numbers and enough length', () => {
    expect(validatePassword('carstats1')).toBeNull();
    expect(isPasswordAcceptable('carstats1')).toBe(true);
  });

  it('rejects an empty password', () => {
    expect(validatePassword('')).toMatch(/enter a password/i);
  });

  it('rejects anything shorter than the minimum', () => {
    // One below the limit must fail and exactly the limit must pass — an
    // off-by-one here would disagree with the server.
    expect(validatePassword('a1b2c3d')).toMatch(/8 characters/);
    expect(validatePassword('a1b2c3d4')).toBeNull();
    expect('a1b2c3d4'.length).toBe(PASSWORD_MIN_LENGTH);
  });

  it('rejects digits only, however long', () => {
    expect(validatePassword('1234567890')).toMatch(/letter/i);
  });

  it('rejects letters only, however long', () => {
    expect(validatePassword('abcdefghij')).toMatch(/number/i);
  });

  it('accepts symbols but never requires them', () => {
    expect(validatePassword('carstats1!')).toBeNull();
    // No symbol, still fine — length and a digit are what matter.
    expect(validatePassword('carstats1')).toBeNull();
  });

  it('accepts uppercase-only letters — case is not a rule', () => {
    expect(validatePassword('CARSTATS1')).toBeNull();
  });

  it('does not impose a maximum length', () => {
    expect(validatePassword('a1' + 'x'.repeat(200))).toBeNull();
  });

  it('counts a space as a character but not as a letter or digit', () => {
    expect(validatePassword('        ')).toMatch(/letter/i);
  });

  it('gives a specific reason rather than a generic failure', () => {
    // The user should be told which rule they missed, not just "invalid".
    expect(validatePassword('short1')).not.toBe(validatePassword('abcdefghij'));
  });
});
