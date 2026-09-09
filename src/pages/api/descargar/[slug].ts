/**
 * GET /api/descargar/[slug] — pass-gated download proxy + counter.
 *
 * The book PDF link no longer points straight at the Sanity CDN; it points
 * here so the server can (a) enforce the premium pass, (b) count the download,
 * and (c) redirect to the real PDF. Flow:
 *   1. Resolve the book by slug (Sanity). Missing book OR missing PDF → 404.
 *   2. Verify the premium pass (same gate as the detail page). No pass → 403.
 *   3. Count the download BEST-EFFORT, deduplicated per browser for 24h via a
 *      `chu_dl_<slug>` cookie: a reload within the window does not re-count.
 *   4. 302-redirect to the real `pdfUrl`.
 *
 * Fail-safe (design decision #8): counting NEVER blocks the download. If
 * Supabase is down or the dedup cookie already exists, the user is still
 * redirected to the PDF. The pass gate is the only hard stop.
 */
import type { APIRoute } from 'astro';
import { getBookBySlug } from '@lib/sanity';
import { getPassState } from '@lib/pass';
import { incrementDownload } from '@lib/downloads';
import {
  DEDUP_WINDOW_MS,
  dedupCookie,
  dedupCookieName,
  hasDedupCookie,
} from '@lib/dedupCookie';

/**
 * Dedup window: don't re-count the same slug from the same browser for 24h.
 *
 * Re-exported rather than defined here: the like counter needs the identical
 * rule, so the window and the cookie mechanics moved into `@lib/dedupCookie`
 * (two hand-maintained copies of one rule drift, and a drifted dedup silently
 * stops deduping). This name is kept because it is this endpoint's contract.
 */
export const DOWNLOAD_DEDUP_MS = DEDUP_WINDOW_MS;

/** Per-slug dedup cookie prefix. */
const DOWNLOAD_COOKIE_PREFIX = 'chu_dl_';

export const GET: APIRoute = async ({ params, request }) => {
  const slug = params.slug;
  if (!slug) {
    return new Response(null, { status: 404, statusText: 'Not Found' });
  }

  // Resolve the book. `lang` only affects localized display fields, not the
  // PDF asset, so 'es' is fine for the lookup. Missing book/PDF → 404.
  const book = await getBookBySlug(slug, 'es');
  if (!book || typeof book.pdfUrl !== 'string' || book.pdfUrl.length === 0) {
    return new Response(null, { status: 404, statusText: 'Not Found' });
  }

  // Hard gate: only a valid premium pass may download (fail-closed, decision #8).
  if (getPassState(request) !== 'valid') {
    return new Response(null, { status: 403, statusText: 'Forbidden' });
  }

  // Count best-effort + dedup. A fresh browser (no dedup cookie) counts once and
  // gets the 24h cookie; a reload within the window skips the count. Counting
  // failures are swallowed — the redirect below always happens.
  const headers = new Headers({ location: book.pdfUrl });
  const cookieName = dedupCookieName(DOWNLOAD_COOKIE_PREFIX, slug);
  if (!hasDedupCookie(request.headers.get('cookie'), cookieName)) {
    await incrementDownload(slug);
    headers.append(
      'set-cookie',
      dedupCookie(cookieName, { secure: import.meta.env?.PROD === true }),
    );
  }

  // 302: send the browser on to the real PDF on the CDN.
  return new Response(null, { status: 302, headers });
};
