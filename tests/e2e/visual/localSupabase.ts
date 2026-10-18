import { execSync } from 'node:child_process';

/**
 * The LOCAL Supabase stack the visual suite renders against (and seeds via
 * ./globalSetup.ts). Never production: the values come from the Supabase CLI's
 * own `supabase status` (which only knows the Docker stack started by
 * `pnpm db:start`), and {@link assertLocalSupabaseUrl} refuses anything whose
 * host is not loopback before any request is made.
 */
export interface LocalSupabase {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** Throw unless `url` is an http(s) URL on a loopback host. */
export function assertLocalSupabaseUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`[visual] refusing non-URL Supabase target: ${JSON.stringify(url)}`);
  }
  if (!/^https?:$/.test(parsed.protocol) || !LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `[visual] refusing to use Supabase at ${parsed.origin}: the visual suite only ever talks to a local (127.0.0.1/localhost) stack.`,
    );
  }
}

// Cached in process.env so Playwright's worker processes (which re-load the
// config and inherit the runner's environment) do not shell out again.
const CACHE_KEYS = {
  url: 'VISUAL_LOCAL_SUPABASE_URL',
  anonKey: 'VISUAL_LOCAL_SUPABASE_ANON_KEY',
  serviceRoleKey: 'VISUAL_LOCAL_SUPABASE_SERVICE_ROLE_KEY',
} as const;

function readCached(): LocalSupabase | null {
  const url = process.env[CACHE_KEYS.url];
  const anonKey = process.env[CACHE_KEYS.anonKey];
  const serviceRoleKey = process.env[CACHE_KEYS.serviceRoleKey];
  return url && anonKey && serviceRoleKey ? { url, anonKey, serviceRoleKey } : null;
}

/**
 * Resolve the local stack's API URL and keys from `supabase status -o json`
 * (takes a few seconds; the stack must already be running — `pnpm db:start`).
 */
export function resolveLocalSupabase(): LocalSupabase {
  const cached = readCached();
  if (cached) {
    assertLocalSupabaseUrl(cached.url);
    return cached;
  }

  let raw: string;
  try {
    raw = execSync('pnpm exec supabase status -o json', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 180_000,
    });
  } catch (err) {
    throw new Error(
      `[visual] could not read the local Supabase stack (is Docker running and \`pnpm db:start\` done?): ${String(err)}`,
    );
  }
  // The CLI may print warnings around the JSON object; keep only the object.
  const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  const status = JSON.parse(json) as Record<string, unknown>;
  const url = status.API_URL;
  const anonKey = status.ANON_KEY;
  const serviceRoleKey = status.SERVICE_ROLE_KEY;
  if (typeof url !== 'string' || typeof anonKey !== 'string' || typeof serviceRoleKey !== 'string') {
    throw new Error('[visual] `supabase status -o json` did not report API_URL, ANON_KEY and SERVICE_ROLE_KEY.');
  }
  assertLocalSupabaseUrl(url);

  process.env[CACHE_KEYS.url] = url;
  process.env[CACHE_KEYS.anonKey] = anonKey;
  process.env[CACHE_KEYS.serviceRoleKey] = serviceRoleKey;
  return { url, anonKey, serviceRoleKey };
}
