/**
 * Minimized-windows tray — the desk's own "minimized windows" dock slot
 * (owner feedback 2026-10-06, replacing the old behaviour where the yellow
 * light just navigated to the hub exactly like the red one). A real minimize:
 * the practice window's own id/title/url get remembered for the rest of the
 * browser SESSION (`sessionStorage`, never `localStorage` — this is not a
 * "remember forever" feature), so the hub's own dock can render a small chip
 * for each one, next to the levels dock, separated by a hairline (approved
 * mockup direction: "like macOS's dock").
 *
 * Split the same way `deskWindow.ts`/`backNavigation.ts` are: pure, zero-DOM
 * list operations ({@link withMinimizedWindow}, {@link withoutMinimizedWindow},
 * {@link parseMinimizedWindows}) that are fully unit-testable, plus thin
 * Storage-reading/writing wrappers (`try`/`catch`-guarded, every access —
 * private browsing, quota, disabled storage) and a DOM-rendering function for
 * `DeskScene.astro`'s own tray element.
 */

export const MINIMIZED_WINDOWS_STORAGE_KEY = 'ingles-desk-minimized-windows';

/** At most this many chips — oldest (least recently minimized/reopened) dropped first. */
export const MAX_MINIMIZED_WINDOWS = 5;

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
} as const;

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
  svg.setAttribute('class', 'h-6 w-6 text-muted-foreground');

  const path = doc.createElementNS(NS, 'path');
  // A page with a folded top-right corner, plus two text lines — legible at
  // 24px inside the 56px squircle without reading as a random glyph.
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
 * DOM: (re)render `container`'s chips from `entries`. Clears and rebuilds
 * every time rather than diffing — the list is at most
 * {@link MAX_MINIMIZED_WINDOWS} long, so a full rebuild is cheap, and it
 * keeps this function simple enough to trust at a glance.
 *
 * Each chip is a TILE matching the levels dock's own level tiles (owner
 * feedback 2026-10-06: "como el dock de macOS" — chips belong INSIDE the
 * same glass shelf, styled like its other tiles, not a separate pill):
 * a 56px squircle preview (the activity's thumbnail when known, else a
 * document glyph) with the truncated title in the label slot underneath,
 * exactly like a level tile's bars + level code + name.
 *
 * Each chip is a plain `<a href>` carrying `data-desk-window-open` with the
 * SAME id `@lib/ui/deskWindow.ts#initDeskWindowOpeners` already listens for
 * — reopening a chip gets the exact scale-in-from-this-spot treatment any
 * other opener gets, with no new wiring. Its own "×" is a `<button>` that
 * stops the click from reaching the anchor (`stopPropagation` +
 * `preventDefault`) so hovering/clicking it removes the chip instead of
 * reopening the window; it keeps the old pill's "visible on hover/focus
 * only" posture, now pinned to the squircle's own top-right corner.
 */
export function renderMinimizedWindowsTray(
  container: HTMLElement,
  entries: readonly MinimizedWindowEntry[],
  removeLabel: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> = sessionStorage,
  doc: Document = document,
): void {
  container.replaceChildren();
  const isEmpty = entries.length === 0;
  container.hidden = isEmpty;
  // The hairline next to the tray (`DeskScene.astro`'s own sibling element)
  // follows the SAME empty/non-empty state — there is nothing to separate
  // the dock from when the tray itself is empty.
  const hairline = container.parentElement?.querySelector<HTMLElement>('[data-minimized-tray-hairline]');
  if (hairline) hairline.hidden = isEmpty;

  for (const entry of entries) {
    const chip = doc.createElement('a');
    chip.href = entry.href;
    chip.setAttribute('data-desk-window-open', entry.id);
    chip.setAttribute(MINIMIZED_TRAY_ATTR.chip, entry.id);
    chip.title = entry.title;
    chip.className =
      'group relative flex w-[76px] shrink-0 flex-col items-center gap-1 rounded-2xl py-1 transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

    const preview = doc.createElement('span');
    preview.className =
      'flex h-14 w-14 items-center justify-center overflow-hidden rounded-[13px] bg-gradient-to-b from-card to-muted shadow-[inset_0_0_0_0.5px_rgb(28_28_30_/_0.1),0_1px_2px_rgb(28_28_30_/_0.06)]';
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

    const label = doc.createElement('small');
    label.className = 'max-w-full truncate text-center text-[11px] leading-tight text-foreground';
    label.textContent = entry.title;
    chip.appendChild(label);

    const closeButton = doc.createElement('button');
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', removeLabel);
    closeButton.className =
      'absolute -top-1 -right-1 grid h-5 w-5 place-items-center rounded-full border border-border bg-card text-muted-foreground opacity-0 shadow-[0_1px_2px_rgb(28_28_30_/_0.12)] transition-opacity hover:bg-border hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100';
    closeButton.textContent = '×';
    closeButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const next = removeMinimizedWindow(entry.id, storage);
      renderMinimizedWindowsTray(container, next, removeLabel, storage, doc);
    });
    chip.appendChild(closeButton);

    container.appendChild(chip);
  }
}

/**
 * Wire the tray on the desk (`DeskScene.astro`, both the hub and — inert —
 * the practice window's own backdrop): read whatever is in `sessionStorage`
 * right now and render it. Idempotent per element, same double-wiring guard
 * every other desk script uses (`deskHelper.ts`'s own posture) — this is
 * called both on first load AND every `astro:page-load`, including the very
 * first one.
 */
export function initMinimizedWindowsTray(doc: Document = document, win: Window = window): void {
  const container = doc.querySelector<HTMLElement>(`[${MINIMIZED_TRAY_ATTR.container}]`);
  if (!container) return;

  const removeLabel = container.getAttribute('data-remove-label') ?? '';
  renderMinimizedWindowsTray(container, readMinimizedWindows(win.sessionStorage), removeLabel, win.sessionStorage, doc);
}
