/**
 * Server-only Supabase clients (design decision #3).
 *
 * Two clients, both server-only and never shipped to the browser:
 *  - `supabaseServer` (anon key): read-only bootstrapping / public reads.
 *  - `createServiceClient()` (service-role key): privileged pass writes issued
 *    by the SSR pass gate and the `validar-anuncio` endpoint.
 *
 * Security (design decision #3): the service-role key bypasses row-level
 * security, so it MUST stay server-side. `astro.config.mjs` keeps these secrets
 * out of the client bundle. The service-role key is OPTIONAL for now — the pass
 * write features land in PR 6-7 — so `createServiceClient()` only fails loudly
 * when actually invoked without the key, never at module load.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadEnv } from './env';

const env = loadEnv();

/** Shared auth options for all server clients: no browser session persistence. */
const SERVER_AUTH_OPTIONS = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
} as const;

/**
 * Anon-key server client for public, read-only access. Safe to initialize at
 * module load because the anon key is always required (spec 1 env table).
 */
export const supabaseServer: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY,
  SERVER_AUTH_OPTIONS,
);

/**
 * Raised when a service-role client is requested but `SUPABASE_SERVICE_ROLE_KEY`
 * is not configured. Fails loudly at call time (not module load) so the app
 * still boots for read-only features while the pass work units are pending.
 */
export class MissingServiceRoleKeyError extends Error {
  constructor() {
    super(
      'SUPABASE_SERVICE_ROLE_KEY is not set. It is required for server-side ' +
        'pass writes (validar-anuncio / pass gate). Set it in your environment ' +
        'before using service-role features.',
    );
    this.name = 'MissingServiceRoleKeyError';
  }
}

/**
 * Create a service-role Supabase client for privileged, server-side pass
 * writes. Bypasses row-level security — NEVER expose this client or its key to
 * the browser.
 *
 * @throws {MissingServiceRoleKeyError} when the service-role key is absent.
 */
export function createServiceClient(): SupabaseClient {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new MissingServiceRoleKeyError();
  }
  return createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    SERVER_AUTH_OPTIONS,
  );
}
