/**
 * Server-only book download counters (feature: "Más descargados" ranking).
 *
 * Backs the download proxy endpoint (`/api/descargar/[slug]`) and the home
 * ranking. Two operations, both server-only and both FAIL-SAFE — a Supabase
 * outage must NEVER break a user download or 500 the home page:
 *   - {@link incrementDownload}: best-effort atomic +1 for a slug. Returns a
 *     boolean so the caller can log, but the caller redirects to the PDF
 *     regardless of the result.
 *   - {@link getMostDownloadedSlugs}: top-N slugs ordered by count, `[]` on any
 *     error, cached for {@link DOWNLOADS_CACHE_TTL_MS}.
 *
 * Writes go through the service-role client (bypasses RLS); the table has RLS
 * enabled with no public policies, so the anon key can neither read nor write
 * it (see supabase/migrations/0001_book_downloads.sql).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from './supabase';
import { LruCache, getBooksBySlugs, type MediaItem } from './sanity';
import type { Lang } from './i18n';

/** DB table + RPC names — must match the SQL migration. */
export const DOWNLOADS_TABLE = 'book_downloads';
export const INCREMENT_RPC = 'increment_download';

/** How long a "most downloaded" ranking read stays fresh (ms). */
export const DOWNLOADS_CACHE_TTL_MS = 60_000;

/** A single ranking entry: a book slug and its running download count. */
export interface DownloadCount {
  slug: string;
  count: number;
}

/**
 * Process-wide cache for the ranking read, keyed by limit. Separate from the
 * Sanity cache so a downloads write can invalidate it without touching content.
 */
const downloadsCache = new LruCache<DownloadCount[]>(20, DOWNLOADS_CACHE_TTL_MS);

/**
 * Lazily-created service-role client. Created on first use (not module load) so
 * the app still boots when `SUPABASE_SERVICE_ROLE_KEY` is unset — the download
 * features simply no-op until the key is configured.
 */
let serviceClient: SupabaseClient | null = null;
function getClient(): SupabaseClient | null {
  if (serviceClient) return serviceClient;
  try {
    serviceClient = createServiceClient();
    return serviceClient;
  } catch {
    // Missing service-role key (or any init error): downloads become no-ops.
    return null;
  }
}

/**
 * Best-effort atomic +1 for `slug`'s download counter.
 *
 * Calls the `increment_download` RPC (an upsert-increment, so concurrent
 * downloads never lose a count). NEVER throws: returns `true` on a confirmed
 * write, `false` on any error or when the service-role key is unconfigured. The
 * caller must redirect to the PDF regardless — counting is never allowed to
 * block a download.
 */
export async function incrementDownload(slug: string): Promise<boolean> {
  if (!slug) return false;
  const client = getClient();
  if (!client) return false;
  try {
    const { error } = await client.rpc(INCREMENT_RPC, { book_slug: slug });
    if (error) {
      console.error('[downloads] incrementDownload failed:', error.message);
      return false;
    }
    // A successful write makes any cached ranking stale.
    downloadsCache.clear();
    return true;
  } catch (err) {
    console.error('[downloads] incrementDownload threw:', err);
    return false;
  }
}

/**
 * Fetch the top `limit` book slugs by download count, highest first.
 *
 * Cached for {@link DOWNLOADS_CACHE_TTL_MS}. FAIL-SAFE: returns `[]` on any
 * Supabase error or when the service-role key is unconfigured, so the ranking
 * section simply renders empty instead of 500-ing the home page.
 */
export async function getMostDownloadedSlugs(
  limit = 10,
): Promise<DownloadCount[]> {
  const cap = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 10;
  const cacheKey = `top:${cap}`;
  const hit = downloadsCache.get(cacheKey);
  if (hit) return hit;

  const client = getClient();
  if (!client) return [];

  try {
    const { data, error } = await client
      .from(DOWNLOADS_TABLE)
      .select('slug, count')
      .order('count', { ascending: false })
      .limit(cap);
    if (error) {
      console.error('[downloads] getMostDownloadedSlugs failed:', error.message);
      return [];
    }
    const rows: DownloadCount[] = Array.isArray(data)
      ? data
          .map((r) => ({
            slug: typeof r.slug === 'string' ? r.slug : '',
            count: typeof r.count === 'number' ? r.count : Number(r.count) || 0,
          }))
          .filter((r) => r.slug.length > 0)
      : [];
    downloadsCache.set(cacheKey, rows);
    return rows;
  } catch (err) {
    console.error('[downloads] getMostDownloadedSlugs threw:', err);
    return [];
  }
}

/**
 * Fetch the "Más descargados" ranking as render-ready {@link MediaItem}s.
 *
 * Reads the top slugs from Supabase (ordered by download count), then hydrates
 * them with book content from Sanity, preserving the download ranking order.
 * FAIL-SAFE: returns `[]` when there are no downloads yet, the service-role key
 * is unset, or either backend errors — so the ranking section renders empty
 * instead of breaking the home page.
 */
export async function getMostDownloaded(
  lang: Lang | string,
  limit = 10,
): Promise<MediaItem[]> {
  const top = await getMostDownloadedSlugs(limit);
  if (top.length === 0) return [];
  // getBooksBySlugs is fail-safe and re-sorts into this exact slug order.
  return getBooksBySlugs(
    top.map((t) => t.slug),
    lang,
  );
}

/**
 * Reset the ranking cache AND the lazily-created service client. Primarily for
 * test isolation: the service client is a module-level singleton created on
 * first use, so a test that configures a key would otherwise leak the live
 * client into a later "unconfigured key" test.
 */
export function clearDownloadsCache(): void {
  downloadsCache.clear();
  serviceClient = null;
}
