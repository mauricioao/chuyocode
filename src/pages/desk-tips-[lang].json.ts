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
 * Served from SSR, not prerendered: a prerendered route makes `astro build`
 * run the middleware, whose imports load the deployment secrets at import
 * time, and CI builds without them (`src/pagesNoPrerender.test.ts`). The
 * response never depends on `Astro.locals`/cookies/geo, so Netlify's CDN can
 * keep it until the next deploy (which purges it) with no function
 * invocation per visitor; browsers keep it for an hour only, because the URL
 * carries no content hash and a tip edit must reach returning visitors.
 *
 * Payload stays minimal: `{ id, character, html }` per tip. The character's
 * DISPLAY NAME and avatar image are resolved client-side from `CharacterSlug`
 * through `@/content/characters` (already imported by `deskHelper.ts` for
 * the SSR-picked tip) rather than repeated 100 times in this JSON.
 */
import type { APIRoute } from 'astro';
import { isValidLang } from '@lib/i18n';
import { DESK_HELPER_TIPS } from '@/content/deskHelperTips';
import type { CharacterSlug } from '@/content/characters';

export interface DeskTipPayload {
  id: string;
  character: CharacterSlug;
  html: string;
}

export const GET: APIRoute = ({ params }) => {
  const lang = params.lang;
  if (!lang || !isValidLang(lang)) {
    return new Response(null, { status: 404 });
  }
  const body: DeskTipPayload[] = DESK_HELPER_TIPS.map((tip) => ({
    id: tip.id,
    character: tip.character,
    html: tip[lang],
  }));

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=3600',
      'netlify-cdn-cache-control': 'public, durable, max-age=31536000',
    },
  });
};
