/**
 * Tests for the Turnstile support shared by the auth routes and islands —
 * see `turnstile.ts`'s header for why the site key is the feature's one
 * on/off switch and why a captcha failure is safe to distinguish even on
 * enumeration-sensitive routes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getTurnstileSiteKey,
  isCaptchaError,
  MAX_CAPTCHA_TOKEN_LENGTH,
  normalizeCaptchaToken,
} from './turnstile';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getTurnstileSiteKey', () => {
  it('returns null when the variable is unset', () => {
    vi.stubEnv('PUBLIC_TURNSTILE_SITE_KEY', undefined);
    expect(getTurnstileSiteKey()).toBeNull();
  });

  it('returns null for a blank/whitespace-only value', () => {
    vi.stubEnv('PUBLIC_TURNSTILE_SITE_KEY', '   ');
    expect(getTurnstileSiteKey()).toBeNull();
  });

  it('returns the trimmed key when set', () => {
    vi.stubEnv('PUBLIC_TURNSTILE_SITE_KEY', '  1x00000000000000000000AA  ');
    expect(getTurnstileSiteKey()).toBe('1x00000000000000000000AA');
  });
});

describe('normalizeCaptchaToken', () => {
  it('returns undefined for a missing/non-string value', () => {
    expect(normalizeCaptchaToken(undefined)).toBeUndefined();
    expect(normalizeCaptchaToken(null)).toBeUndefined();
    expect(normalizeCaptchaToken(42)).toBeUndefined();
    expect(normalizeCaptchaToken({})).toBeUndefined();
  });

  it('returns undefined for an empty or whitespace-only string', () => {
    expect(normalizeCaptchaToken('')).toBeUndefined();
    expect(normalizeCaptchaToken('   ')).toBeUndefined();
  });

  it('returns undefined for a token longer than the maximum', () => {
    const tooLong = 'a'.repeat(MAX_CAPTCHA_TOKEN_LENGTH + 1);
    expect(normalizeCaptchaToken(tooLong)).toBeUndefined();
  });

  it('accepts a token exactly at the maximum length', () => {
    const atMax = 'a'.repeat(MAX_CAPTCHA_TOKEN_LENGTH);
    expect(normalizeCaptchaToken(atMax)).toBe(atMax);
  });

  it('trims a usable token', () => {
    expect(normalizeCaptchaToken('  token-123  ')).toBe('token-123');
  });
});

describe('isCaptchaError', () => {
  it('returns false for a null/undefined error', () => {
    expect(isCaptchaError(null)).toBe(false);
    expect(isCaptchaError(undefined)).toBe(false);
  });

  it('returns true when error.code is captcha_failed', () => {
    expect(isCaptchaError({ code: 'captcha_failed', message: 'whatever' })).toBe(true);
  });

  it('returns false for an unrelated error code', () => {
    expect(isCaptchaError({ code: 'invalid_credentials', message: 'nope' })).toBe(false);
  });

  it('falls back to a case-insensitive message match when code is absent', () => {
    expect(isCaptchaError({ message: 'Captcha verification failed' })).toBe(true);
    expect(isCaptchaError({ message: 'CAPTCHA token invalid' })).toBe(true);
  });

  it('returns false when neither code nor message mentions captcha', () => {
    expect(isCaptchaError({ message: 'Invalid login credentials' })).toBe(false);
  });
});
