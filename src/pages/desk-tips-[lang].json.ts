/**
 * GET /desk-tips-{lang}.json — the desk helper's FULL per-language tip list
 * (owner spec PART 7: 100 reviewed tips, "Otro tip" cycles through all of
 * them without repeats). `DeskHelper.astro`'s own server render only ever
 * embeds the ONE tip it picked, so the hub's page weight does not grow with
 * every tip added — this static, `immutable`-cacheable endpoint is what
 * `@lib/ui/deskHelper.ts` fetches lazily, once, on the visitor's FIRST "Otro
 * tip" click, caching the result in memory for the rest of that page's life.
 *
 * TOP-LEVEL on purpose (not `/data/desk-tips-{lang}.json`): `middleware.ts`'s
 * own locale router (`isNonLocalePath`) only ever treats a FIRST path
 * segment with a dot in it as a non-locale file (`/sitemap.xml`,
 * `/robots.txt`) — a deeper dot belongs to a page slug on purpose (see that
 * file's own header), so `/data/desk-tips-es.json` would have its first
 * segment ("data") rejected as an unsupported "locale" before this route
 * ever ran. Naming the file itself `desk-tips-[lang].json.ts`, same
 * convention as `sitemap.xml.ts`/`robots.txt.ts`, puts the dot in that first
 * segment and reaches this handler with no middleware change needed.
 *
 * `prerender = true` + `getStaticPaths` opts these two routes OUT of this
 * otherwise fully SSR site (`astro.config.mjs`'s `output: 'server'` — see
 * that file's own header) and into build-time static generation: the
 * response never depends on `Astro.locals`/cookies/geo, so there is nothing
 * here that NEEDS a live request, and shipping it as a build-time static
 * asset means Netlify's CDN serves it with zero function invocations.
 *
 * Payload stays minimal: `{ id, character, html }` per tip. The character's
 * DISPLAY NAME and avatar image are resolved client-side from `CharacterSlug`
 * through `@/content/characters` (already imported by `deskHelper.ts` for
 * the SSR-picked tip) rather than repeated 100 times in this JSON.
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { SUPPORTED_LANGS, type Lang } from '@lib/i18n';
import { DESK_HELPER_TIPS } from '@/content/deskHelperTips';
import type { CharacterSlug } from '@/content/characters';

export const prerender = true;

export const getStaticPaths: GetStaticPaths = () =>
  SUPPORTED_LANGS.map((lang) => ({ params: { lang } }));

export interface DeskTipPayload {
  id: string;
  character: CharacterSlug;
  html: string;
}

export const GET: APIRoute = ({ params }) => {
  const lang = params.lang as Lang;
  const body: DeskTipPayload[] = DESK_HELPER_TIPS.map((tip) => ({
    id: tip.id,
    character: tip.character,
    html: tip[lang],
  }));

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Build-time static content, keyed by lang in the URL itself — safe to
      // cache for a long time; a content change ships under a new deploy.
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
};
