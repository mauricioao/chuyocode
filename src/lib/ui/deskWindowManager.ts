/**
 * deskWindowManager — the HOST half of the window-manager architecture
 * (`@lib/deskWindowsState`'s own header on WHY: opening a window used to
 * navigate the desk route away, discarding the helper's tip bubble). Mounted
 * once per HOST page (the hub, and every window route when NOT embedded —
 * `@lib/ui/embeddedWindow`'s own header) by `DeskWindowManager.astro`.
 *
 * Every window is a same-origin `<iframe src="<href>?ventana=1">` inside a
 * fixed, positioned "frame" element this module owns — the desk itself never
 * unmounts underneath it. State (open/dedupe/cascade/focus/minimize/restore/
 * close/maximize) lives in `@lib/deskWindowsState#reduceDeskWindows`; this
 * file is the DOM glue around it: creating/removing frames, applying the
 * drag/cascade offset, the live tray, `history.replaceState`, and the
 * `postMessage` bridge `deskWindowMessaging.ts`/`deskWindow.ts` speak from
 * inside the iframe.
 *
 * SAME-ORIGIN DIRECT ACCESS (validated prototype — see this feature's own
 * design doc): a few things are simpler as a direct same-origin DOM/function
 * call on `iframe.contentWindow`/`contentDocument` than a `postMessage` round
 * trip — `window.deskWindowCanClose`/`deskWindowCanMinimize` (the editor's
 * dirty guard, `deskWindow.ts`'s own header) and `data-window-inactive` (the
 * greyed-out traffic lights on every non-active window).
 */
import { toast } from 'sonner';
import {
  reduceDeskWindows,
  activeWindowId,
  minimizedWindowsOf,
  minimizedWindowsOldestFirst,
  initialDeskWindowsState,
  classifyWindowRoute,
  MAX_DESK_WINDOWS,
  type DeskWindowsState,
  type DeskWindowEntry,
  type DeskWindowOffset,
  type WindowRouteMatch,
} from '../deskWindowsState';
import { clampWindowDragOffset, type WindowRect } from '../deskWindowDragMath';
import { isDeskWindowMessageEnvelope } from './deskWindowMessaging';
import { measureTitlebarDragRegions } from '../deskWindowTitlebarRegions';
import {
  renderMinimizedWindowsTrayFrom,
  measureMaxVisibleMinimizedChips,
  type MinimizedWindowEntry,
} from './minimizedWindows';
import { readPersistedDeskWindows, writePersistedDeskWindows } from './deskWindowsPersistence';

const DESK_BREAKPOINT_QUERY = '(min-width: 1100px)';

/** `DeskWindow.astro`'s own root element marker — present on every genuine desk-window document. Its absence is what {@link buildFallbackBar}'s own bar guards against. */
const DESK_WINDOW_MARKER_SELECTOR = '[data-desk-window]';

/** Marks a link anywhere on the HOST page (a desk folder, a tray chip, the levels dock…) as something the manager should open as a window rather than navigate to — `onClickCapture` below is the one and only listener for it (the old per-page `initDeskWindowOpeners`/sessionStorage-based scale-in capture this attribute used to ALSO feed is gone; this manager now captures the opener's own rect directly, synchronously, in the same click). */
export const DESK_WINDOW_OPEN_ATTR = 'data-desk-window-open';

const CLOSE_ANIMATION_MS = 160;
/** Matches `global.css`'s own `.ingles-window--minimizing` keyframe duration. */
const MINIMIZE_ANIMATION_MS = 180;

/**
 * Fool-proofing a NEVER-RESOLVING load (owner report, verified in a real
 * browser: "a window can never get stuck"): if a frame's own navigation has
 * not fired `load` within this long — a hung request, a blocked resource,
 * anything — the fallback title bar shows anyway, same as a genuinely
 * chrome-less document. Re-armed on every fresh navigation
 * (`armFallbackTimeout`'s own header) and cleared the instant `load` DOES
 * fire, whatever it turns out to be.
 */
const FALLBACK_LOAD_TIMEOUT_MS = 8000;

/** A pending entrance variant for the NEXT frame `render()`'s own loop
 * creates — read-and-cleared by `applyOpenAnimation`, set only by
 * `openWindow`/`openAtCapacity` right before their own `dispatch` call (see
 * each one's own header). `null` (the default, and the only value a
 * restore-after-reload `render()` call ever sees — that call never goes
 * through `openWindow` at all) means "no entrance animation at all". */
type PendingOpen = { kind: 'origin'; x: number; y: number } | { kind: 'cascade' } | null;

/**
 * The wrapper's own default (non-maximized) geometry. "Desktop" redesign
 * (owner spec 2026-10-07, "prescindir del header normal"): the top inset is
 * no longer the old header's own reserved space — it is
 * `--desk-chrome-offset`, the desk-integrated logo/account row's own
 * MEASURED bottom edge (`@lib/ui/deskChrome#initDeskChromeOffset`), so a
 * freshly-opened window starts just below that row, never hard-coded. The
 * bottom/side insets are unchanged.
 */
const WRAPPER_CLASS =
  'fixed inset-0 z-50 overflow-clip rounded-none bg-card desk:inset-x-[max(48px,calc((100vw-1240px)/2))] desk:top-(--desk-chrome-offset) desk:bottom-16 desk:rounded-[18px] shadow-[0_0_0_1px_rgb(28_28_30_/_0.08),0_30px_80px_rgb(28_28_30_/_0.22)]';

interface ManagedWindow {
  wrapper: HTMLElement;
  iframe: HTMLIFrameElement;
  loader: HTMLElement;
  /** Re-wired fresh on every `load` — see {@link wireTitlebarObserver}'s own header. */
  titlebarObserver: MutationObserver | null;
}

/** One transparent `position: absolute` drag handle per {@link syncTitlebarDragHandles} region, carrying the window's own id (same "id as the attribute value" posture `MINIMIZED_TRAY_ATTR.chip` already uses). */
const DRAG_HANDLE_ATTR = 'data-desk-window-drag-handle';

export interface DeskWindowManagerHandle {
  /** Opens (or focuses/restores) a window for `href` — a no-op when `href` does not resolve to one of the four window routes. */
  openWindow(href: string, title: string): void;
  destroy(): void;
}

function prefersReducedMotion(win: Window): boolean {
  try {
    return win.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function isDesktop(win: Window): boolean {
  try {
    return win.matchMedia(DESK_BREAKPOINT_QUERY).matches;
  } catch {
    return false;
  }
}

/** The `translate` currently applied to the wrapper (`''`, `'Xpx'` or `'Xpx Ypx'`). */
function appliedOffset(wrapper: HTMLElement): DeskWindowOffset {
  const [x = 0, y = 0] = (wrapper.style.translate || '').split(' ').map((v) => Number.parseFloat(v) || 0);
  return { x, y };
}

/**
 * The wrapper's own rect at offset `{0,0}` — same "unoffset before
 * re-clamping" posture as `deskWindowDrag.ts#unoffsetWindowRect`. The measured
 * rect already includes the applied `translate`, so that exact offset is the
 * one to subtract; subtracting nothing made the clamp's bounds shift with every
 * drag step, stopping a window ~48px short of the edge.
 */
function unoffsetWrapperRect(wrapper: HTMLElement): WindowRect {
  const rect = wrapper.getBoundingClientRect();
  const current = appliedOffset(wrapper);
  return { top: rect.top - current.y, left: rect.left - current.x, width: rect.width, height: rect.height };
}

/** A calm, title-bar-shaped loading skeleton — shown until the iframe's own `load` fires, then faded out. No shimmer animation under reduced motion. */
function buildLoader(doc: Document, win: Window): HTMLElement {
  const loader = doc.createElement('div');
  loader.setAttribute('data-desk-window-loader', '');
  loader.className = 'pointer-events-none absolute inset-0 flex flex-col bg-card transition-opacity duration-200';

  const titlebar = doc.createElement('div');
  titlebar.className = 'flex h-11 flex-none items-center gap-2 border-b border-border px-4';
  const lights = doc.createElement('div');
  lights.className = 'flex items-center gap-2';
  for (let i = 0; i < 3; i += 1) {
    const dot = doc.createElement('span');
    dot.className = 'h-3.5 w-3.5 rounded-full bg-border';
    lights.appendChild(dot);
  }
  titlebar.appendChild(lights);
  loader.appendChild(titlebar);

  const body = doc.createElement('div');
  body.className = 'flex flex-1 flex-col gap-3 p-6';
  const shimmer = !prefersReducedMotion(win);
  for (const width of ['w-2/3', 'w-1/2', 'w-5/6']) {
    const line = doc.createElement('div');
    line.className = `h-3 rounded-full bg-border ${width} ${shimmer ? 'animate-pulse' : ''}`;
    body.appendChild(line);
  }
  loader.appendChild(body);

  return loader;
}

/** Best-effort initial title for a freshly-clicked `[data-desk-window-open]` opener — the anchor's own accessible name, falling back to its trimmed text. `null` when neither is present (the host shows a generic placeholder; the embedded page posts its own real title on mount — `deskWindow.ts`'s own header). */
function deriveOpenerTitle(opener: Element): string | null {
  const ariaLabel = opener.getAttribute('aria-label')?.trim();
  if (ariaLabel) return ariaLabel;
  const text = opener.textContent?.trim();
  return text ? text : null;
}

/**
 * Fool-proofing a chrome-less frame (robustness pass, owner report): a
 * frame whose loaded document is NOT a genuine desk window (a login page
 * after a session-expiry redirect that the early top-navigation bounce
 * somehow did not catch, a 404/500 error page, anything else without
 * {@link DESK_WINDOW_MARKER_SELECTOR}'s own marker) otherwise has no traffic
 * lights at all and can never be closed, minimized or dragged — it just sits
 * there, stuck, until the whole tab reloads.
 *
 * A host-owned minimal title bar, entirely OUTSIDE the iframe's own
 * document (so it works regardless of how broken that content is):
 * overlaid on TOP of the iframe (last child, same stacking-context posture
 * as `buildLoader`'s own loader), hidden by default and shown only once a
 * `load` finds the marker missing (`createManagedWindow`'s own `load`
 * listener). Close/minimize call straight into this module's own
 * `dispatch`/`requestClose` (there is no in-frame guard to ask — a broken
 * page can never be a dirty editor); dragging mirrors
 * `deskWindowDrag.ts`'s own non-embedded, `clientX`-based math, since this
 * bar already lives in the HOST document (no `postMessage` round trip
 * needed).
 */
function buildFallbackBar(doc: Document): {
  bar: HTMLElement;
  title: HTMLElement;
  closeButton: HTMLButtonElement;
  minimizeButton: HTMLButtonElement;
  maximizeButton: HTMLButtonElement;
} {
  const bar = doc.createElement('div');
  bar.hidden = true;
  bar.dataset.deskWindowFallbackBar = '';
  bar.className =
    'absolute inset-x-0 top-0 z-10 flex h-11 flex-none items-center gap-3 border-b border-border bg-card px-4 desk:cursor-grab';

  const lights = doc.createElement('div');
  lights.className = 'flex flex-none items-center gap-2';

  const closeButton = doc.createElement('button');
  closeButton.type = 'button';
  closeButton.dataset.deskWindowFallbackClose = '';
  closeButton.className = 'h-3.5 w-3.5 rounded-full bg-pop-red';
  lights.appendChild(closeButton);

  const minimizeButton = doc.createElement('button');
  minimizeButton.type = 'button';
  minimizeButton.dataset.deskWindowFallbackMinimize = '';
  minimizeButton.className = 'h-3.5 w-3.5 rounded-full bg-pop-yellow';
  lights.appendChild(minimizeButton);

  // Owner report (verified in a real browser): "working red/yellow/green" —
  // the fallback bar is a full three-light title bar, same as a genuine
  // desk window's own, not just close/minimize.
  const maximizeButton = doc.createElement('button');
  maximizeButton.type = 'button';
  maximizeButton.dataset.deskWindowFallbackMaximize = '';
  maximizeButton.className = 'h-3.5 w-3.5 rounded-full bg-pop-green';
  lights.appendChild(maximizeButton);

  bar.appendChild(lights);

  const title = doc.createElement('b');
  title.dataset.deskWindowFallbackTitle = '';
  title.className = 'min-w-0 truncate text-[13px] font-semibold text-foreground';
  bar.appendChild(title);

  return { bar, title, closeButton, minimizeButton, maximizeButton };
}

export function initDeskWindowManager(
  container: HTMLElement,
  trayContainer: HTMLElement | null,
  trayRemoveLabel: string,
  initialWindow: { href: string; title: string } | null,
  doc: Document = document,
  win: Window = window,
  maxWindowsNoticeLabel: string = '',
): DeskWindowManagerHandle {
  // Restore-after-reload (robustness pass, owner spec): seeded here, BEFORE
  // any of this closure's own functions are even defined, so the very first
  // `render()` call below (if anything was restored) and the `initialWindow`
  // open right after it both see the SAME state every later dispatch does —
  // `initialWindow`'s own 'open' event then dedupes against a restored
  // window for the SAME id through the ordinary reducer path
  // (`reduceDeskWindows`'s own `case 'open'`), never a second, bespoke dedupe
  // here.
  const restored = readPersistedDeskWindows(win.sessionStorage);
  let state: DeskWindowsState = restored && restored.windows.length > 0 ? restored : initialDeskWindowsState;
  const frames = new Map<string, ManagedWindow>();
  let pendingOpen: PendingOpen = null;
  // Set for the duration of an active title-bar drag (see
  // `wireTitlebarDragHandle`) — `syncTitlebarDragHandles` skips rebuilding
  // THIS window's own handles while it is set, so a `render()` triggered by
  // the drag's own "focus" dispatch (or any unrelated dispatch firing mid-
  // drag) never destroys the handle element the pointer is currently
  // captured on, which would otherwise end the drag outright.
  let draggingWindowId: string | null = null;
  // Focus management (robustness pass, owner spec: "opening a window moves
  // keyboard focus into it; closing returns focus to the next window or to
  // the desk item that opened it"). Keyed by window id, populated ONLY by a
  // real HOST-level `[data-desk-window-open]` click (`onClickCapture`'s own
  // header) — a `postMessage`'d open from inside an embedded window, or the
  // initial `initialWindow` open, has no host-level element to return focus
  // to, so those simply have no entry here.
  const openerElements = new Map<string, HTMLElement>();

  function applyGeometry(managed: ManagedWindow, entry: DeskWindowEntry): void {
    managed.wrapper.style.zIndex = String(1000 + entry.z);
    managed.wrapper.style.visibility = entry.minimized ? 'hidden' : '';
    if (entry.minimized) {
      managed.wrapper.setAttribute('inert', '');
    } else {
      managed.wrapper.removeAttribute('inert');
      // Regression fix: `playMinimizeAnimation` leaves `.ingles-window--minimizing`
      // on the wrapper — its `forwards` fill keeps the shrunk-into-the-tray
      // transform applied even after `visibility`/`inert` are restored above,
      // so a "restored" window stayed stuck at 185×111px in the corner. Clear
      // it here (the one place every restore path — a tray chip, the
      // fallback bar, or re-opening the same id — ends up calling), and swap
      // in a short reverse ("un-shrink") entrance, skipped under reduced
      // motion same as every other desk-window animation.
      if (managed.wrapper.classList.contains('ingles-window--minimizing')) {
        managed.wrapper.classList.remove('ingles-window--minimizing');
        if (!prefersReducedMotion(win)) {
          const wrapper = managed.wrapper;
          wrapper.classList.add('ingles-window--restoring');
          wrapper.addEventListener('animationend', () => wrapper.classList.remove('ingles-window--restoring'), {
            once: true,
          });
        }
      }
    }

    if (entry.maximized) {
      managed.wrapper.style.translate = '';
      managed.wrapper.style.inset = '0px';
      managed.wrapper.style.borderRadius = '0px';
      managed.wrapper.style.boxShadow = 'none';
      return;
    }
    managed.wrapper.style.inset = '';
    managed.wrapper.style.borderRadius = '';
    managed.wrapper.style.boxShadow = '';

    if (!isDesktop(win)) {
      managed.wrapper.style.translate = '';
      return;
    }
    const rect = unoffsetWrapperRect(managed.wrapper);
    const clamped = clampWindowDragOffset(entry.offset, rect, { width: win.innerWidth, height: win.innerHeight });
    managed.wrapper.style.translate = `${clamped.x}px ${clamped.y}px`;
  }

  function applyActiveState(): void {
    const active = activeWindowId(state);
    for (const [id, managed] of frames) {
      try {
        const innerDoc = managed.iframe.contentDocument;
        innerDoc?.documentElement.toggleAttribute('data-window-inactive', id !== active);
      } catch {
        // Cross-origin (should never happen — every window route is same-origin) — nothing to toggle.
      }
    }
  }

  /**
   * Structural fix for the real-mouse shake (owner report: "el arrastre de
   * las ventanas no es suave como el de los widgets, tiembla demasiado"):
   * one transparent `pointer-events: auto` handle per region
   * `measureTitlebarDragRegions` reports — the title bar's own rect minus
   * every interactive control inside it (same-origin direct
   * `iframe.contentDocument` access, the same validated pattern this
   * feature already uses elsewhere in this file) — appended as children of
   * `managed.wrapper`, AFTER the iframe in DOM order so they paint on top of
   * it and intercept the pointer before it ever reaches the embedded
   * document. Rebuilt from scratch every call (clear-and-rebuild, same
   * posture as the minimized tray) rather than diffed — the region count is
   * always small.
   */
  function syncTitlebarDragHandles(managed: ManagedWindow, id: string): void {
    // Never rebuilt mid-drag — see `draggingWindowId`'s own header.
    if (draggingWindowId === id) return;
    managed.wrapper.querySelectorAll(`[${DRAG_HANDLE_ATTR}]`).forEach((el) => el.remove());

    const entry = state.windows.find((w) => w.id === id);
    if (!entry || entry.minimized || entry.maximized || !isDesktop(win)) return;

    for (const region of measureTitlebarDragRegions(managed.iframe.contentDocument)) {
      if (region.width <= 0 || region.height <= 0) continue;
      const handle = doc.createElement('div');
      handle.setAttribute(DRAG_HANDLE_ATTR, id);
      handle.style.position = 'absolute';
      handle.style.left = `${region.x}px`;
      handle.style.top = `${region.y}px`;
      handle.style.width = `${region.width}px`;
      handle.style.height = `${region.height}px`;
      handle.style.cursor = 'grab';
      wireTitlebarDragHandle(handle, managed, id);
      managed.wrapper.appendChild(handle);
    }
  }

  /**
   * Pointer wiring for ONE drag handle — same math/persistence
   * (`clampWindowDragOffset`, `dispatch({ type: 'move', … })`) the fallback
   * bar's own host-side drag right above already uses, PLUS rAF batching
   * (owner spec: "rAF-batched translate", the other half of the smoothness
   * fix alongside moving off the iframe entirely) so a flood of pointermove
   * events only ever applies the LATEST one per frame. Falls back to
   * applying synchronously when `win.requestAnimationFrame` is unavailable
   * (a minimal test double, a very old/unusual embedder) rather than
   * silently never drawing at all.
   */
  function wireTitlebarDragHandle(handle: HTMLElement, managed: ManagedWindow, id: string): void {
    let drag: { x: number; y: number; offset: DeskWindowOffset } | null = null;
    let rafId: number | null = null;
    let pending: DeskWindowOffset | null = null;

    function flush(): void {
      rafId = null;
      if (!pending) return;
      const rect = unoffsetWrapperRect(managed.wrapper);
      const clamped = clampWindowDragOffset(pending, rect, { width: win.innerWidth, height: win.innerHeight });
      managed.wrapper.style.translate = `${clamped.x}px ${clamped.y}px`;
      pending = null;
    }

    function scheduleFlush(): void {
      if (typeof win.requestAnimationFrame !== 'function') {
        flush();
        return;
      }
      if (rafId === null) rafId = win.requestAnimationFrame(flush);
    }

    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !isDesktop(win)) return;
      const current = state.windows.find((w) => w.id === id);
      if (!current || current.maximized) return;
      event.preventDefault();
      // Already set by `wrapper`'s own EARLIER capture-phase listener (see
      // its header — it has to run before this one, and before the "focus"
      // dispatch right below), redundantly repeated here as a harmless
      // defensive no-op in case that ever changes.
      draggingWindowId = id;
      dispatch({ type: 'focus', id });
      handle.setPointerCapture(event.pointerId);
      drag = { x: event.clientX, y: event.clientY, offset: current.offset };
    });

    handle.addEventListener('pointermove', (event) => {
      if (!drag) return;
      pending = { x: drag.offset.x + (event.clientX - drag.x), y: drag.offset.y + (event.clientY - drag.y) };
      scheduleFlush();
    });

    handle.addEventListener('pointerup', () => {
      if (!drag) return;
      drag = null;
      if (rafId !== null && typeof win.cancelAnimationFrame === 'function') win.cancelAnimationFrame(rafId);
      flush(); // apply whatever the last pointermove queued, so a drag ending mid-frame is never lost
      const translate = managed.wrapper.style.translate || '0px 0px';
      const [x, y] = translate.split(' ').map((v) => Number.parseFloat(v) || 0);
      draggingWindowId = null; // the "move" dispatch right below may now safely rebuild this window's own handles
      dispatch({ type: 'move', id, offset: { x, y } });
    });

    // macOS convention, same as the fallback bar's own maximize button —
    // double-clicking a title bar (here: any of its draggable regions)
    // toggles maximize.
    handle.addEventListener('dblclick', () => dispatch({ type: 'maximizeToggle', id }));
  }

  /**
   * Re-measures the title bar's own draggable regions whenever the EMBEDDED
   * document mutates its own title bar WITHOUT any host dispatch in between
   * (owner spec: "re-reporting on resize/mutation") — the editor's live
   * autosave status text changing length, a title edit, the review-status
   * badge appearing/disappearing. `MutationObserver`-based (re-wired fresh
   * on every `load`, since a new navigation means a brand new
   * `contentDocument` to observe); a plain window resize is already covered
   * by `render()`'s own per-dispatch resync and the manager's own `resize`
   * listener below.
   */
  function wireTitlebarObserver(managed: ManagedWindow, id: string): void {
    managed.titlebarObserver?.disconnect();
    managed.titlebarObserver = null;
    if (typeof MutationObserver !== 'function') return;
    const innerDoc = managed.iframe.contentDocument;
    if (!innerDoc?.documentElement) return;

    let scheduled = false;
    const resync = () => {
      if (scheduled) return;
      scheduled = true;
      const run = () => {
        scheduled = false;
        syncTitlebarDragHandles(managed, id);
      };
      if (typeof win.requestAnimationFrame === 'function') win.requestAnimationFrame(run);
      else run();
    };
    const observer = new MutationObserver(resync);
    observer.observe(innerDoc.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
    managed.titlebarObserver = observer;
  }

  function createManagedWindow(entry: DeskWindowEntry): ManagedWindow {
    const wrapper = doc.createElement('div');
    wrapper.className = WRAPPER_CLASS;
    wrapper.dataset.deskWindowFrame = entry.id;

    // Registered FIRST, capture phase, on `wrapper` itself — same node and
    // phase as the "bring to front on any pointerdown" listener below, so
    // DOM ordering guarantees this one runs BEFORE it (same-node/same-phase
    // listeners fire in registration order). That ordering is the whole
    // point: the OTHER listener's own "focus" dispatch can trigger a
    // `render()` (focusing a currently-BACKGROUND window IS a real state
    // change) before a drag handle's OWN `pointerdown` listener ever gets a
    // chance to run (capture propagates ancestor-first, and `wrapper` is an
    // ancestor of every handle) — `draggingWindowId` has to already be set
    // by the time that happens, or `syncTitlebarDragHandles` would rebuild
    // (and so destroy) the very handle the pointer is about to be captured
    // on.
    wrapper.addEventListener(
      'pointerdown',
      (event) => {
        if ((event.target as Element | null)?.closest(`[${DRAG_HANDLE_ATTR}]`)) {
          draggingWindowId = entry.id;
        }
      },
      true,
    );

    const iframe = doc.createElement('iframe');
    iframe.className = 'absolute inset-0 h-full w-full border-0';
    iframe.setAttribute('allow', 'fullscreen');
    iframe.setAttribute('title', entry.title);
    const url = new URL(entry.href, win.location.href);
    url.searchParams.set('ventana', '1');
    iframe.src = url.toString();

    // Declared here (assigned once, right before it is returned below) so
    // the `load` handler right below — wired BEFORE that assignment, but
    // only ever CALLED long after `createManagedWindow` itself has
    // returned — can still close over the real, fully-built object by
    // reference, same "declare early, assign once, closures run later"
    // posture `let managed` below needs because `syncTitlebarDragHandles`/
    // `wireTitlebarObserver` both need the object literal itself.
    let managed: ManagedWindow;

    const loader = buildLoader(doc, win);
    const showLoaded = () => {
      loader.classList.add('opacity-0');
      loader.classList.add('pointer-events-none');
    };
    const showLoading = () => {
      loader.classList.remove('opacity-0');
      loader.classList.remove('pointer-events-none');
    };

    // Fool-proofing a chrome-less frame — see `buildFallbackBar`'s own
    // header. Hidden by default; the `load` handler below shows it only once
    // it finds the loaded document missing `DeskWindow`'s own marker.
    const {
      bar: fallbackBar,
      title: fallbackTitle,
      closeButton: fallbackClose,
      minimizeButton: fallbackMinimize,
      maximizeButton: fallbackMaximize,
    } = buildFallbackBar(doc);

    /**
     * Fool-proofing a NEVER-RESOLVING load — see {@link FALLBACK_LOAD_TIMEOUT_MS}'s
     * own header. Re-armed every time this frame starts a fresh navigation
     * (right after setting `iframe.src`/`contentWindow.location`, here and
     * in `render()`'s own reuse branch) and cleared the instant `load` fires
     * for it, whatever that load turns out to be — a genuine desk window
     * hides the bar again right after, same as it always did.
     */
    let fallbackTimeoutId: ReturnType<typeof win.setTimeout> | null = null;
    function armFallbackTimeout(): void {
      clearFallbackTimeout();
      fallbackTimeoutId = win.setTimeout(() => {
        fallbackTimeoutId = null;
        fallbackBar.hidden = false;
        fallbackTitle.textContent = entry.title || '';
      }, FALLBACK_LOAD_TIMEOUT_MS);
    }
    function clearFallbackTimeout(): void {
      if (fallbackTimeoutId !== null) {
        win.clearTimeout(fallbackTimeoutId);
        fallbackTimeoutId = null;
      }
    }
    armFallbackTimeout();

    fallbackClose.addEventListener('click', () => void requestClose(entry.id));
    fallbackMinimize.addEventListener('click', () => {
      // No in-frame guard to ask (a broken page can never be a dirty
      // editor — same reasoning as `buildFallbackBar`'s own header), but
      // still plays the SAME shrink-toward-the-tray exit every other
      // minimize gets (`playMinimizeAnimation`'s own header) — `wrapper`
      // directly (not `managed`, not yet constructed at this point in
      // `createManagedWindow`), same posture the drag handlers right below
      // already use.
      const run = async () => {
        if (!prefersReducedMotion(win)) {
          wrapper.classList.add('ingles-window--minimizing');
          await new Promise((resolve) => win.setTimeout(resolve, MINIMIZE_ANIMATION_MS));
        }
        dispatch({ type: 'minimize', id: entry.id });
      };
      void run();
    });
    fallbackMaximize.addEventListener('click', () => dispatch({ type: 'maximizeToggle', id: entry.id }));
    let fallbackDrag: { x: number; y: number; offset: DeskWindowOffset } | null = null;
    fallbackBar.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !isDesktop(win)) return;
      const target = event.target;
      if (target instanceof Element && target.closest('button')) return;
      dispatch({ type: 'focus', id: entry.id });
      const current = state.windows.find((w) => w.id === entry.id);
      if (current?.maximized) return;
      event.preventDefault();
      fallbackBar.setPointerCapture(event.pointerId);
      fallbackDrag = { x: event.clientX, y: event.clientY, offset: current?.offset ?? { x: 0, y: 0 } };
    });
    fallbackBar.addEventListener('pointermove', (event) => {
      if (!fallbackDrag) return;
      const next = {
        x: fallbackDrag.offset.x + (event.clientX - fallbackDrag.x),
        y: fallbackDrag.offset.y + (event.clientY - fallbackDrag.y),
      };
      const rect = unoffsetWrapperRect(wrapper);
      const clamped = clampWindowDragOffset(next, rect, { width: win.innerWidth, height: win.innerHeight });
      wrapper.style.translate = `${clamped.x}px ${clamped.y}px`;
    });
    fallbackBar.addEventListener('pointerup', () => {
      if (!fallbackDrag) return;
      fallbackDrag = null;
      const translate = wrapper.style.translate || '0px 0px';
      const [x, y] = translate.split(' ').map((v) => Number.parseFloat(v) || 0);
      dispatch({ type: 'move', id: entry.id, offset: { x, y } });
    });

    iframe.addEventListener('load', () => {
      // A real `load` fired — whatever it turns out to be, this frame is no
      // longer "never resolving" (see {@link FALLBACK_LOAD_TIMEOUT_MS}'s own
      // header). Cleared FIRST, unconditionally, before any of the branches
      // below (including the click-race one, which re-arms it again itself
      // right before its own recovery navigation).
      clearFallbackTimeout();

      // Click-race defensive net (robustness pass, owner report): under
      // normal operation every in-iframe navigation INSIDE this frame stays
      // on ITS OWN window route (filters/pagination/a plain in-window link),
      // and a click on a `[data-desk-open-window]` opener never reaches here
      // at all — it is intercepted before navigating (`BaseLayout.astro`'s
      // own early inline script, backed by `@lib/ui/deskWindow.ts
      // #initDeskOpenWindowLinks`). If this frame EVER still ends up loaded
      // on a DIFFERENT window's own route regardless (that interception
      // failing to run in time, a server redirect, anything else), never
      // silently keep rendering it as if it belonged to THIS window/id —
      // open the real destination as its own (possibly new) window, and put
      // this frame back on its own href.
      try {
        const loc = iframe.contentWindow?.location;
        const match = loc ? classifyWindowRoute(loc.pathname) : null;
        if (match && match.id !== entry.id) {
          const title = iframe.contentWindow?.document.title || '';
          openWindow(`${loc!.pathname}${loc!.search}`, title);
          const current = state.windows.find((w) => w.id === entry.id);
          const ownUrl = new URL(current?.href ?? entry.href, win.location.href);
          ownUrl.searchParams.set('ventana', '1');
          showLoading();
          armFallbackTimeout();
          try {
            // `location.replace` (never reassigning `iframe.src`): the
            // in-frame navigation already happened without ever changing the
            // `src` ATTRIBUTE string this element still holds, so setting it
            // back to that same string would be a same-URL no-op in most
            // browsers — this re-navigates the frame's own `Location`
            // directly instead, which always takes effect.
            iframe.contentWindow?.location.replace(ownUrl.toString());
          } catch {
            iframe.src = ownUrl.toString();
          }
          return;
        }
      } catch {
        // Cross-origin — should never happen (see this file's own header).
      }

      showLoaded();
      applyActiveState();
      try {
        // Bring-to-front on a pointerdown ANYWHERE inside the iframe's own
        // content — same-origin direct access, since clicks inside a
        // cross-document iframe never bubble out to this document.
        iframe.contentWindow?.document.addEventListener(
          'pointerdown',
          () => dispatch({ type: 'focus', id: entry.id }),
          true,
        );
      } catch {
        // Cross-origin — should never happen (see this file's own header).
      }

      // Focus management (robustness pass, owner spec: "opening a window
      // moves keyboard focus into it"): every real content load for the
      // CURRENTLY active window moves focus into it — covers a brand new
      // open (this is the only window, or just became the topmost one), an
      // in-window navigation while already active (a filter/pagination
      // link), and restoring persisted windows after a reload (the one that
      // was active when the session was last saved). Never for a window
      // that loaded in the BACKGROUND (minimized, or no longer the topmost
      // one by the time its own content finished loading) — that would
      // steal focus from whatever the visitor is actually looking at.
      if (activeWindowId(state) === entry.id) {
        try {
          iframe.focus();
        } catch {
          // Best-effort — a sandboxed/cross-origin frame just keeps
          // whatever focus it already had.
        }
      }

      // Fool-proofing a chrome-less frame (robustness pass, owner report):
      // show the fallback title bar exactly when the loaded document is
      // NOT a genuine desk window (a login page after a session-expiry
      // redirect, a 404/500 error page, …) — hidden again the moment a
      // later navigation lands back on a real one.
      let isDeskWindow = false;
      try {
        const innerDoc = iframe.contentDocument;
        isDeskWindow = !!innerDoc?.querySelector(DESK_WINDOW_MARKER_SELECTOR);
        fallbackBar.hidden = isDeskWindow;
        if (!isDeskWindow) {
          fallbackTitle.textContent = innerDoc?.title?.trim() || entry.title || '';
        }
      } catch {
        // Cross-origin — should never happen (see this file's own header);
        // optimistically assume a genuine window rather than flash the bar.
      }

      // Structural drag fix (owner report: real-mouse shake) — a genuine
      // desk window just (re)loaded a fresh `contentDocument`: measure its
      // title bar's own draggable regions now, and keep re-measuring it on
      // its own later mutations (a title edit, the autosave status text
      // changing length) with no further host dispatch needed.
      if (isDeskWindow) {
        syncTitlebarDragHandles(managed, entry.id);
        wireTitlebarObserver(managed, entry.id);
      } else {
        managed.titlebarObserver?.disconnect();
        managed.titlebarObserver = null;
        managed.wrapper.querySelectorAll(`[${DRAG_HANDLE_ATTR}]`).forEach((el) => el.remove());
      }
    });

    wrapper.addEventListener('pointerdown', () => dispatch({ type: 'focus', id: entry.id }), true);

    wrapper.appendChild(iframe);
    wrapper.appendChild(loader);
    wrapper.appendChild(fallbackBar);
    container.appendChild(wrapper);

    managed = { wrapper, iframe, loader, titlebarObserver: null };
    // Expose a hook so `onMessage`'s `navigating` handler (posted by the
    // embedded page right as an in-window navigation starts) can re-arm this
    // exact loader without a second lookup.
    (managed as unknown as { showLoading: () => void }).showLoading = showLoading;
    // Same reasoning, for the never-resolving-load fallback: `render()`'s own
    // reuse branch re-navigates this SAME frame (a filter/pagination link, an
    // in-window navigate) and must re-arm this exact timer too.
    (managed as unknown as { armFallbackTimeout: () => void }).armFallbackTimeout = armFallbackTimeout;
    // Perf pass: `onMessage`'s own `ready` handler (posted by the embedded
    // page right after its first paint, `deskWindow.ts#afterFirstPaint`)
    // needs this exact loader/timer pair too — hiding the loader and
    // cancelling the never-resolving-load fallback early, without waiting
    // for the iframe's own `load` event.
    (managed as unknown as { showLoaded: () => void }).showLoaded = showLoaded;
    (managed as unknown as { clearFallbackTimeout: () => void }).clearFallbackTimeout = clearFallbackTimeout;
    return managed;
  }

  /**
   * Entrance motion (robustness pass, owner spec: "windows opened from a
   * desk item scale in from that item... others fade/scale in subtly from
   * the cascade spot"). Called ONLY for a genuinely NEW frame, right after
   * `applyGeometry` has already placed it at its real, final position
   * (cascade offset included) — `getBoundingClientRect()` below would
   * otherwise measure the wrong box for the `'origin'` variant.
   *
   * `pendingOpen` is read-and-cleared-by-convention here (the caller,
   * `openWindow`/`openAtCapacity`, clears it right after its own `dispatch`
   * returns) rather than reset inside this function itself, since a single
   * `dispatch` can in principle only ever create ONE new frame per call.
   */
  function applyOpenAnimation(managed: ManagedWindow): void {
    if (!pendingOpen || prefersReducedMotion(win)) return;
    const wrapper = managed.wrapper;
    if (pendingOpen.kind === 'origin') {
      const rect = wrapper.getBoundingClientRect();
      wrapper.style.setProperty(
        '--desk-window-manager-from',
        `${pendingOpen.x - rect.left}px ${pendingOpen.y - rect.top}px`,
      );
    }
    wrapper.setAttribute('data-desk-window-manager-opening', '');
    wrapper.addEventListener(
      'animationend',
      () => {
        wrapper.removeAttribute('data-desk-window-manager-opening');
        wrapper.style.removeProperty('--desk-window-manager-from');
      },
      { once: true },
    );
  }

  function render(): void {
    const ids = new Set(state.windows.map((w) => w.id));
    for (const [id, managed] of frames) {
      if (!ids.has(id)) {
        managed.titlebarObserver?.disconnect();
        managed.wrapper.remove();
        frames.delete(id);
      }
    }

    for (const entry of state.windows) {
      let managed = frames.get(entry.id);
      const isNew = !managed;
      if (!managed) {
        managed = createManagedWindow(entry);
        frames.set(entry.id, managed);
      } else {
        managed.iframe.setAttribute('title', entry.title);
        // Reopening an already-open single-instance window (community/
        // create) with a different query, or an in-window `navigate`
        // (filters/pagination/search), updates the SAME frame's own `href`
        // — re-navigate the iframe only when it actually changed, never on
        // every render (that would reload the window on an unrelated
        // focus/drag/minimize of ANOTHER window).
        const url = new URL(entry.href, win.location.href);
        url.searchParams.set('ventana', '1');
        const nextSrc = url.toString();
        if (managed.iframe.src !== nextSrc) {
          managed.iframe.src = nextSrc;
          (managed as unknown as { armFallbackTimeout: () => void }).armFallbackTimeout();
        }
      }
      applyGeometry(managed, entry);
      // Entrance motion (robustness pass, owner spec): only a genuinely NEW
      // frame ever plays this — restoring a window after a reload reuses
      // this SAME `render()` function but never sets `pendingOpen`
      // (`applyOpenAnimation`'s own header), so it is always a no-op there.
      if (isNew) applyOpenAnimation(managed);
      // Every dispatch (move/focus/minimize/restore/maximizeToggle/navigate)
      // can change whether/where a drag handle belongs — re-measured here
      // too, not just on `load`, since e.g. maximizing must hide handles
      // without the iframe itself reloading.
      syncTitlebarDragHandles(managed, entry.id);
    }

    applyActiveState();

    // The manager owns body-scroll-lock and the tray's mobile-hide rule
    // DYNAMICALLY now (`BaseLayout.astro`'s own `windowManager` prop doc):
    // true the moment at least one of ITS OWN windows is actually open
    // (non-minimized), false the moment the last one closes/minimizes —
    // never a static per-page decision any more, since the manager's own
    // window count changes with no new page load.
    const anyVisible = state.windows.some((w) => !w.minimized);
    doc.body.classList.toggle('overflow-hidden', anyVisible);
    doc.body.classList.toggle('h-dvh', anyVisible);
    const trayWrapper = trayContainer?.closest<HTMLElement>('[data-minimized-tray-wrapper]');
    trayWrapper?.classList.toggle('max-desk:hidden', anyVisible);

    if (trayContainer) {
      const entries: MinimizedWindowEntry[] = minimizedWindowsOf(state).map((w) => ({
        id: w.id,
        title: w.title,
        href: w.href,
        thumbnail: null,
        t: w.z,
      }));
      // Independent blocks, stacked upward (owner spec 2026-10-07, round 2):
      // collapse the oldest into "+N" only once the stack would otherwise
      // grow tall enough to cover the folders column — see
      // `@lib/ui/minimizedWindows#computeMaxVisibleMinimizedChips`.
      const maxVisible = trayWrapper
        ? measureMaxVisibleMinimizedChips(entries.length, trayWrapper, doc)
        : entries.length;
      renderMinimizedWindowsTrayFrom(
        trayContainer,
        entries,
        trayRemoveLabel,
        (id) => void requestClose(id),
        () => render(),
        doc,
        '+{n}',
        maxVisible,
      );
    }

    const active = state.windows.find((w) => w.id === activeWindowId(state));
    try {
      const url = new URL(win.location.href);
      if (active) {
        const target = new URL(active.href, url.origin);
        win.history.replaceState(null, '', `${target.pathname}${target.search}`);
        doc.title = active.title;
      } else {
        const lang = url.pathname.split('/').filter(Boolean)[0];
        win.history.replaceState(null, '', lang ? `/${lang}/ingles` : '/');
      }
    } catch {
      // Best-effort — a sandboxed history API just leaves the URL as-is.
    }

    // Restore-after-reload (robustness pass, owner spec): write-through on
    // every render, so `sessionStorage` always holds the CURRENT state —
    // including right before "Presentar"/"Imprimir" tear the whole host page
    // down (`target="_top"`, escaping the iframe) and right before a plain
    // reload. `readPersistedDeskWindows` is this exact function's own mount-
    // time counterpart, above.
    writePersistedDeskWindows(state, win.sessionStorage);
  }

  function dispatch(event: Parameters<typeof reduceDeskWindows>[1]): void {
    const next = reduceDeskWindows(state, event);
    // Genuine no-ops (`reduceDeskWindows`'s own documented intent — e.g.
    // "focus" on an already-topmost window, or "restore"/"navigate" for an
    // id that no longer exists — all return the SAME `state` reference
    // unchanged) must skip `render()` entirely, not just avoid a state
    // change: a drag handle's own `pointerdown` dispatches exactly this
    // "focus" event FIRST, before starting the drag — re-rendering would
    // otherwise destroy and recreate that very handle (and every other
    // window's) out from under the pointer capture that same handler is
    // about to request, breaking the drag before it starts.
    if (next === state) return;
    state = next;
    render();
  }

  /**
   * The 8-window cap (robustness pass, owner spec): opening a window that
   * would exceed {@link MAX_DESK_WINDOWS} tries to evict the OLDEST
   * minimized window first (`minimizedWindowsOldestFirst` — lowest `z`,
   * i.e. least recently minimized/reopened), asking its own
   * `deskWindowCanClose` guard same as the tray chip's own "×"
   * (`requestClose`'s own header); the first one that agrees is closed and
   * the new window opens in its place. If NONE can close (every minimized
   * window refuses, or there happen to be none), a calm notice shows
   * instead of opening — never a silent no-op, and never force-closing a
   * dirty editor's draft.
   */
  async function openAtCapacity(
    match: WindowRouteMatch,
    href: string,
    title: string,
    origin: { x: number; y: number } | null,
  ): Promise<void> {
    for (const candidate of minimizedWindowsOldestFirst(state)) {
      const managed = frames.get(candidate.id);
      let canClose = true;
      try {
        const fn = (managed?.iframe.contentWindow as unknown as { deskWindowCanClose?: () => Promise<boolean> })
          ?.deskWindowCanClose;
        if (fn) canClose = await fn();
      } catch {
        canClose = true;
      }
      if (canClose) {
        dispatch({ type: 'close', id: candidate.id });
        pendingOpen = origin ? { kind: 'origin', ...origin } : { kind: 'cascade' };
        dispatch({ type: 'open', id: match.id, kind: match.kind, href, title });
        pendingOpen = null;
        return;
      }
    }
    if (maxWindowsNoticeLabel) toast(maxWindowsNoticeLabel);
  }

  /**
   * @param origin - The clicked desk item's own screen-space centre point
   * (`onClickCapture`'s own `getBoundingClientRect()`), when this open came
   * from one — see `applyOpenAnimation`'s own header for how it is used.
   * `null` for every other caller (a `postMessage`'d `open-window` from
   * inside an embedded window, the initial `initialWindow` open, the
   * click-race defensive net): those get the subtler 'cascade' variant
   * instead.
   */
  function openWindow(href: string, title: string, origin: { x: number; y: number } | null = null): void {
    let url: URL;
    try {
      url = new URL(href, win.location.href);
    } catch {
      return;
    }
    const match = classifyWindowRoute(url.pathname);
    if (!match) return;
    const fullHref = `${url.pathname}${url.search}`;

    // Reopening/focusing an EXISTING window never grows the desk — only a
    // genuinely NEW id ever has to consider the cap below.
    const existing = state.windows.some((w) => w.id === match.id);
    if (existing || state.windows.length < MAX_DESK_WINDOWS) {
      pendingOpen = origin ? { kind: 'origin', ...origin } : { kind: 'cascade' };
      dispatch({ type: 'open', id: match.id, kind: match.kind, href: fullHref, title });
      pendingOpen = null;
      return;
    }

    void openAtCapacity(match, fullHref, title, origin);
  }

  function onClickCapture(event: MouseEvent): void {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const opener = target.closest(`[${DESK_WINDOW_OPEN_ATTR}]`);
    if (!(opener instanceof HTMLAnchorElement)) return;
    const href = opener.getAttribute('href');
    if (!href) return;

    let url: URL;
    try {
      url = new URL(href, win.location.href);
    } catch {
      return;
    }
    const match = classifyWindowRoute(url.pathname);
    if (!match) return; // not a window route (e.g. a plain link that happens to carry this attribute by mistake) — let it navigate normally.

    event.preventDefault();
    const title = deriveOpenerTitle(opener) ?? '';
    // Entrance motion (robustness pass): a REAL desk item (a folder, a tray
    // chip, the levels dock…) — captured BEFORE the frame exists, same-
    // document/same-origin, no `postMessage` round trip needed.
    const rect = opener.getBoundingClientRect();
    // Focus management (robustness pass): remembered so closing THIS window
    // (with no other window left to focus instead) can send focus back to
    // the exact desk item that opened it — `requestClose`'s own header.
    openerElements.set(match.id, opener);
    openWindow(href, title, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  }
  doc.addEventListener('click', onClickCapture, true);

  function managedWindowBySource(source: MessageEventSource | null): { id: string; managed: ManagedWindow } | null {
    if (!source) return null;
    for (const [id, managed] of frames) {
      if (managed.iframe.contentWindow === source) return { id, managed };
    }
    return null;
  }

  function playCloseAnimation(managed: ManagedWindow): Promise<void> {
    if (prefersReducedMotion(win)) return Promise.resolve();
    managed.wrapper.classList.add('ingles-window--closing');
    return new Promise((resolve) => win.setTimeout(resolve, CLOSE_ANIMATION_MS));
  }

  /** Minimize's own "shrink toward the tray" exit — reuses `global.css`'s
   * existing `.ingles-window--minimizing` keyframe (a flat, standalone class
   * selector, same posture as `.ingles-window--closing` above — it applies
   * to this HOST wrapper exactly as it already does to the embedded page's
   * own `.ingles-window` section, no new CSS needed). */
  function playMinimizeAnimation(managed: ManagedWindow): Promise<void> {
    if (prefersReducedMotion(win)) return Promise.resolve();
    managed.wrapper.classList.add('ingles-window--minimizing');
    return new Promise((resolve) => win.setTimeout(resolve, MINIMIZE_ANIMATION_MS));
  }

  /**
   * Close, asking the window first — shared by the red light's own `close`
   * message AND the tray chip's own "×" (owner spec: "its own '×' closes
   * that window through the same guard"). `window.deskWindowCanClose` is a
   * same-origin direct call on the iframe's own `contentWindow` (never a
   * `postMessage` round trip for a value this needs to `await` —
   * `deskWindow.ts`'s own header); a window with nothing to guard (every
   * page except a dirty editor) resolves it `true` immediately.
   */
  async function requestClose(id: string): Promise<void> {
    const managed = frames.get(id);
    if (!managed) return;
    let canClose = true;
    try {
      const fn = (managed.iframe.contentWindow as unknown as { deskWindowCanClose?: () => Promise<boolean> })
        ?.deskWindowCanClose;
      if (fn) canClose = await fn();
    } catch {
      canClose = true;
    }
    if (!canClose) return;
    await playCloseAnimation(managed);
    dispatch({ type: 'close', id });

    // Focus management (robustness pass, owner spec: "closing returns focus
    // to the next window or to the desk item that opened it"): `state` is
    // already POST-close here (`dispatch` above is synchronous) — prefer
    // whatever window the reducer now considers active (the next one down
    // the stack), falling back to the exact desk item that opened THIS one,
    // if it is still on the page. Neither existing is a quiet no-op: focus
    // simply stays wherever the browser already put it (the closed frame
    // itself, which is no longer in the document).
    const nextActive = activeWindowId(state);
    const nextManaged = nextActive ? frames.get(nextActive) : null;
    if (nextManaged) {
      try {
        nextManaged.iframe.focus();
      } catch {
        // Best-effort.
      }
    } else {
      const opener = openerElements.get(id);
      if (opener && doc.contains(opener)) {
        opener.focus();
      }
    }
    openerElements.delete(id);
  }

  async function onMessage(event: MessageEvent): Promise<void> {
    if (event.origin !== win.location.origin) return;
    if (!isDeskWindowMessageEnvelope(event.data)) return;
    const found = managedWindowBySource(event.source);
    if (!found) return;
    const { id, managed } = found;
    const message = event.data;

    switch (message.type) {
      case 'close':
        await requestClose(id);
        return;
      case 'minimize': {
        let canMinimize = true;
        try {
          const fn = (managed.iframe.contentWindow as unknown as { deskWindowCanMinimize?: () => Promise<boolean> })
            ?.deskWindowCanMinimize;
          if (fn) canMinimize = await fn();
        } catch {
          canMinimize = true;
        }
        if (!canMinimize) return;
        await playMinimizeAnimation(managed);
        dispatch({ type: 'minimize', id });
        return;
      }
      case 'maximize-toggle':
        dispatch({ type: 'maximizeToggle', id });
        return;
      case 'open-window':
        openWindow(message.href, message.title ?? '');
        return;
      case 'title':
        dispatch({ type: 'title', id, title: message.text });
        return;
      case 'navigating':
        (managed as unknown as { showLoading: () => void }).showLoading();
        // A plain in-window link (a filter, pagination, a card) navigates
        // the iframe NATIVELY — the host never reassigns `iframe.src` for
        // this, so this `pagehide`-signaled start is the only hook to
        // re-arm the never-resolving-load timeout for it too.
        (managed as unknown as { armFallbackTimeout: () => void }).armFallbackTimeout();
        return;
      case 'ready':
        // Perf pass (owner report: the loader used to wait for the iframe's
        // own `load` — i.e. every resource the window pulls in — even once
        // its chrome had already painted): hide the loader now, whichever
        // of `ready`/`load` wins the race for this navigation. Only a
        // genuine `DeskWindow.astro` document ever posts this, so receiving
        // it already proves the chrome exists — clear the never-resolving-
        // load fallback too, same as `load`'s own handler does first. The
        // `load` handler's own chrome-less fallback-bar CHECK is untouched:
        // it still runs on `load`, against the real document, regardless of
        // whether `ready` already hid the loader.
        (managed as unknown as { showLoaded: () => void }).showLoaded();
        (managed as unknown as { clearFallbackTimeout: () => void }).clearFallbackTimeout();
        return;
      default:
        return;
    }
  }
  win.addEventListener('message', (event) => void onMessage(event));
  // Independent-blocks stacking (owner spec 2026-10-07, round 2): how many
  // minimized windows fit without covering the folders column depends on
  // the CURRENT viewport height — a resize needs the same re-measure a
  // fresh `render()` already does on every dispatch.
  win.addEventListener('resize', () => render());
  // Safety net for `draggingWindowId`: the handle's own `pointerup` already
  // clears it on a completed drag, but a pointerdown that never actually
  // started one (e.g. the window turned out to be maximized) leaves it set
  // with no handle-level `pointerup` logic to clear it again — a stray
  // `pointercancel` (an OS gesture interrupting the drag) is the same
  // story. Clearing it here unconditionally, on ANY pointerup/pointercancel
  // anywhere, costs nothing on the normal path (the handle already cleared
  // it by the time this runs) and guarantees it never gets stuck forever.
  doc.addEventListener('pointerup', () => (draggingWindowId = null));
  doc.addEventListener('pointercancel', () => (draggingWindowId = null));

  // Restore-after-reload: materialize every restored window's own frame
  // BEFORE `initialWindow` (this request's own route) is opened, so that
  // open's dedupe sees them. A no-op (renders zero frames) when nothing was
  // restored — see the `state` seed above.
  if (state.windows.length > 0) {
    render();
  }

  if (initialWindow) {
    openWindow(initialWindow.href, initialWindow.title);
  }

  return {
    openWindow,
    destroy(): void {
      doc.removeEventListener('click', onClickCapture, true);
      for (const managed of frames.values()) {
        managed.titlebarObserver?.disconnect();
        managed.wrapper.remove();
      }
      frames.clear();
    },
  };
}
