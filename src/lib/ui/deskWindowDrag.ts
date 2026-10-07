/**
 * deskWindowDrag — DOM wiring for the floating desk window's own
 * drag-by-title-bar ("desktop" redesign PART 6c, owner spec 2026-10-07:
 * "quiero que sea una ventana dentro de nuestro escritorio"). Pure clamp
 * math lives in `@lib/deskWindowDragMath`; this module is the pointer-event
 * glue around it, same split `@lib/ui/deskDrag` already uses for the desk's
 * own widgets.
 *
 * DESKTOP ONLY (`desk:` breakpoint, min-width 1100px — same query
 * `@lib/ui/deskDrag` uses) — a no-op below it, and while the window is
 * maximized/full screen (`data-fullscreen="true"`): neither case has a
 * floating window to drag in the first place.
 *
 * POSITIONING: the window itself is placed by CSS `inset-*` utilities
 * (`DeskWindow.astro`'s own default geometry), never JS-computed left/top —
 * dragging only ever sets the CSS `translate` property (NOT `transform`,
 * which the window's own open-animation keyframe already animates) as an
 * offset on top of that default box.
 */
import {
  clampWindowDragOffset,
  parseStoredWindowOffset,
  serializeWindowOffset,
  DESK_WINDOW_OFFSET_STORAGE_KEY,
  type Offset,
  type WindowRect,
} from '../deskWindowDragMath';
import { isEmbeddedWindowDom, postDeskWindowMessage } from './deskWindowMessaging';

const DESK_BREAKPOINT_QUERY = '(min-width: 1100px)';
const TITLEBAR_SELECTOR = '[data-desk-window-titlebar]';
const HEADER_SELECTOR = '[data-chrome-header]';
/** Pointerdowns on any of these (including the editor's own portaled title `<input>`) never start a drag. */
const IGNORE_SELECTOR = 'button, a, input, textarea, select, [contenteditable="true"]';
const DRAGGING_CLASS = 'ingles-window--dragging';

function safeGet(storage: Pick<Storage, 'getItem'>): string | null {
  try {
    return storage.getItem(DESK_WINDOW_OFFSET_STORAGE_KEY);
  } catch {
    return null;
  }
}

function safeSet(storage: Pick<Storage, 'setItem'>, value: string): void {
  try {
    storage.setItem(DESK_WINDOW_OFFSET_STORAGE_KEY, value);
  } catch {
    // Private browsing, a full/blocked quota, or no storage at all — the
    // window still drags for this one page view, it just does not persist.
  }
}

function isDesktop(win: Window): boolean {
  return typeof win.matchMedia === 'function' && win.matchMedia(DESK_BREAKPOINT_QUERY).matches;
}

function isFullScreen(windowEl: HTMLElement): boolean {
  return windowEl.getAttribute('data-fullscreen') === 'true';
}

function headerBottom(doc: Document): number {
  const header = doc.querySelector<HTMLElement>(HEADER_SELECTOR);
  return header ? header.getBoundingClientRect().bottom : 0;
}

/** The whole window element's own rect WITHOUT `current` (the offset already applied to it) — so repeated clamps never compound onto an already-offset measurement. */
function unoffsetWindowRect(windowEl: HTMLElement, current: Offset): WindowRect {
  const rect = windowEl.getBoundingClientRect();
  return { top: rect.top - current.y, left: rect.left - current.x, width: rect.width, height: rect.height };
}

/**
 * Wires drag on `windowEl`'s own title bar. Safe to call more than once per
 * element (self-guards against double-wiring, same posture as every other
 * desk script) — `DeskWindow.astro`'s own script calls it once per
 * load/`astro:page-load`.
 */
export function initDeskWindowDrag(windowEl: HTMLElement, doc: Document = document, win: Window = window): void {
  if (windowEl.dataset.deskWindowDragReady === 'true') return;
  windowEl.dataset.deskWindowDragReady = 'true';

  const titlebar = windowEl.querySelector<HTMLElement>(TITLEBAR_SELECTOR);
  if (!titlebar) return;

  // EMBEDDED (window-manager architecture, validated prototype: a title bar
  // INSIDE an iframe can drag its PARENT frame — the iframe captures the
  // pointer and posts screen-space deltas, `screenX`/`screenY` — never
  // `clientX`/`clientY`, which are relative to the iframe's own viewport and
  // meaningless once the drag crosses the frame boundary; the host applies
  // them as a `translate` on its own frame element instead). No local
  // `translate`/`sessionStorage` at all here — there is nothing of this
  // window's own box to move (it already fills the iframe), and the host
  // keeps the offset in memory for the life of the window.
  if (isEmbeddedWindowDom(doc)) {
    titlebar.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !isDesktop(win) || isFullScreen(windowEl)) return;
      const target = event.target;
      if (target instanceof Element && target.closest(IGNORE_SELECTOR)) return;

      event.preventDefault();
      const startX = event.screenX;
      const startY = event.screenY;
      titlebar.setPointerCapture(event.pointerId);
      postDeskWindowMessage(win, { type: 'drag-start' });

      function move(ev: PointerEvent): void {
        postDeskWindowMessage(win, { type: 'drag-move', dx: ev.screenX - startX, dy: ev.screenY - startY });
      }
      function up(): void {
        titlebar!.removeEventListener('pointermove', move);
        titlebar!.removeEventListener('pointerup', up);
        postDeskWindowMessage(win, { type: 'drag-end' });
      }
      titlebar.addEventListener('pointermove', move);
      titlebar.addEventListener('pointerup', up, { once: true });
    });
    return;
  }

  let offset: Offset = { x: 0, y: 0 };

  function applyOffset(next: Offset): void {
    offset = next;
    windowEl.style.translate = `${next.x}px ${next.y}px`;
  }

  function clampAndApply(next: Offset): void {
    const rect = unoffsetWindowRect(windowEl, offset);
    const clamped = clampWindowDragOffset(next, rect, { width: win.innerWidth, height: win.innerHeight }, headerBottom(doc));
    applyOffset(clamped);
  }

  function clearOffset(): void {
    offset = { x: 0, y: 0 };
    windowEl.style.translate = '';
  }

  // Restore whatever this session last persisted, re-clamped against the
  // CURRENT viewport — "ignore stored values that no longer fit" (owner
  // spec) is exactly what re-clamping on restore already gives: a value
  // left over from a much wider screen lands at the nearest reachable spot
  // instead of being applied as-is.
  if (isDesktop(win) && !isFullScreen(windowEl)) {
    const stored = parseStoredWindowOffset(safeGet(win.sessionStorage));
    if (stored) clampAndApply(stored);
  }

  win.addEventListener('resize', () => {
    if (!isDesktop(win) || isFullScreen(windowEl)) {
      clearOffset();
      return;
    }
    clampAndApply(offset);
  });

  titlebar.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !isDesktop(win) || isFullScreen(windowEl)) return;
    const target = event.target;
    if (target instanceof Element && target.closest(IGNORE_SELECTOR)) return;

    // Without this the browser starts a text selection on the title and its
    // chip, which stays highlighted for the whole drag.
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startOffset = offset;
    titlebar.setPointerCapture(event.pointerId);
    windowEl.classList.add(DRAGGING_CLASS);

    function move(ev: PointerEvent): void {
      clampAndApply({ x: startOffset.x + (ev.clientX - startX), y: startOffset.y + (ev.clientY - startY) });
    }
    function up(): void {
      windowEl.classList.remove(DRAGGING_CLASS);
      titlebar!.removeEventListener('pointermove', move);
      titlebar!.removeEventListener('pointerup', up);
      safeSet(win.sessionStorage, serializeWindowOffset(offset));
    }
    titlebar.addEventListener('pointermove', move);
    titlebar.addEventListener('pointerup', up, { once: true });
  });
}
