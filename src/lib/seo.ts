/**
 * SEO path/document policy helpers (SEO basics pass).
 *
 * Small, pure, zero-I/O functions `BaseLayout.astro` applies to EVERY page
 * from `Astro.url.pathname`/`Astro.site` alone, so no individual page has to
 * remember to opt in — same reasoning `src/lib/httpCache.ts` gives for
 * `markPrivate`: a directive spelled in exactly one place beats one hand-typed
 * at every call site.
 */
import { DEFAULT_LANG, SUPPORTED_LANGS, isValidLang, type Lang } from './i18n';

/**
 * Fallback origin when `Astro.site` is unset. Mirrors `astro.config.mjs`'s
 * own literal fallback, and is reached in TWO real cases, not just a
 * defensive "should never happen": in production, a local `pnpm build`/`pnpm
 * dev` with no `URL` env var — and in every unit test that renders a page or
 * `BaseLayout` through Astro's experimental Container API
 * (`astro/container`), which does not thread the project's `site` config
 * into `Astro.site` at all (confirmed: it is `undefined` on every
 * `renderToString`/`renderToResponse` call today, `getViteConfig()` or not).
 * Keeping this fallback identical to the config's own means a test asserting
 * `https://chuyocode.netlify.app/...` is still asserting something real, not
 * a coincidence of two unrelated literals matching.
 */
const FALLBACK_SITE = new URL('https://chuyocode.netlify.app/');

/**
 * Absolute canonical URL for `pathname` on `site`, deliberately dropping any
 * query string — filters/sort options (the gated activities feed's `?q=`/
 * `?orden=`, etc.) collapse to one canonical URL per path. Shared by
 * `BaseLayout`'s own `<link rel="canonical">`/`og:url` and the per-page
 * JSON-LD that needs the same absolute URL (`url`/`mainEntityOfPage`).
 *
 * @param site - `Astro.site` (may be `undefined` defensively; see {@link FALLBACK_SITE}).
 * @param pathname - `Astro.url.pathname`, e.g. `/es/libros/clean-code`.
 */
export function canonicalUrl(site: URL | undefined, pathname: string): string {
  return new URL(pathname, site ?? FALLBACK_SITE).href;
}

/** One hreflang alternate: a supported language plus its absolute URL. */
export interface HreflangAlternate {
  lang: Lang;
  href: string;
}

/**
 * Hreflang alternates for a lang-prefixed path: swap the first path segment
 * for each language in {@link SUPPORTED_LANGS}, in that order. Every route in
 * this codebase lives under `/<lang>/...` and the SAME route file serves
 * every locale (`astro.config.mjs`'s `i18n` block, `prefixDefaultLocale:
 * true`), so "swap the first segment" is correct for every page without a
 * per-route table to keep in sync.
 *
 * Returns `[]` for a path with no valid lang prefix — the few routes
 * `BaseLayout` never renders for (`/sitemap.xml`, `/robots.txt`, `/api/*`),
 * so there is nothing to alternate.
 *
 * @param pathname - `Astro.url.pathname`, e.g. `/es/libros/clean-code`.
 * @param site - `Astro.site`, forwarded to {@link canonicalUrl}.
 */
export function hreflangAlternates(
  pathname: string,
  site: URL | undefined,
): HreflangAlternate[] {
  const segments = pathname.split('/');
  if (!isValidLang(segments[1])) {
    return [];
  }

  return SUPPORTED_LANGS.map((lang) => {
    const altSegments = [...segments];
    altSegments[1] = lang;
    return { lang, href: canonicalUrl(site, altSegments.join('/')) };
  });
}

/**
 * The `x-default` alternate from a {@link hreflangAlternates} result — always
 * {@link DEFAULT_LANG} (`es`), per the task's own contract ("x-default → es").
 * `undefined` only when `alternates` is empty (no lang prefix).
 */
export function defaultHreflangAlternate(
  alternates: readonly HreflangAlternate[],
): HreflangAlternate | undefined {
  return alternates.find((a) => a.lang === DEFAULT_LANG);
}

/**
 * Section slugs (the path segment right after `/<lang>/`) that are ENTIRELY
 * login/moderator-gated or otherwise not meant for search results:
 *  - `cursos`          — Cursos; no live pages yet (`@lib/access.ts`'s own
 *    `GATED_SECTIONS` gate).
 *  - `crear`           — the activities creator (login-gated per-page, not
 *    through `@lib/access.ts`, which only names `ingles`/`cursos`).
 *  - `mis-actividades` — the author's own workspace (same posture as `crear`).
 *  - `admin`           — moderator-only.
 *  - `auth`            — sign-in/sign-up/reset flows.
 *
 * `ingles` is handled separately in {@link isNoindexPath} because PART of it
 * (guest play) is public.
 */
const NOINDEX_SECTIONS = ['cursos', 'crear', 'mis-actividades', 'admin', 'auth'] as const;

/**
 * Shape-only check for the two guest-play activity routes — a LOCAL copy of
 * `@lib/access.ts#isPublicActivityRoute`'s exact matching rule (matches
 * `/<lang>/ingles/actividades/<id>` and its `/presentar`; does NOT match the
 * bare catalog or `imprimir`), duplicated rather than imported so this module
 * stays free of `@lib/access.ts`'s own import of `@lib/supabase.ts` — which
 * calls `loadEnv()` at module scope and throws immediately when imported
 * with no env configured. `BaseLayout` (every page) imports `isNoindexPath`,
 * so pulling that chain in here would force EVERY page-rendering test in the
 * codebase to additionally stub out Supabase just to resolve a robots-meta
 * boolean. Keep this in sync with `@lib/access.ts#isPublicActivityRoute` if
 * that rule ever changes — `access.test.ts` and `seo.test.ts` each cover
 * their own copy.
 */
function isGuestPlayActivityRoute(pathname: string): boolean {
  const segments = pathname.split('/');
  if (segments[2] !== 'ingles' || segments[3] !== 'actividades') return false;

  const id = segments[4];
  if (!id) return false; // the catalog itself: /<lang>/ingles/actividades

  if (segments.length === 5) return true; // .../actividades/<id>
  return segments.length === 6 && segments[5] === 'presentar';
}

/**
 * Should this path carry `<meta name="robots" content="noindex">`?
 *
 * Pure path rule, same shape as `@lib/access.ts#requiresLogin`: the segment
 * right after the lang (`pathname.split('/')[2]`) names the section.
 * `ingles/**` noindexes everything under it EXCEPT the two guest-play
 * activity routes — {@link isGuestPlayActivityRoute} — which are public
 * content the site wants indexed (spec: guest play). Every other public
 * route (home, libros, noticias, legal) falls through to `false`.
 *
 * @param pathname - `Astro.url.pathname`, e.g. `/es/admin/actividades`.
 */
export function isNoindexPath(pathname: string): boolean {
  const section = pathname.split('/')[2] ?? '';

  if (section === 'ingles') {
    return !isGuestPlayActivityRoute(pathname);
  }

  return (NOINDEX_SECTIONS as readonly string[]).includes(section);
}
