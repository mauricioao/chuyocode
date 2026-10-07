/**
 * deskHelperTipsClient — lazily fetches the desk helper's FULL per-language
 * tip list (owner spec PART 7) from the static endpoint
 * `/data/desk-tips-{lang}.json` (`src/pages/data/desk-tips-[lang].json.ts`),
 * exactly once per language per page life: the hub's own server render only
 * ever embeds the ONE tip it picked (see `DeskHelper.astro`), so this is
 * what `@lib/ui/deskHelper.ts` calls on the visitor's FIRST "Otro tip"
 * click — every later click within the same page life reuses the in-memory
 * cache below instead of re-fetching.
 *
 * The cache is intentionally module-level, in-memory ONLY (never
 * `sessionStorage`/`localStorage`): it only ever needs to survive for the
 * life of one page — a reload re-fetches, which is fine, since the endpoint
 * itself is a long-lived, `immutable`-cached static asset the browser's own
 * HTTP cache already makes cheap.
 */
import type { CharacterSlug } from '@/content/characters';
import type { Lang } from '@lib/i18n';

export interface DeskHelperClientTip {
  id: string;
  character: CharacterSlug;
  html: string;
}

const cache = new Map<Lang, DeskHelperClientTip[]>();
const inFlight = new Map<Lang, Promise<DeskHelperClientTip[]>>();

/**
 * Fetches (or reuses the cached/in-flight) full tip list for `lang`.
 * Concurrent calls for the SAME language while a fetch is already in flight
 * share that one request rather than firing a second — guards a visitor who
 * double-clicks "Otro tip" before the first response lands.
 */
export async function loadFullTips(
  lang: Lang,
  fetchImpl: typeof fetch = fetch,
): Promise<DeskHelperClientTip[]> {
  const cached = cache.get(lang);
  if (cached) return cached;

  const pending = inFlight.get(lang);
  if (pending) return pending;

  const request = (async () => {
    try {
      const res = await fetchImpl(`/data/desk-tips-${lang}.json`);
      if (!res.ok) throw new Error(`desk helper tips fetch failed: ${res.status}`);
      const body = (await res.json()) as DeskHelperClientTip[];
      cache.set(lang, body);
      return body;
    } finally {
      inFlight.delete(lang);
    }
  })();

  inFlight.set(lang, request);
  return request;
}

/** Test-only escape hatch — the module-level cache would otherwise leak between test cases in the same file/worker. Never called from runtime code. */
export function clearDeskHelperTipsCacheForTests(): void {
  cache.clear();
  inFlight.clear();
}
