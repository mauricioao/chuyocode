/**
 * highlightMarkup — converts the tiny authoring convention used by the desk
 * helper's 100 tips (`src/content/deskHelperTips.json`: `*word*` around the
 * English term/example to highlight) into the `<em>` markup the bubble
 * already styles (a yellow-tinted background, not italic — see
 * `DeskHelper.astro`'s own `[&_em]:` utilities).
 *
 * Authors write plain `*like this*` in the JSON instead of hand-typing
 * `<em>` so the source data stays readable Markdown-ish text rather than a
 * pile of inline HTML — this is the ONLY place that convention is
 * interpreted, at module-load time in `@/content/deskHelperTips`, so every
 * consumer (`DeskHelper.astro`, the per-language tips endpoint) already
 * receives plain, render-ready HTML.
 *
 * Everything outside a `*…*` pair is HTML-escaped, same as any other
 * untrusted-shaped text getting `set:html`/`innerHTML`'d — even though this
 * specific input is authored, not visitor-submitted, escaping it costs
 * nothing and means a future author typing a stray `&`/`<` in a tip can
 * never break the page. An unbalanced `*` (no matching close, or `**` with
 * nothing between) has nothing to pair with, so it renders as the literal
 * character instead of silently disappearing or throwing.
 */

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/** Matches a balanced `*…*` pair whose content has no further `*` inside — tip copy never nests emphasis, so this stays a simple, predictable left-to-right pairing. */
const EMPHASIS_PAIR = /\*([^*]+)\*/g;

export function renderHighlightMarkup(raw: string): string {
  let result = '';
  let lastIndex = 0;
  for (const match of raw.matchAll(EMPHASIS_PAIR)) {
    const [whole, inner] = match;
    const start = match.index ?? 0;
    result += escapeHtml(raw.slice(lastIndex, start));
    result += `<em>${escapeHtml(inner)}</em>`;
    lastIndex = start + whole.length;
  }
  result += escapeHtml(raw.slice(lastIndex));
  return result;
}
