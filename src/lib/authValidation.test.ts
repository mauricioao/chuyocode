import { describe, it, expect } from 'vitest';
import { looksLikeEmail, isValidPassword, MIN_PASSWORD_LENGTH } from './authValidation';

describe('looksLikeEmail', () => {
  it('accepts an ordinary address', () => {
    expect(looksLikeEmail('nombre@ejemplo.com')).toBe(true);
  });

  it('rejects a string with no @', () => {
    expect(looksLikeEmail('no-arroba-aqui')).toBe(false);
  });

  it('rejects a non-string', () => {
    expect(looksLikeEmail(42)).toBe(false);
    expect(looksLikeEmail(undefined)).toBe(false);
    expect(looksLikeEmail(null)).toBe(false);
  });
});

describe('isValidPassword', () => {
  it(`accepts a string of exactly ${MIN_PASSWORD_LENGTH} characters`, () => {
    expect(isValidPassword('a'.repeat(MIN_PASSWORD_LENGTH))).toBe(true);
  });

  it('accepts a longer password', () => {
    expect(isValidPassword('a-much-longer-password-123')).toBe(true);
  });

  it(`rejects a string shorter than ${MIN_PASSWORD_LENGTH} characters`, () => {
    expect(isValidPassword('a'.repeat(MIN_PASSWORD_LENGTH - 1))).toBe(false);
  });

  it('rejects a non-string', () => {
    expect(isValidPassword(12345678)).toBe(false);
    expect(isValidPassword(undefined)).toBe(false);
  });
});
