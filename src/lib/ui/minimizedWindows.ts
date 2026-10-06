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
 * DOM: (re)render `container`'s chips from `entries`. Clears and rebuilds
 * every time rather than diffing — the list is at most
 * {@link MAX_MINIMIZED_WINDOWS} long, so a full rebuild is cheap, and it
 * keeps this function simple enough to trust at a glance.
 *
 * Each chip is a plain `<a href>` carrying `data-desk-window-open` with the
 * SAME id `@lib/ui/deskWindow.ts#initDeskWindowOpeners` already listens for
 * — reopening a chip gets the exact scale-in-from-this-spot treatment any
 * other opener gets, with no new wiring. Its own "×" is a `<button>` that
 * stops the click from reaching the anchor (`stopPropagation` +
 * `preventDefault`) so hovering/clicking it removes the chip instead of
 * reopening the window.
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
      'group relative flex h-11 items-center gap-1.5 rounded-full border border-border bg-card pl-3 pr-2 text-xs font-medium text-foreground shadow-[0_1px_2px_rgb(28_28_30_/_0.06)] transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

    const label = doc.createElement('span');
    label.className = 'max-w-[10ch] truncate';
    label.textContent = entry.title;
    chip.appendChild(label);

    const closeButton = doc.createElement('button');
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', removeLabel);
    closeButton.className =
      'ml-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-border hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100';
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
