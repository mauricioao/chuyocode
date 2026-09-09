/**
 * Server-only QR generation and canonical share URLs.
 *
 * The use case is concrete and it drives every decision here: a teacher projects
 * an exercise and a room of students opens it on their phones. So the code has
 * to survive being photographed off a projector screen, and the link beside it
 * has to be the exercise itself rather than whatever URL the teacher happened to
 * arrive on.
 *
 * 🔴 NO THIRD-PARTY QR SERVICE, and this is not a preference. Pointing an
 * `<img>` at an external chart API would (a) send every shared URL — including
 * unlisted ones — to a company with no relationship to this site, and (b) make
 * the share dialog break whenever that company has an outage or changes its
 * terms. The QR is generated here, on our server, from data we already have.
 *
 * Framework-free, like every other module in `src/lib`. Both functions are pure:
 * same input, same output, no I/O, no clock, no randomness.
 */
import { renderSVG } from 'uqr';

/**
 * QR encoding options, fixed for every code this site produces.
 *
 * `ecc: 'M'` (15% recovery), not the library default `'L'` (7%). A code read off
 * a PROJECTOR is fighting glare, keystone distortion and a reflective screen —
 * partial data loss is the expected condition, not an edge case. The cost is
 * version 3 instead of version 2 (45 modules across instead of 41, ~10% denser),
 * which is irrelevant when the thing is two metres wide and matters much less
 * than tolerating a hotspot across the middle of it.
 *
 * `border: 4` is the QUIET ZONE the QR specification mandates, not decoration —
 * scanners use it to find the code's edge, and uqr defaults to 1. On a slide
 * where the code sits against other content, that margin is doing real work.
 *
 * `pixelSize: 1` makes each module ONE unit in the viewBox rather than ten. The
 * SVG is inlined into the page, and the rendered size is set by CSS on the
 * container anyway, so the larger coordinates would be ~3.5 KB of extra digits
 * describing the same image.
 */
export const QR_OPTIONS = {
  ecc: 'M',
  border: 4,
  pixelSize: 1,
} as const;

/**
 * The canonical, shareable address of the page `url` was requested from.
 *
 * DERIVED FROM THE REQUEST, NEVER FROM A CONFIGURED HOST. `astro.config.mjs`
 * sets no `site`, and hardcoding one would be wrong anyway: the same build
 * serves a Netlify deploy preview, a branch deploy and production, and a QR that
 * silently pointed at production from a preview would be a link nobody could
 * tell was wrong until a classroom full of phones landed on the wrong content.
 *
 * QUERY AND FRAGMENT ARE DROPPED, deliberately. What is being shared is the
 * EXERCISE, and the teacher's own URL routinely carries things that are not part
 * of it — a `?utm_source` from however they found it, a `#section` from a link
 * they followed. Propagating those into a QR would attribute a room of students
 * to the teacher's campaign and put a fragment on a page that has no such
 * anchor. Origin plus path IS the exercise's identity (docs/exercise-model.md,
 * "Deep links").
 *
 * Takes a `URL` rather than a string so it is TOTAL — there is no parse step, so
 * there is nothing to throw, and a share link can never 500 the exercise page.
 */
export function shareUrl(url: URL): string {
  return `${url.origin}${url.pathname}`;
}

/**
 * `value` as an SVG QR code, or `null` if it could not be encoded.
 *
 * The returned markup is a `<svg>` with a `viewBox` and NO width/height, so the
 * caller sizes it with CSS. It is black on an explicit WHITE background rect,
 * which is not a theme oversight: this site is dark, and a QR rendered in theme
 * colours is a QR that scanners reject. The white rect spans the quiet zone too,
 * so the code carries its own margin and stays scannable on any backdrop.
 *
 * `null` GUARDS A CASE I CANNOT PRODUCE, and it is worth being honest about
 * that: the only realistic failure is data too long for QR version 40 (~2,900
 * characters), and an exercise URL is nowhere near it. But this runs on the SSR
 * path of the exercise page, where a throw would replace a graded exercise with
 * a 500 over a decoration. The caller hides the share control instead.
 */
export function qrSvg(value: string): string | null {
  if (value.length === 0) return null;
  try {
    return renderSVG(value, QR_OPTIONS);
  } catch (err) {
    console.error('[qr] qrSvg failed:', err);
    return null;
  }
}
