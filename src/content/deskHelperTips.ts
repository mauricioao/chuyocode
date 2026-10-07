/**
 * deskHelperTips — curated grammar/vocabulary tips for the Inglés desk hub's
 * floating "helper" character ("desktop" redesign PART 5, approved mockup
 * `ChuyoCode_others/propuestas/ingles-escritorio/index.html`'s `.helper` /
 * `.bubble` / `.who`, owner's words: "los avatares podrían salir como una
 * ayuda muchas veces desde la parte inferior izquierda con un globo de texto
 * dando ayudas").
 *
 * PART 7 (owner spec 2026-10-06, "100 tips revisados, sin repetir"): the 20
 * launch tips are now the full reviewed set of 100 (20 per character,
 * `./deskHelperTips.json`, the single source of truth), and this module is a
 * typed LOADER over that JSON rather than the tips themselves. Authors write
 * `*like this*` around the English term/example in the JSON (readable
 * Markdown-ish text, not hand-typed HTML); {@link renderHighlightMarkup}
 * converts it into the `<em>` highlight the bubble already styles, once,
 * here at module-load time — every consumer (`DeskHelper.astro`'s first,
 * server-picked tip; `/desk-tips-{lang}.json`'s full per-language list
 * for "Otro tip") receives plain, render-ready HTML, exactly like the old
 * hand-authored `<em>` strings did.
 *
 * `es`/`en` are therefore AUTHORED, render-ready content (escaped through
 * {@link renderHighlightMarkup}, never visitor input), so rendering them with
 * `set:html`/`innerHTML` carries no injection risk — same posture as every
 * other static copy string in `@lib/i18n.ts`.
 */
import type { CharacterSlug } from '@/content/characters';
import { renderHighlightMarkup } from '@lib/text/highlightMarkup';
import rawTipsJson from './deskHelperTips.json';

/** The on-disk shape: `es`/`en` still carry the raw `*term*` authoring markup. */
interface RawDeskHelperTip {
  id: string;
  character: CharacterSlug;
  /** Loose grouping, reserved for a future filter/picker — not read anywhere yet. */
  topic: string;
  /** CEFR band, same reserved posture as `topic`. */
  level: string;
  es: string;
  en: string;
}

export interface DeskHelperTip {
  /** Stable id — never reused across entries, never renumbered. Also the dedupe/no-repeat key for the client-side shuffle queue (`@lib/ui/deskHelperQueue`). */
  id: string;
  character: CharacterSlug;
  topic: string;
  level: string;
  /** Spanish explanation, English term(s)/example already converted to `<em>…</em>`. */
  es: string;
  /** English explanation, same term(s)/example already converted to `<em>…</em>`. */
  en: string;
}

const RAW_TIPS = rawTipsJson as readonly RawDeskHelperTip[];

export const DESK_HELPER_TIPS: readonly DeskHelperTip[] = RAW_TIPS.map((tip) => ({
  ...tip,
  es: renderHighlightMarkup(tip.es),
  en: renderHighlightMarkup(tip.en),
}));

/**
 * Picks a RANDOM tip index (owner spec PART 7 — replacing the old
 * deterministic "today's tip" pick now that there are 100 of them and a
 * client-side no-repeat queue takes over for every tip after the first; see
 * `@lib/ui/deskHelperQueue`). `random` is injectable so a test can pin the
 * pick instead of stubbing the global `Math.random`.
 */
export function pickRandomTipIndex(length: number, random: () => number = Math.random): number {
  if (length <= 0) return 0;
  return Math.floor(random() * length);
}
