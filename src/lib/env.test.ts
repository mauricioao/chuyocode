import { describe, it, expect, afterEach } from 'vitest';
import {
  defaultEnvSource,
  loadEnv,
  mergeEnvSources,
  MissingEnvError,
  REQUIRED_ENV_KEYS,
} from './env';

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

// The SSR entry ships as a Netlify Function: build-time values live in
// `import.meta.env`, UI-configured values arrive at runtime via `process.env`.
// Neither source alone is trustworthy, so resolution merges both.
describe('mergeEnvSources', () => {
  it('keeps a value present only in the runtime source', () => {
    const merged = mergeEnvSources({}, { SUPABASE_URL: 'from-process' });
    expect(merged.SUPABASE_URL).toBe('from-process');
  });

  it('keeps a value present only in the build-time source', () => {
    const merged = mergeEnvSources({ SUPABASE_URL: 'from-import-meta' }, {});
    expect(merged.SUPABASE_URL).toBe('from-import-meta');
  });

  it('prefers the build-time value when both sources are usable', () => {
    const merged = mergeEnvSources(
      { SUPABASE_URL: 'from-import-meta' },
      { SUPABASE_URL: 'from-process' },
    );
    expect(merged.SUPABASE_URL).toBe('from-import-meta');
  });

  it('does not let a blank build-time value shadow the runtime value', () => {
    const merged = mergeEnvSources(
      { SUPABASE_URL: '   ' },
      { SUPABASE_URL: 'from-process' },
    );
    expect(merged.SUPABASE_URL).toBe('from-process');
  });

  it('does not let a blank runtime value shadow the build-time value', () => {
    const merged = mergeEnvSources(
      { SUPABASE_URL: 'from-import-meta' },
      { SUPABASE_URL: '' },
    );
    expect(merged.SUPABASE_URL).toBe('from-import-meta');
  });

  it('ignores non-string build-time values in favour of the runtime value', () => {
    const merged = mergeEnvSources(
      { SUPABASE_URL: undefined },
      { SUPABASE_URL: 'from-process' },
    );
    expect(merged.SUPABASE_URL).toBe('from-process');
  });

  it('still resolves to a blank when neither source is usable', () => {
    const merged = mergeEnvSources({ SUPABASE_URL: '  ' }, { SUPABASE_URL: '' });
    expect(() => loadEnv({ ...validEnv, ...merged })).toThrow(MissingEnvError);
  });
});

/** Typed handle on `process.env` without pulling in @types/node. */
const processEnv = (globalThis as { process?: { env: Record<string, string | undefined> } })
  .process?.env;

describe('default env source (serverless runtime)', () => {
  const touchedKeys: string[] = [];

  function setProcessEnv(key: string, value: string): void {
    if (!processEnv) return;
    touchedKeys.push(key);
    processEnv[key] = value;
  }

  afterEach(() => {
    if (!processEnv) return;
    for (const key of touchedKeys.splice(0)) {
      delete processEnv[key];
    }
  });

  it('picks up a value that exists only in process.env', () => {
    setProcessEnv('CHUYO_RUNTIME_ONLY_KEY', 'runtime-value');
    expect(defaultEnvSource().CHUYO_RUNTIME_ONLY_KEY).toBe('runtime-value');
  });

  it('lets loadEnv boot from process.env alone', () => {
    for (const key of REQUIRED_ENV_KEYS) {
      setProcessEnv(key, `${key}-from-process`);
    }
    const env = loadEnv(defaultEnvSource());
    expect(env.SUPABASE_URL).toBe('SUPABASE_URL-from-process');
  });

  it('lets an explicit source override process.env entirely', () => {
    setProcessEnv('SANITY_PROJECT_ID', 'from-process');
    const env = loadEnv({ ...validEnv, SANITY_PROJECT_ID: 'explicit' });
    expect(env.SANITY_PROJECT_ID).toBe('explicit');
  });

  it('does not fall back to process.env when an explicit source omits a key', () => {
    setProcessEnv('SUPABASE_URL', 'from-process');
    const { SUPABASE_URL: _omitted, ...withoutUrl } = validEnv;
    expect(() => loadEnv(withoutUrl)).toThrow(/SUPABASE_URL/);
  });
});
