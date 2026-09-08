/**
 * The per-browser dedup cookie — the contract two counter endpoints share.
 *
 * Two anonymous counters in this codebase need the exact same thing: count an
 * action once per browser per 24 hours. The download proxy
 * (`/api/descargar/[slug]`) got there first with `chu_dl_<slug>`; the exercise
 * like endpoint (`/api/me-gusta/[id]`) needs `chu_like_<id>` with identical
 * semantics. This module is that contract, lifted out of the first endpoint
 * rather than copied into the second — the repo already has a standing lesson
 * about hand-maintained duplicates (see `neutralSpanish.ts`): copies drift, and
 * a drifted guard keeps passing while it stops checking.
 *
 * Framework-free on purpose, like every other module in `src/lib`. In
 * particular it does NOT read `import.meta.env` — the `Secure` attribute is
 * passed in by the caller, so the whole module is a pure function of its inputs
 * and can be tested without an Astro environment.
 *
 * 🔴 WHAT THIS IS AND IS NOT. It is a SPEED BUMP, not identity. There are no
 * accounts, so there is nothing to bind a count to; anyone willing to clear a
 * cookie, open a private window or send a bare `curl` can count again. What it
 * buys is that ordinary use — a reload, a back-navigation, a double click —
 * counts once, which is the difference between a number that roughly tracks
 * reality and one that only tracks how long a page was left open. Anything that
 * needs to be resistant to a determined actor needs accounts, not a cookie.
 */

/**
 * The dedup window: 24 hours.
 *
 * A DAY IS THE UNIT BECAUSE THE ACTION IS. Both counters measure "how many
 * people did this", and a day is roughly the granularity at which a repeat
 * visit is a genuinely new intent rather than the same session continuing. A
 * shorter window (an hour) lets one afternoon of practice count four or five
 * times; a longer one (a week) starts suppressing real returning use, and
 * silently makes a popular exercise look like a stale one.
 */
export const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Build the cookie name for one counted thing.
 *
 * The key is part of the NAME rather than the value so that liking exercise A
 * cannot suppress a like on exercise B — one cookie per counted thing, and the
 * browser does the expiry bookkeeping for each of them independently.
 */
export function dedupCookieName(prefix: string, key: string): string {
  return `${prefix}${key}`;
}

/**
 * Does `cookieHeader` already carry `name`?
 *
 * Parsed by hand rather than with a cookie library: the only question is
 * whether one exact name is present, the header format for that is a
 * `;`-separated list of `name=value`, and the value is never read. Splitting on
 * the FIRST `=` matters — a cookie value may legitimately contain `=` (base64
 * padding), and `split('=')` would mangle the name of the pair that follows.
 */
export function hasDedupCookie(
  cookieHeader: string | null | undefined,
  name: string,
): boolean {
  if (!cookieHeader) return false;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return true;
  }
  return false;
}

/**
 * The `Set-Cookie` value that arms the dedup window for `name`.
 *
 * The attributes, and why each one is there:
 *  - `HttpOnly` — nothing in the browser reads this. The SSR page receives the
 *    cookie on the ordinary page request and renders the control's state from
 *    it, so script access would be a capability granted for no consumer.
 *  - `SameSite=Lax` — the cookie must survive an ordinary link into the page,
 *    which is exactly how a shared exercise is opened.
 *  - `Path=/` — so one browser has one cookie for this key across the site
 *    rather than one per path it happened to be set from.
 *  - `Secure` — caller's choice, because dev runs on plain `http://localhost`
 *    where a `Secure` cookie is simply dropped and the dedup would look broken.
 *
 * The value is a constant `1`. There is nothing to store: the cookie's EXISTENCE
 * is the entire signal, and its expiry is the window.
 */
export function dedupCookie(name: string, options: { secure: boolean }): string {
  const attrs = [
    `${name}=1`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${Math.floor(DEDUP_WINDOW_MS / 1000)}`,
  ];
  if (options.secure) attrs.push('Secure');
  return attrs.join('; ');
}
