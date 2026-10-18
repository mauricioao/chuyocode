/**
 * localSupabaseAdmin — shared service-role REST access to LOCAL Supabase
 * ONLY, for signed-in e2e specs that need to seed/clean up their own rows
 * (`desk-minimized-tray-part6b.spec.ts`'s own header: "Signed-in runs seed
 * their own published activity in LOCAL Supabase before the suite and
 * delete it after, so the fixture seed stays users-only"). Factored out of
 * that spec (owner follow-up, 2026-10-18 night pass) so `editor-mobile-
 * layout.spec.ts` can self-seed its own fixture activity the same way,
 * instead of depending on a row created by hand outside the test run.
 *
 * NEVER a remote project: `localSupabaseAdmin()` returns `null` unless
 * `SUPABASE_URL` resolves to `localhost`/`127.0.0.1` AND
 * `SUPABASE_SERVICE_ROLE_KEY` is set — callers skip gracefully (never
 * throw) when it returns `null`, same posture as every other local-only
 * fixture in this suite.
 */

export interface LocalSupabaseAdmin {
  url: string;
  key: string;
}

/** `null` unless `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are set AND point at localhost. */
export function localSupabaseAdmin(): LocalSupabaseAdmin | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const host = new URL(url).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') return null;
  return { url, key };
}

/**
 * One PostgREST call against `${url}/rest/v1/${path}`, service-role
 * authenticated. `Prefer: resolution=merge-duplicates,return=minimal` by
 * default (upsert-friendly, no response body needed) — overridable via
 * `init.headers` for a caller that needs different semantics (e.g. a plain
 * `DELETE`, which ignores `resolution` anyway).
 */
export async function localSupabaseRest(admin: LocalSupabaseAdmin, path: string, init: RequestInit): Promise<void> {
  const res = await fetch(`${admin.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: admin.key,
      Authorization: `Bearer ${admin.key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`Local Supabase ${init.method} ${path}: HTTP ${res.status} ${await res.text()}`);
}
