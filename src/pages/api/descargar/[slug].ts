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

/** Dedup window: don't re-count the same slug from the same browser for 24h. */
export const DOWNLOAD_DEDUP_MS = 24 * 60 * 60 * 1000;

/** Per-slug dedup cookie name. */
function dedupCookieName(slug: string): string {
  return `chu_dl_${slug}`;
}

/** True when the browser already has a fresh dedup cookie for this slug. */
function alreadyCounted(request: Request, slug: string): boolean {
  const header = request.headers.get('cookie');
  if (!header) return false;
  const name = dedupCookieName(slug);
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return true;
  }
  return false;
}

/** Build the `Set-Cookie` value that arms the 24h dedup window for `slug`. */
function dedupCookie(slug: string): string {
  const maxAge = Math.floor(DOWNLOAD_DEDUP_MS / 1000);
  const isProd = import.meta.env?.PROD === true;
  const attrs = [
    `${dedupCookieName(slug)}=1`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${maxAge}`,
  ];
  if (isProd) attrs.push('Secure');
  return attrs.join('; ');
}

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
  if (!alreadyCounted(request, slug)) {
    await incrementDownload(slug);
    headers.append('set-cookie', dedupCookie(slug));
  }

  // 302: send the browser on to the real PDF on the CDN.
  return new Response(null, { status: 302, headers });
};
