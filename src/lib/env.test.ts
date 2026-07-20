import { describe, it, expect } from 'vitest';
import { loadEnv, MissingEnvError, REQUIRED_ENV_KEYS } from './env';

const validEnv = {
  SANITY_PROJECT_ID: 'proj123',
  SANITY_DATASET: 'production',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
};

describe('loadEnv', () => {
  // Spec 1 — Scenario: Valid env at startup.
  it('returns a typed Env when all required vars are set', () => {
    const env = loadEnv(validEnv);
    expect(env.SANITY_PROJECT_ID).toBe('proj123');
    expect(env.SANITY_DATASET).toBe('production');
    expect(env.SUPABASE_URL).toBe('https://example.supabase.co');
    expect(env.SUPABASE_ANON_KEY).toBe('anon-key');
  });

  it('defaults optional vars to empty strings when absent', () => {
    const env = loadEnv(validEnv);
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe('');
    expect(env.AD_HMAC_SECRET).toBe('');
  });

  it('reads optional vars when present', () => {
    const env = loadEnv({
      ...validEnv,
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
      AD_HMAC_SECRET: 'hmac-secret',
    });
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe('service-role');
    expect(env.AD_HMAC_SECRET).toBe('hmac-secret');
  });

  it('trims surrounding whitespace from values', () => {
    const env = loadEnv({ ...validEnv, SANITY_PROJECT_ID: '  proj123  ' });
    expect(env.SANITY_PROJECT_ID).toBe('proj123');
  });

  // Spec 1 — Scenario: Missing env var.
  it('throws MissingEnvError naming the absent required var', () => {
    const { SUPABASE_URL: _omitted, ...withoutUrl } = validEnv;
    expect(() => loadEnv(withoutUrl)).toThrow(MissingEnvError);
    expect(() => loadEnv(withoutUrl)).toThrow(/SUPABASE_URL/);
  });

  it('treats blank/whitespace-only required vars as missing', () => {
    expect(() => loadEnv({ ...validEnv, SANITY_DATASET: '   ' })).toThrow(
      MissingEnvError,
    );
  });

  it('lists every missing required var in the error', () => {
    let caught: MissingEnvError | undefined;
    try {
      loadEnv({});
    } catch (err) {
      caught = err as MissingEnvError;
    }
    expect(caught).toBeInstanceOf(MissingEnvError);
    expect(caught?.missing).toEqual([...REQUIRED_ENV_KEYS]);
  });
});
