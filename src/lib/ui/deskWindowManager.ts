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
import { renderMinimizedWindowsTrayFrom, type MinimizedWindowEntry } from './minimizedWindows';
import { readPersistedDeskWindows, writePersistedDeskWindows } from './deskWindowsPersistence';

const HEADER_SELECTOR = '[data-chrome-header]';
const DESK_BREAKPOINT_QUERY = '(min-width: 1100px)';

/** `DeskWindow.astro`'s own root element marker — present on every genuine desk-window document. Its absence is what {@link buildFallbackBar}'s own bar guards against. */
const DESK_WINDOW_MARKER_SELECTOR = '[data-desk-window]';

/** Marks a link anywhere on the HOST page (a desk folder, a tray chip, the levels dock…) as something the manager should open as a window rather than navigate to. Same attribute `@lib/ui/deskWindow.ts#initDeskWindowOpeners` already looked for (its own scale-in capture) — a manager click handler that `preventDefault()`s in the CAPTURE phase makes that older bubble-phase listener a no-op for free (it already bails out on `event.defaultPrevented`). */
export const DESK_WINDOW_OPEN_ATTR = 'data-desk-window-open';

const CLOSE_ANIMATION_MS = 160;

/** The wrapper's own default (non-maximized) geometry — identical to `DeskWindow.astro`'s old desktop-inset treatment, now owned by the HOST frame instead of the embedded page itself. */
const WRAPPER_CLASS =
  'fixed inset-0 z-50 overflow-clip rounded-none bg-card desk:inset-x-[max(48px,calc((100vw-1240px)/2))] desk:top-(--chrome-header-offset) desk:bottom-16 desk:rounded-[18px] shadow-[0_0_0_1px_rgb(28_28_30_/_0.08),0_30px_80px_rgb(28_28_30_/_0.22)]';

interface ManagedWindow {
  wrapper: HTMLElement;
  iframe: HTMLIFrameElement;
  loader: HTMLElement;
  /** Set on `drag-start`, cleared on `drag-end` — the offset to add the posted screen deltas to. */
  dragStartOffset: DeskWindowOffset | null;
}

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

function headerBottom(doc: Document): number {
  const header = doc.querySelector<HTMLElement>(HEADER_SELECTOR);
  return header ? header.getBoundingClientRect().bottom : 0;
}

/** The wrapper's own rect at offset `{0,0}` — same "unoffset before re-clamping" posture as `deskWindowDrag.ts#unoffsetWindowRect`. */
function unoffsetWrapperRect(wrapper: HTMLElement, current: DeskWindowOffset): WindowRect {
  const rect = wrapper.getBoundingClientRect();
  return { top: rect.top - current.y, left: rect.left - current.x, width: rect.width, height: rect.height };
}

/** A calm, title-bar-shaped loading skeleton — shown until the iframe's own `load` fires, then faded out. No shimmer animation under reduced motion. */
function buildLoader(doc: Document, win: Window): HTMLElement {
  const loader = doc.createElement('div');
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

  bar.appendChild(lights);

  const title = doc.createElement('b');
  title.dataset.deskWindowFallbackTitle = '';
  title.className = 'min-w-0 truncate text-[13px] font-semibold text-foreground';
  bar.appendChild(title);

  return { bar, title, closeButton, minimizeButton };
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

  function applyGeometry(managed: ManagedWindow, entry: DeskWindowEntry): void {
    managed.wrapper.style.zIndex = String(1000 + entry.z);
    managed.wrapper.style.visibility = entry.minimized ? 'hidden' : '';
    if (entry.minimized) {
      managed.wrapper.setAttribute('inert', '');
    } else {
      managed.wrapper.removeAttribute('inert');
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
    const rect = unoffsetWrapperRect(managed.wrapper, { x: 0, y: 0 });
    const clamped = clampWindowDragOffset(entry.offset, rect, { width: win.innerWidth, height: win.innerHeight }, headerBottom(doc));
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

  function createManagedWindow(entry: DeskWindowEntry): ManagedWindow {
    const wrapper = doc.createElement('div');
    wrapper.className = WRAPPER_CLASS;
    wrapper.dataset.deskWindowFrame = entry.id;

    const iframe = doc.createElement('iframe');
    iframe.className = 'absolute inset-0 h-full w-full border-0';
    iframe.setAttribute('allow', 'fullscreen');
    iframe.setAttribute('title', entry.title);
    const url = new URL(entry.href, win.location.href);
    url.searchParams.set('ventana', '1');
    iframe.src = url.toString();

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
    const { bar: fallbackBar, title: fallbackTitle, closeButton: fallbackClose, minimizeButton: fallbackMinimize } =
      buildFallbackBar(doc);
    fallbackClose.addEventListener('click', () => void requestClose(entry.id));
    fallbackMinimize.addEventListener('click', () => dispatch({ type: 'minimize', id: entry.id }));
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
      const rect = unoffsetWrapperRect(wrapper, { x: 0, y: 0 });
      const clamped = clampWindowDragOffset(next, rect, { width: win.innerWidth, height: win.innerHeight }, headerBottom(doc));
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

      // Fool-proofing a chrome-less frame (robustness pass, owner report):
      // show the fallback title bar exactly when the loaded document is
      // NOT a genuine desk window (a login page after a session-expiry
      // redirect, a 404/500 error page, …) — hidden again the moment a
      // later navigation lands back on a real one.
      try {
        const innerDoc = iframe.contentDocument;
        const isDeskWindow = !!innerDoc?.querySelector(DESK_WINDOW_MARKER_SELECTOR);
        fallbackBar.hidden = isDeskWindow;
        if (!isDeskWindow) {
          fallbackTitle.textContent = innerDoc?.title?.trim() || entry.title || '';
        }
      } catch {
        // Cross-origin — should never happen (see this file's own header);
        // optimistically assume a genuine window rather than flash the bar.
      }
    });

    wrapper.addEventListener('pointerdown', () => dispatch({ type: 'focus', id: entry.id }), true);

    wrapper.appendChild(iframe);
    wrapper.appendChild(loader);
    wrapper.appendChild(fallbackBar);
    container.appendChild(wrapper);

    const managed: ManagedWindow = { wrapper, iframe, loader, dragStartOffset: null };
    // Expose a hook so `onMessage`'s `navigating` handler (posted by the
    // embedded page right as an in-window navigation starts) can re-arm this
    // exact loader without a second lookup.
    (managed as unknown as { showLoading: () => void }).showLoading = showLoading;
    return managed;
  }

  function render(): void {
    const ids = new Set(state.windows.map((w) => w.id));
    for (const [id, managed] of frames) {
      if (!ids.has(id)) {
        managed.wrapper.remove();
        frames.delete(id);
      }
    }

    for (const entry of state.windows) {
      let managed = frames.get(entry.id);
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
        }
      }
      applyGeometry(managed, entry);
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
      renderMinimizedWindowsTrayFrom(
        trayContainer,
        entries,
        trayRemoveLabel,
        (id) => void requestClose(id),
        () => render(),
        doc,
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
    state = reduceDeskWindows(state, event);
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
  async function openAtCapacity(match: WindowRouteMatch, href: string, title: string): Promise<void> {
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
        dispatch({ type: 'open', id: match.id, kind: match.kind, href, title });
        return;
      }
    }
    if (maxWindowsNoticeLabel) toast(maxWindowsNoticeLabel);
  }

  function openWindow(href: string, title: string): void {
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
      dispatch({ type: 'open', id: match.id, kind: match.kind, href: fullHref, title });
      return;
    }

    void openAtCapacity(match, fullHref, title);
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
    openWindow(href, title);
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
        dispatch({ type: 'minimize', id });
        return;
      }
      case 'maximize-toggle':
        dispatch({ type: 'maximizeToggle', id });
        return;
      case 'drag-start': {
        const entry = state.windows.find((w) => w.id === id);
        managed.dragStartOffset = entry?.offset ?? { x: 0, y: 0 };
        return;
      }
      case 'drag-move': {
        if (!managed.dragStartOffset || !isDesktop(win)) return;
        const next = { x: managed.dragStartOffset.x + message.dx, y: managed.dragStartOffset.y + message.dy };
        const rect = unoffsetWrapperRect(managed.wrapper, { x: 0, y: 0 });
        const clamped = clampWindowDragOffset(next, rect, { width: win.innerWidth, height: win.innerHeight }, headerBottom(doc));
        managed.wrapper.style.translate = `${clamped.x}px ${clamped.y}px`;
        return;
      }
      case 'drag-end': {
        if (!managed.dragStartOffset) return;
        const translate = managed.wrapper.style.translate || '0px 0px';
        const [x, y] = translate.split(' ').map((v) => Number.parseFloat(v) || 0);
        managed.dragStartOffset = null;
        dispatch({ type: 'move', id, offset: { x, y } });
        return;
      }
      case 'open-window':
        openWindow(message.href, message.title ?? '');
        return;
      case 'title':
        dispatch({ type: 'title', id, title: message.text });
        return;
      case 'navigating':
        (managed as unknown as { showLoading: () => void }).showLoading();
        return;
      default:
        return;
    }
  }
  win.addEventListener('message', (event) => void onMessage(event));

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
      for (const managed of frames.values()) managed.wrapper.remove();
      frames.clear();
    },
  };
}
