/**
 * Typed environment validator for ChuyoCode.
 *
 * Reads from `import.meta.env` (Astro/Vite) and fails fast with a descriptive
 * error when a required variable is missing. Per spec 1 (Project Bootstrap),
 * missing required vars MUST throw at build/startup time so the server never
 * boots in a misconfigured state.
 *
 * Required vars (spec 1 table):
 *   - SANITY_PROJECT_ID
 *   - SANITY_DATASET
 *   - SUPABASE_URL
 *   - SUPABASE_ANON_KEY
 *
 * Optional vars are consumed by later work units (pass gate, rewarded ads):
 *   - SUPABASE_SERVICE_ROLE_KEY (server-only pass writes, design decision #3)
 *   - AD_HMAC_SECRET (ad-token signing, design decision #7)
 */

export interface Env {
  SANITY_PROJECT_ID: string;
  SANITY_DATASET: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  AD_HMAC_SECRET: string;
}

/** Source shape: any string-keyed record (import.meta.env or process.env). */
export type EnvSource = Record<string, unknown>;

/** Vars that MUST be present, per the spec 1 required table. */
export const REQUIRED_ENV_KEYS = [
  'SANITY_PROJECT_ID',
  'SANITY_DATASET',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
] as const;

/** Vars consumed by later phases; validated lazily where they are used. */
export const OPTIONAL_ENV_KEYS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'AD_HMAC_SECRET',
] as const;

/**
 * Raised when one or more required environment variables are absent or blank.
 * The message names every missing variable so misconfiguration is obvious.
 */
export class MissingEnvError extends Error {
  public readonly missing: readonly string[];

  constructor(missing: readonly string[]) {
    super(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        `Set them in your .env file or deployment environment before starting the server.`,
    );
    this.name = 'MissingEnvError';
    this.missing = missing;
  }
}

function readString(source: EnvSource, key: string): string {
  const raw = source[key];
  if (typeof raw !== 'string') {
    return '';
  }
  return raw.trim();
}

/**
 * Validate and return the typed environment.
 *
 * @param source - Env source to read from. Defaults to `import.meta.env`.
 * @throws {MissingEnvError} when any required variable is missing or blank.
 */
export function loadEnv(source: EnvSource = import.meta.env as EnvSource): Env {
  const missing: string[] = [];

  for (const key of REQUIRED_ENV_KEYS) {
    if (readString(source, key) === '') {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new MissingEnvError(missing);
  }

  return {
    SANITY_PROJECT_ID: readString(source, 'SANITY_PROJECT_ID'),
    SANITY_DATASET: readString(source, 'SANITY_DATASET'),
    SUPABASE_URL: readString(source, 'SUPABASE_URL'),
    SUPABASE_ANON_KEY: readString(source, 'SUPABASE_ANON_KEY'),
    // Optional today; empty string until their owning work unit wires them.
    SUPABASE_SERVICE_ROLE_KEY: readString(source, 'SUPABASE_SERVICE_ROLE_KEY'),
    AD_HMAC_SECRET: readString(source, 'AD_HMAC_SECRET'),
  };
}
