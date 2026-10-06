/**
 * deskHelper — DOM wiring for the Inglés desk hub's floating "helper"
 * character + grammar-tip bubble ("desktop" redesign PART 5). See
 * `DeskHelper.astro`'s own header for the full split between its anti-flash
 * `is:inline` script (fold state only, decided before first paint) and this
 * deferred module, which owns everything safe to settle in just after:
 * correcting the shown tip to the VISITOR's own local calendar day
 * (`pickDailyTipIndex`, `@/content/deskHelperTips` — the server can only
 * guess from its own clock), "Otro tip" cycling, the close/reopen toggle,
 * persisting the fold choice for the rest of the browser session
 * (`sessionStorage`, every access in try/catch), and lifting the widget
 * clear of the footer bar while it is on screen (`IntersectionObserver`,
 * the same geometry the approved mockup's own script uses for `--lift`).
 */
import { characterFallbackSrc, characterSrcSet, type CharacterSlug } from '@/content/characters';
import { pickDailyTipIndex } from '@/content/deskHelperTips';

/** Session-scoped fold choice, read by nothing here (the anti-flash `is:inline` script in `DeskHelper.astro` reads it before paint) but WRITTEN here on every toggle — same string literal, duplicated there on purpose, see that script's own comment. */
export const DESK_HELPER_FOLDED_STORAGE_KEY = 'ingles-desk-helper-folded';

/** Below this width the open bubble can collide with the centred levels dock (owner spec: checked across the whole 1100-1440px desktop range) — duplicated as a literal in `DeskHelper.astro`'s own anti-flash script, which cannot import this module. */
export const DESK_HELPER_OPEN_MIN_WIDTH = 1440;

interface ClientTip {
  slug: CharacterSlug;
  name: string;
  html: string;
}

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

function parseTips(dataEl: Element): ClientTip[] {
  try {
    const parsed = JSON.parse(dataEl.textContent ?? '[]');
    return Array.isArray(parsed) ? (parsed as ClientTip[]) : [];
  } catch {
    return [];
  }
}

/** Paints `tips[index]` into the bubble/avatar — shared by the initial local-date correction and every later "Otro tip" click. */
function render(root: HTMLElement, tips: ClientTip[], index: number, avatarLabelTemplate: string): void {
  const tip = tips[index];
  if (!tip) return;
  root.setAttribute('data-tip-index', String(index));

  const nameEl = root.querySelector<HTMLElement>('[data-desk-helper-name]');
  if (nameEl) nameEl.textContent = tip.name;

  // `tip.html` is AUTHORED content (`DESK_HELPER_TIPS`), never visitor
  // input — same posture as every other static copy string rendered with
  // `set:html` elsewhere in this codebase.
  const tipEl = root.querySelector<HTMLElement>('[data-desk-helper-tip]');
  if (tipEl) tipEl.innerHTML = tip.html;

  const avatar = root.querySelector<HTMLElement>('[data-desk-helper-avatar]');
  if (avatar) avatar.setAttribute('aria-label', avatarLabelTemplate.replace('{name}', tip.name));

  const avifEl = root.querySelector<HTMLSourceElement>('[data-desk-helper-avif]');
  if (avifEl) avifEl.srcset = characterSrcSet(tip.slug, 'avif');
  const webpEl = root.querySelector<HTMLSourceElement>('[data-desk-helper-webp]');
  if (webpEl) webpEl.srcset = characterSrcSet(tip.slug, 'webp');
  const imgEl = root.querySelector<HTMLImageElement>('[data-desk-helper-img]');
  if (imgEl) imgEl.src = characterFallbackSrc(tip.slug);
}

function setFolded(root: HTMLElement, bubble: HTMLElement, avatar: HTMLElement, folded: boolean): void {
  bubble.hidden = folded;
  avatar.setAttribute('aria-expanded', String(!folded));
  root.setAttribute('data-folded', String(folded));
}

/**
 * Wires the helper, if present on the page (a no-op everywhere except the
 * hub). Safe to call more than once (re-reads the DOM fresh each time, same
 * posture as `initDeskWidgets`/`initDeskDrag`).
 */
export function initDeskHelper(doc: Document = document): void {
  const root = doc.getElementById('desk-helper');
  const bubble = doc.getElementById('desk-helper-bubble');
  const avatar = doc.getElementById('desk-helper-avatar');
  const nextButton = doc.getElementById('desk-helper-next');
  const closeButton = doc.getElementById('desk-helper-close');
  const dataEl = doc.getElementById('desk-helper-data');
  if (!root || !bubble || !avatar || !nextButton || !closeButton || !dataEl) return;

  // Guard against double-wiring: `index.astro`'s own script element calls
  // this both immediately AND on `astro:page-load` (which also fires for
  // the very first load) — safe for `initDeskWidgets`/`initDeskDrag` since
  // their own work is idempotent, but a SECOND `addEventListener('click', …)`
  // here would double-toggle fold/cycle on every click (two listeners firing
  // once each, the second reading the state the first just flipped). The
  // flag lives on the element itself, not a module-level variable, so a
  // genuine client-side navigation that replaces this markup still re-wires.
  if (root.dataset.deskHelperReady === 'true') return;
  root.dataset.deskHelperReady = 'true';

  const tips = parseTips(dataEl);
  if (tips.length === 0) return;

  const avatarLabelTemplate = root.getAttribute('data-avatar-label-template') ?? '{name}';

  // Correct the server-rendered (server-clock) tip to the visitor's own
  // local calendar day, if it differs.
  const ssrIndex = Number.parseInt(root.getAttribute('data-tip-index') ?? '0', 10);
  const localIndex = pickDailyTipIndex(new Date(), tips.length);
  if (localIndex !== ssrIndex) {
    render(root, tips, localIndex, avatarLabelTemplate);
  }

  nextButton.addEventListener('click', () => {
    const current = Number.parseInt(root.getAttribute('data-tip-index') ?? '0', 10);
    render(root, tips, (current + 1) % tips.length, avatarLabelTemplate);
  });

  function toggle(folded: boolean): void {
    setFolded(root as HTMLElement, bubble as HTMLElement, avatar as HTMLElement, folded);
    writeStoredFold(folded);
  }

  avatar.addEventListener('click', () => toggle(!(bubble as HTMLElement).hidden));
  closeButton.addEventListener('click', () => toggle(true));

  // Lifts clear of the footer bar while it is on screen, so the helper
  // never covers it — the hub's own `[data-chrome-footer]` element, same
  // geometry as the mockup's own `.bar` + `--lift` pair.
  const bar = doc.querySelector('[data-chrome-footer]');
  if (bar) {
    new IntersectionObserver(
      ([entry]) => {
        const height = entry && entry.isIntersecting ? Math.round(entry.intersectionRect.height) : 0;
        (root as HTMLElement).style.setProperty('--desk-helper-lift', `${height}px`);
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    ).observe(bar);
  }
}

// `readStoredFold` is exported only for the jsdom test below (asserting the
// fold choice actually reaches storage) — never read at runtime here, since
// the anti-flash `is:inline` script in `DeskHelper.astro` is what reads it
// before paint.
export { readStoredFold };
