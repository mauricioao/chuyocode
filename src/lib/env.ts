/**
 * Typed environment validator for ChuyoCode.
 *
 * Reads from a merged view of `import.meta.env` (Astro/Vite) and `process.env`
 * and fails fast with a descriptive error when a required variable is missing.
 * Per spec 1 (Project Bootstrap), missing required vars MUST throw at
 * build/startup time so the server never boots in a misconfigured state.
 *
 * Why the merge: the SSR entry is deployed as a Netlify Function. Only the
 * variables Vite statically inlined at build time survive in
 * `import.meta.env`; everything configured in the Netlify UI arrives at
 * runtime through `process.env`. Reading a single source would return blanks
 * in the serverless runtime and throw `MissingEnvError` on every request.
 *
 * Resolution order per key: use `import.meta.env` when it holds a non-empty
 * string, otherwise fall back to `process.env`. A blank/absent value in one
 * source never shadows a valid value in the other. An explicit `source`
 * argument bypasses the merge entirely and is used verbatim.
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
  /** Legal entity (site owner) shown on /legal pages. Optional; empty → fallback. */
  LEGAL_OWNER_NAME: string;
  LEGAL_OWNER_RUC: string;
  LEGAL_OWNER_CITY: string;
  LEGAL_OWNER_EMAIL: string;
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
  'LEGAL_OWNER_NAME',
  'LEGAL_OWNER_RUC',
  'LEGAL_OWNER_CITY',
  'LEGAL_OWNER_EMAIL',
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

/** True only for strings that carry an actual value once trimmed. */
function isUsable(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/** Minimal structural view of Node's `process`, so no @types/node is needed. */
interface ProcessLike {
  env?: Record<string, string | undefined>;
}

/** `process.env` when running under Node/Netlify Functions, else empty. */
function readProcessEnv(): EnvSource {
  const proc = (globalThis as { process?: ProcessLike }).process;
  if (!proc || !proc.env) {
    return {};
  }
  return proc.env as EnvSource;
}

/**
 * Merge two env sources: `buildTimeEnv` wins per key, but only when it holds a
 * usable value, so a blank there cannot shadow a valid `runtimeEnv` value.
 *
 * Pure and exported so the resolution rule is testable without touching the
 * ambient `import.meta.env` / `process.env` globals.
 */
export function mergeEnvSources(
  buildTimeEnv: EnvSource,
  runtimeEnv: EnvSource,
): EnvSource {
  const merged: EnvSource = { ...runtimeEnv };

  for (const key of Object.keys(buildTimeEnv)) {
    const value = buildTimeEnv[key];
    if (isUsable(value)) {
      merged[key] = value;
    }
  }

  return merged;
}

/**
 * The merged `import.meta.env` + `process.env` view used when `loadEnv` is
 * called without an explicit source.
 */
export function defaultEnvSource(): EnvSource {
  return mergeEnvSources(
    (import.meta.env ?? {}) as EnvSource,
    readProcessEnv(),
  );
}

/**
 * Validate and return the typed environment.
 *
 * @param source - Env source to read from. Defaults to the merged
 *   `import.meta.env` + `process.env` view (see {@link defaultEnvSource}).
 * @throws {MissingEnvError} when any required variable is missing or blank.
 */
export function loadEnv(source: EnvSource = defaultEnvSource()): Env {
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
    // Legal entity (optional): empty string falls back to a neutral label.
    LEGAL_OWNER_NAME: readString(source, 'LEGAL_OWNER_NAME'),
    LEGAL_OWNER_RUC: readString(source, 'LEGAL_OWNER_RUC'),
    LEGAL_OWNER_CITY: readString(source, 'LEGAL_OWNER_CITY'),
    LEGAL_OWNER_EMAIL: readString(source, 'LEGAL_OWNER_EMAIL'),
  };
}
