/**
 * Minimized-windows tray — the desk's own "minimized windows" tray (owner
 * feedback 2026-10-06, replacing the old behaviour where the yellow light
 * just navigated to the hub exactly like the red one). A real minimize: the
 * window's own id/title/url get remembered for the rest of the browser
 * SESSION (`sessionStorage`, never `localStorage` — this is not a "remember
 * forever" feature), so a small rectangle renders for each one.
 *
 * PART 6c (owner spec 2026-10-07, "se baja en un pequeño rectángulo en la
 * parte inferior derecha"): the tray moved OUT of the levels dock into its
 * own fixed bottom-right container (`MinimizedWindowsTray.astro`), and each
 * chip grew from an icon-only 56px squircle back into a small ~200×44px
 * rectangle with a visible (truncated) title — easier to tell apart at a
 * glance once they are not all crammed into one shelf next to six level
 * tiles anymore.
 *
 * Split the same way `deskWindow.ts`/`backNavigation.ts` are: pure, zero-DOM
 * list operations ({@link withMinimizedWindow}, {@link withoutMinimizedWindow},
 * {@link parseMinimizedWindows}) that are fully unit-testable, plus thin
 * Storage-reading/writing wrappers (`try`/`catch`-guarded, every access —
 * private browsing, quota, disabled storage) and a DOM-rendering function for
 * `MinimizedWindowsTray.astro`'s own tray element.
 */

export const MINIMIZED_WINDOWS_STORAGE_KEY = 'ingles-desk-minimized-windows';

/** At most this many chips — oldest (least recently minimized/reopened) dropped first. */
export const MAX_MINIMIZED_WINDOWS = 5;

/**
 * At most this many chips render DIRECTLY in the dock (polish pass
 * 2026-10-06, owner report `dock-three-chips.png`: beyond this the dock kept
 * widening to the left, under the open helper bubble). Anything past this
 * collapses into one "+N" tile that opens a small menu listing the rest —
 * see {@link renderMinimizedWindowsTray}.
 */
export const MAX_VISIBLE_MINIMIZED_CHIPS = 3;

/** Below this viewport width the dock has no room for three chips next to the six level tiles (it would scroll and hide A1, or reach the folders column), so only one chip shows before the "+N" tile. */
export const NARROW_DESK_WIDTH = 1280;

/** How many chips render directly at a given viewport width — the rest collapse into the "+N" tile. */
export function visibleChipLimit(viewportWidth: number): number {
  return viewportWidth < NARROW_DESK_WIDTH ? 1 : MAX_VISIBLE_MINIMIZED_CHIPS;
}

export interface MinimizedWindowEntry {
  /** The activity id — also the dedupe key (re-minimizing the same activity moves it to the front instead of duplicating it). */
  id: string;
  /** The window's own title, shown on the chip. */
  title: string;
  /** Where the chip's click reopens to — the practice page's own real URL (path + query), never a synthesized one. */
  href: string;
  /** Reserved for a future real thumbnail; always `null` today (icon-only chip — see `renderMinimizedWindowsTray`). */
  thumbnail: string | null;
  /** `Date.now()` at the moment it was minimized (or reopened — see {@link withMinimizedWindow}), oldest-first eviction. */
  t: number;
}

function isMinimizedWindowEntry(value: unknown): value is MinimizedWindowEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    v.id.length > 0 &&
    typeof v.title === 'string' &&
    typeof v.href === 'string' &&
    (v.thumbnail === null || typeof v.thumbnail === 'string') &&
    typeof v.t === 'number'
  );
}

/**
 * Pure: parse whatever `sessionStorage` returned. Anything malformed
 * (corrupted JSON, a non-array, an entry missing a field) degrades to the
 * empty list rather than throwing — a visitor's tray is never worth a hard
 * failure over.
 */
export function parseMinimizedWindows(raw: string | null): MinimizedWindowEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isMinimizedWindowEntry);
  } catch {
    return [];
  }
}

/**
 * Pure: add (or move-to-front, re-minimizing the same activity) `entry`,
 * capped at {@link MAX_MINIMIZED_WINDOWS} — the OLDEST entry (by position,
 * since the list is always kept newest-first) is dropped once the cap is
 * exceeded, never the one just added.
 */
export function withMinimizedWindow(
  entries: readonly MinimizedWindowEntry[],
  entry: MinimizedWindowEntry,
): MinimizedWindowEntry[] {
  const withoutExisting = entries.filter((e) => e.id !== entry.id);
  return [entry, ...withoutExisting].slice(0, MAX_MINIMIZED_WINDOWS);
}

/** Pure: remove the entry for `id`, if any — a no-op (same array shape, new reference) when it is not present. */
export function withoutMinimizedWindow(
  entries: readonly MinimizedWindowEntry[],
  id: string,
): MinimizedWindowEntry[] {
  return entries.filter((e) => e.id !== id);
}

/** Read the tray, `try`/`catch`-guarded. */
export function readMinimizedWindows(storage: Pick<Storage, 'getItem'> = sessionStorage): MinimizedWindowEntry[] {
  try {
    return parseMinimizedWindows(storage.getItem(MINIMIZED_WINDOWS_STORAGE_KEY));
  } catch {
    return [];
  }
}

/** Persist the tray, `try`/`catch`-guarded. */
export function writeMinimizedWindows(
  entries: readonly MinimizedWindowEntry[],
  storage: Pick<Storage, 'setItem'> = sessionStorage,
): void {
  try {
    storage.setItem(MINIMIZED_WINDOWS_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Best-effort — a visitor who blocks storage just loses the tray across reloads.
  }
}

/** Read-modify-write: add/move-to-front `entry`, persist, and return the new list. */
export function addMinimizedWindow(
  entry: MinimizedWindowEntry,
  storage: Pick<Storage, 'getItem' | 'setItem'> = sessionStorage,
): MinimizedWindowEntry[] {
  const next = withMinimizedWindow(readMinimizedWindows(storage), entry);
  writeMinimizedWindows(next, storage);
  return next;
}

/** Read-modify-write: remove `id`, persist, and return the new list. Called both by the chip's own "×" and by the red light (closing for good clears any chip for that activity). */
export function removeMinimizedWindow(
  id: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> = sessionStorage,
): MinimizedWindowEntry[] {
  const next = withoutMinimizedWindow(readMinimizedWindows(storage), id);
  writeMinimizedWindows(next, storage);
  return next;
}

export const MINIMIZED_TRAY_ATTR = {
  container: 'data-minimized-tray',
  chip: 'data-minimized-chip',
  /** The "+N" overflow tile's own button — see {@link renderMinimizedWindowsTray}. */
  more: 'data-minimized-tray-more',
} as const;

/** Fills the `{n}` placeholder in a localized "+N" template (e.g. "{n} more windows"). */
function fillMoreLabel(template: string, n: number): string {
  return template.replace('{n}', String(n));
}

/**
 * A plain document-glyph SVG — the chip's preview when `entry.thumbnail` is
 * `null` (every entry today; the field is reserved for a future real
 * thumbnail, see {@link MinimizedWindowEntry}). Built with `createElementNS`
 * rather than `innerHTML`/a template string: this file already builds every
 * other element through the DOM API, and an inline SVG string would be the
 * one exception.
 */
function createDocumentGlyph(doc: Document): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(NS, 'svg') as SVGSVGElement;
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'h-4 w-4 text-muted-foreground');

  const path = doc.createElementNS(NS, 'path');
  // A page with a folded top-right corner, plus two text lines — legible at
  // this size inside the chip's own small preview square without reading
  // as a random glyph.
  path.setAttribute(
    'd',
    'M6 2.5h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Z M14 2.5v4h4 M8.5 13h7 M8.5 16.5h5',
  );
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.5');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('stroke-linecap', 'round');
  svg.appendChild(path);
  return svg;
}

/**
 * Builds one chip — shared by the directly-visible chips and (in a simpler
 * form) nothing else; factored out purely to keep
 * {@link renderMinimizedWindowsTray} readable.
 *
 * A SMALL RECTANGLE (PART 6c, owner spec 2026-10-07: "un pequeño rectángulo
 * en la parte inferior derecha" — ~200×44px): a preview square (the
 * activity's thumbnail when known, else a document glyph) plus the
 * (truncated) title, visible again now that each chip lives in its own
 * fixed corner tray rather than squeezed into the levels dock next to six
 * level tiles. `title` (a native tooltip) + the anchor's own `aria-label`
 * still carry the UNtruncated title for anyone who needs it.
 *
 * The chip is a plain `<a href>` carrying `data-desk-window-open` with the
 * SAME id `@lib/ui/deskWindow.ts#initDeskWindowOpeners` already listens for
 * — reopening a chip gets the exact scale-in-from-this-spot treatment any
 * other opener gets, with no new wiring. Its own "×" is a `<button>` that
 * stops the click from reaching the anchor (`stopPropagation` +
 * `preventDefault`) so hovering/clicking it removes the chip instead of
 * reopening the window; it is visible on hover/focus only, but — being a
 * real, always-present `<button>` in the DOM, never `display:none` — stays
 * reachable by keyboard regardless (`focus-visible:opacity-100` below).
 */
function createChip(
  entry: MinimizedWindowEntry,
  removeLabel: string,
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  doc: Document,
  onRemoved: () => void,
): HTMLAnchorElement {
  const chip = doc.createElement('a');
  chip.href = entry.href;
  chip.setAttribute('data-desk-window-open', entry.id);
  chip.setAttribute(MINIMIZED_TRAY_ATTR.chip, entry.id);
  chip.title = entry.title;
  chip.setAttribute('aria-label', entry.title);
  chip.className =
    'ingles-glass group relative flex h-11 w-[200px] shrink-0 items-center gap-2 overflow-hidden px-2.5 transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  const preview = doc.createElement('span');
  preview.setAttribute('aria-hidden', 'true');
  preview.className =
    'flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-[9px] bg-gradient-to-b from-card to-muted';
  if (entry.thumbnail) {
    const img = doc.createElement('img');
    img.src = entry.thumbnail;
    img.alt = '';
    img.className = 'h-full w-full object-cover';
    preview.appendChild(img);
  } else {
    preview.appendChild(createDocumentGlyph(doc));
  }
  chip.appendChild(preview);

  const titleEl = doc.createElement('span');
  titleEl.className = 'min-w-0 flex-1 truncate text-[12.5px] font-medium text-foreground';
  titleEl.textContent = entry.title;
  chip.appendChild(titleEl);

  const closeButton = doc.createElement('button');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', removeLabel);
  closeButton.className =
    'absolute -top-1.5 -right-1.5 grid h-5 w-5 place-items-center rounded-full border border-border bg-card text-muted-foreground opacity-0 shadow-[0_1px_2px_rgb(28_28_30_/_0.12)] transition-opacity hover:bg-border hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100';
  closeButton.textContent = '×';
  closeButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    removeMinimizedWindow(entry.id, storage);
    onRemoved();
  });
  chip.appendChild(closeButton);

  return chip;
}

/** The `[role="menu"]` popover's own marker attribute — see {@link createOverflowTile}'s header for why it lives on `doc.body`, not inside the tray. */
const OVERFLOW_MENU_ATTR = 'data-minimized-tray-menu';

/**
 * Builds the "+N" overflow tile — same 44px-tall "glass" footprint as a
 * chip (just square, no title to show), but a `<button>` (not an opener)
 * that toggles a small `role="menu"` popover listing every entry past
 * {@link MAX_VISIBLE_MINIMIZED_CHIPS} as a plain link (accessible:
 * `aria-haspopup`/`aria-expanded`, a list of links, Escape closes — owner
 * spec 2026-10-06). Each link still carries `data-desk-window-open`, so
 * reopening from inside the menu gets the exact same treatment as a
 * directly-visible chip, with no extra wiring.
 *
 * The menu is appended to `doc.body`, positioned with `position: fixed`
 * from the button's own `getBoundingClientRect()` at OPEN time, rather than
 * nested `position: absolute` inside the button's own wrapper — the tray
 * container itself may be narrower than the menu (and sits right at the
 * viewport's own edge), so an ancestor-relative popover would risk being
 * clipped. Returns the button alone (the tray's own flex child); the caller
 * is responsible for clearing any previous menu from `doc.body` before
 * building a new one — see {@link renderMinimizedWindowsTray}.
 */
function createOverflowTile(
  overflowEntries: readonly MinimizedWindowEntry[],
  moreLabelTemplate: string,
  doc: Document,
): HTMLElement {
  const moreLabel = fillMoreLabel(moreLabelTemplate, overflowEntries.length);

  const button = doc.createElement('button');
  button.type = 'button';
  button.setAttribute(MINIMIZED_TRAY_ATTR.more, '');
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-label', moreLabel);
  button.title = moreLabel;
  button.textContent = `+${overflowEntries.length}`;
  button.className =
    'ingles-glass flex h-11 w-11 shrink-0 items-center justify-center text-sm font-semibold text-foreground transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  const menu = doc.createElement('div');
  menu.setAttribute(OVERFLOW_MENU_ATTR, '');
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', moreLabel);
  menu.hidden = true;
  menu.className = 'fixed z-50 w-48 rounded-md border border-border bg-popover p-1 shadow-lg';

  for (const entry of overflowEntries) {
    const link = doc.createElement('a');
    link.href = entry.href;
    link.setAttribute('role', 'menuitem');
    link.setAttribute('data-desk-window-open', entry.id);
    link.textContent = entry.title;
    link.className = 'block truncate rounded px-2 py-1.5 text-sm text-foreground hover:bg-muted';
    menu.appendChild(link);
  }

  button.addEventListener('click', () => {
    const willOpen = menu.hidden;
    if (willOpen) {
      const rect = button.getBoundingClientRect();
      const MENU_WIDTH = 192; // w-48
      const GAP = 8;
      menu.style.left = `${Math.max(8, rect.right - MENU_WIDTH)}px`;
      menu.style.top = `${Math.max(8, rect.top - GAP)}px`;
      menu.style.transform = 'translateY(-100%)'; // opens UPWARD from the tile, same side as the dock's own tooltip/popover posture
    }
    menu.hidden = !willOpen;
    button.setAttribute('aria-expanded', String(willOpen));
  });

  doc.body.appendChild(menu);
  return button;
}

/**
 * Wires ONE `Escape`-closes-the-open-menu listener per `doc`, idempotent via
 * `doc.documentElement`'s own `dataset` flag (same posture as
 * `deskHelper.ts#initDeskHelper`) — the tray re-renders every time a chip is
 * added/removed/reopened, which would otherwise stack a fresh
 * `document`-level listener on every single render. There is only ever ONE
 * tray/menu pair live in a document at a time (same assumption
 * `createOverflowTile`'s own global `doc.body` placement already makes), so
 * both the button and the menu are looked up globally, fresh at EVENT time —
 * never a `container` captured at wiring time, which would otherwise go
 * stale the moment a later render replaces it with a new one.
 */
function wireOverflowEscapeClose(doc: Document): void {
  if (doc.documentElement.dataset.minimizedTrayEscapeReady === 'true') return;
  doc.documentElement.dataset.minimizedTrayEscapeReady = 'true';

  doc.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const menu = doc.querySelector<HTMLElement>(`[${OVERFLOW_MENU_ATTR}]`);
    const button = doc.querySelector<HTMLElement>(`[${MINIMIZED_TRAY_ATTR.more}]`);
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    button?.setAttribute('aria-expanded', 'false');
  });
}

/**
 * DOM: (re)render `container`'s chips from `entries`. Clears and rebuilds
 * every time rather than diffing — the list is at most
 * {@link MAX_MINIMIZED_WINDOWS} long, so a full rebuild is cheap, and it
 * keeps this function simple enough to trust at a glance.
 *
 * At most {@link MAX_VISIBLE_MINIMIZED_CHIPS} render directly; the rest
 * collapse into one "+N" tile (`createOverflowTile`) — see that function's
 * own header for why (owner report `dock-three-chips.png`: the dock used to
 * widen under the open helper bubble to fit every chip).
 */
export function renderMinimizedWindowsTray(
  container: HTMLElement,
  entries: readonly MinimizedWindowEntry[],
  removeLabel: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> = sessionStorage,
  doc: Document = document,
  moreLabelTemplate = '+{n}',
): void {
  wireOverflowEscapeClose(doc);

  // The overflow menu (if any) lives on `doc.body`, outside `container` —
  // `container.replaceChildren()` below never reaches it, so it is cleared
  // explicitly here on every render to avoid leaking a stale/orphaned copy
  // behind the one `createOverflowTile` is about to build (or not).
  doc.querySelector(`[${OVERFLOW_MENU_ATTR}]`)?.remove();

  container.replaceChildren();
  const isEmpty = entries.length === 0;
  container.hidden = isEmpty;

  const limit = visibleChipLimit(doc.defaultView?.innerWidth ?? Number.POSITIVE_INFINITY);
  const visible = entries.slice(0, limit);
  const overflow = entries.slice(limit);

  const rerender = () =>
    renderMinimizedWindowsTray(container, readMinimizedWindows(storage), removeLabel, storage, doc, moreLabelTemplate);

  for (const entry of visible) {
    container.appendChild(createChip(entry, removeLabel, storage, doc, rerender));
  }

  if (overflow.length > 0) {
    container.appendChild(createOverflowTile(overflow, moreLabelTemplate, doc));
  }
}

/**
 * Wire the tray (`MinimizedWindowsTray.astro`, mounted once per page by
 * `BaseLayout.astro`): read whatever is in `sessionStorage` right now and
 * render it. Idempotent per element, same double-wiring guard every other
 * desk script uses (`deskHelper.ts`'s own posture) — this is called both on
 * first load AND every `astro:page-load`, including the very first one.
 */
export function initMinimizedWindowsTray(doc: Document = document, win: Window = window): void {
  const container = doc.querySelector<HTMLElement>(`[${MINIMIZED_TRAY_ATTR.container}]`);
  if (!container) return;

  const removeLabel = container.getAttribute('data-remove-label') ?? '';
  const moreLabelTemplate = container.getAttribute('data-more-label') ?? '+{n}';
  const render = () =>
    renderMinimizedWindowsTray(
      container,
      readMinimizedWindows(win.sessionStorage),
      removeLabel,
      win.sessionStorage,
      doc,
      moreLabelTemplate,
    );
  render();

  // Re-render only when a resize crosses the narrow-desk threshold — once
  // per container element, like every other desk script's wiring guard.
  if (typeof win.addEventListener !== 'function' || container.hasAttribute('data-minimized-tray-resize')) return;
  container.setAttribute('data-minimized-tray-resize', '');
  let lastLimit = visibleChipLimit(win.innerWidth);
  win.addEventListener('resize', () => {
    const limit = visibleChipLimit(win.innerWidth);
    if (limit === lastLimit || !container.isConnected) return;
    lastLimit = limit;
    render();
  });
}
