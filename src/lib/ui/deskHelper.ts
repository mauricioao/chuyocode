/**
 * deskHelper — DOM wiring for the Inglés desk hub's floating "helper"
 * character + grammar-tip bubble ("desktop" redesign PART 5). See
 * `DeskHelper.astro`'s own header for the full split between its anti-flash
 * `is:inline` script (fold state only, decided before first paint) and this
 * deferred module, which owns everything safe to settle in just after: the
 * close/reopen toggle, persisting the fold choice for the rest of the
 * browser session (`sessionStorage`, every access in try/catch), lifting the
 * widget clear of the footer bar while it is on screen (`IntersectionObserver`,
 * the same geometry the approved mockup's own script uses for `--lift`), and
 * "Otro tip" (PART 7, owner spec 2026-10-06: "100 tips revisados, sin
 * repetir").
 *
 * PART 7 changed how tips are DELIVERED: the server only ever embeds the ONE
 * tip it randomly picked (`DeskHelper.astro`, `pickRandomTipIndex`) — never
 * all 100 — so the first "Otro tip" click lazily fetches the full
 * per-language list (`@lib/ui/deskHelperTipsClient#loadFullTips`, cached in
 * memory for the rest of the page's life) and every click after that pulls
 * the next id off a shuffled, `sessionStorage`-persisted no-repeat queue
 * (`@lib/ui/deskHelperQueue`). The daily/local-date tip correction this
 * module used to own is GONE — there is no more "today's tip" to correct
 * once the pick is random on every render.
 */
import { CHARACTERS, characterFallbackSrc, characterSrcSet } from '@/content/characters';
import { readTipQueue, takeNextTipId, writeTipQueue } from '@lib/ui/deskHelperQueue';
import { loadFullTips, type DeskHelperClientTip } from '@lib/ui/deskHelperTipsClient';
import type { Lang } from '@lib/i18n';

/** Session-scoped fold choice, read by nothing here (the anti-flash `is:inline` script in `DeskHelper.astro` reads it before paint) but WRITTEN here on every toggle — same string literal, duplicated there on purpose, see that script's own comment. */
export const DESK_HELPER_FOLDED_STORAGE_KEY = 'ingles-desk-helper-folded';

/** Below this width the open bubble can collide with the centred levels dock (owner spec: checked across the whole 1100-1440px desktop range) — duplicated as a literal in `DeskHelper.astro`'s own anti-flash script, which cannot import this module. */
export const DESK_HELPER_OPEN_MIN_WIDTH = 1440;

function readStoredFold(): string | null {
  try {
    return sessionStorage.getItem(DESK_HELPER_FOLDED_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredFold(folded: boolean): void {
  try {
    sessionStorage.setItem(DESK_HELPER_FOLDED_STORAGE_KEY, String(folded));
  } catch {
    // Unavailable/blocked storage (private mode, quota, etc.) — the fold
    // choice simply does not persist across reloads this session.
  }
}

/** Paints `tip` into the bubble/avatar — shared by the initial server-picked tip's `data-*` bookkeeping (no re-render needed, the markup already shows it) and every "Otro tip" click. */
function render(
  root: HTMLElement,
  tip: DeskHelperClientTip,
  lang: Lang,
  avatarLabelTemplate: string,
): void {
  const name = CHARACTERS[tip.character].alt[lang];
  root.setAttribute('data-tip-id', tip.id);

  const nameEl = root.querySelector<HTMLElement>('[data-desk-helper-name]');
  if (nameEl) nameEl.textContent = name;

  // `tip.html` is AUTHORED content (`DESK_HELPER_TIPS`, via the
  // `/desk-tips-{lang}.json` endpoint), never visitor input — same
  // posture as every other static copy string rendered with
  // `set:html`/`innerHTML` elsewhere in this codebase.
  const tipEl = root.querySelector<HTMLElement>('[data-desk-helper-tip]');
  if (tipEl) tipEl.innerHTML = tip.html;

  const avatar = root.querySelector<HTMLElement>('[data-desk-helper-avatar]');
  if (avatar) avatar.setAttribute('aria-label', avatarLabelTemplate.replace('{name}', name));

  const avifEl = root.querySelector<HTMLSourceElement>('[data-desk-helper-avif]');
  if (avifEl) avifEl.srcset = characterSrcSet(tip.character, 'avif');
  const webpEl = root.querySelector<HTMLSourceElement>('[data-desk-helper-webp]');
  if (webpEl) webpEl.srcset = characterSrcSet(tip.character, 'webp');
  const imgEl = root.querySelector<HTMLImageElement>('[data-desk-helper-img]');
  if (imgEl) imgEl.src = characterFallbackSrc(tip.character);
}

function setFolded(root: HTMLElement, bubble: HTMLElement, avatar: HTMLElement, folded: boolean): void {
  bubble.hidden = folded;
  avatar.setAttribute('aria-expanded', String(!folded));
  root.setAttribute('data-folded', String(folded));
}

function isLang(value: string | undefined): value is Lang {
  return value === 'es' || value === 'en';
}

/**
 * Wires the helper, if present on the page (a no-op everywhere except the
 * hub). Safe to call more than once (re-reads the DOM fresh each time, same
 * posture as `initDeskWidgets`/`initDeskDrag`). `fetchImpl`/`storage` are
 * injectable for tests; runtime callers never pass them.
 */
export function initDeskHelper(
  doc: Document = document,
  fetchImpl: typeof fetch = fetch,
  storage: Pick<Storage, 'getItem' | 'setItem'> = sessionStorage,
): void {
  const root = doc.getElementById('desk-helper');
  const bubble = doc.getElementById('desk-helper-bubble');
  const avatar = doc.getElementById('desk-helper-avatar');
  const nextButton = doc.getElementById('desk-helper-next');
  const closeButton = doc.getElementById('desk-helper-close');
  if (!root || !bubble || !avatar || !nextButton || !closeButton) return;

  // Narrowed into fresh, explicitly-typed bindings: TypeScript's
  // control-flow narrowing above does not persist into the nested
  // `handleOtroTip`/`toggle` closures below (a well-known limitation, not a
  // runtime concern — `root`/`bubble`/`avatar` are `const`, so the guard
  // above holds for the rest of this call).
  const helperRoot: HTMLElement = root;
  const helperBubble: HTMLElement = bubble;
  const helperAvatar: HTMLElement = avatar;

  const langAttr = helperRoot.getAttribute('data-lang') ?? undefined;
  if (!isLang(langAttr)) return;
  const lang: Lang = langAttr;

  // Guard against double-wiring: `index.astro`'s own script element calls
  // this both immediately AND on `astro:page-load` (which also fires for
  // the very first load) — safe for `initDeskWidgets`/`initDeskDrag` since
  // their own work is idempotent, but a SECOND `addEventListener('click', …)`
  // here would double-toggle fold/cycle on every click (two listeners firing
  // once each, the second reading the state the first just flipped). The
  // flag lives on the element itself, not a module-level variable, so a
  // genuine client-side navigation that replaces this markup still re-wires.
  if (helperRoot.dataset.deskHelperReady === 'true') return;
  helperRoot.dataset.deskHelperReady = 'true';

  const avatarLabelTemplate = helperRoot.getAttribute('data-avatar-label-template') ?? '{name}';

  let fetchInFlight = false;

  async function handleOtroTip(): Promise<void> {
    if (fetchInFlight) return; // a stray double-click mid-fetch is a no-op, not a second request.
    fetchInFlight = true;
    try {
      const fullTips = await loadFullTips(lang, fetchImpl);
      const allIds = fullTips.map((tip) => tip.id);
      const currentId = helperRoot.getAttribute('data-tip-id');
      const storedQueue = readTipQueue(storage);
      const { id, queue } = takeNextTipId(storedQueue, allIds, { excludeOnReshuffle: currentId });
      writeTipQueue(queue, storage);
      if (id == null) return;
      const tip = fullTips.find((candidate) => candidate.id === id);
      if (!tip) return;
      render(helperRoot, tip, lang, avatarLabelTemplate);
    } catch {
      // A network hiccup (or a blocked/unavailable endpoint) just leaves the
      // current tip showing — never worth a visible error over.
    } finally {
      fetchInFlight = false;
    }
  }

  nextButton.addEventListener('click', () => {
    void handleOtroTip();
  });

  function toggle(folded: boolean): void {
    setFolded(helperRoot, helperBubble, helperAvatar, folded);
    writeStoredFold(folded);
  }

  helperAvatar.addEventListener('click', () => toggle(!helperBubble.hidden));
  closeButton.addEventListener('click', () => toggle(true));

  // Lifts clear of the footer bar while it is on screen, so the helper
  // never covers it — the hub's own `[data-chrome-footer]` element, same
  // geometry as the mockup's own `.bar` + `--lift` pair.
  const bar = doc.querySelector('[data-chrome-footer]');
  if (bar) {
    new IntersectionObserver(
      ([entry]) => {
        const height = entry && entry.isIntersecting ? Math.round(entry.intersectionRect.height) : 0;
        helperRoot.style.setProperty('--desk-helper-lift', `${height}px`);
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    ).observe(bar);
  }
}

// Exported only for the jsdom tests below (asserting the fold choice/tip
// queue actually reach storage) — never read at runtime here beyond what
// `initDeskHelper` itself already wires up.
export { readStoredFold };
