/**
 * DeskWindow wiring — the practice page's "window over the desk" ("desktop"
 * redesign PART 6a, owner spec 2026-10-06, approved mockup
 * `ChuyoCode_others/propuestas/ingles-escritorio/index.html`'s `.window` /
 * `.titlebar` / `.lights`). Owner's refinement on top of the original
 * "opens like an iOS/macOS window" approval: "la dirección cambia por
 * detrás, pero vos nunca salís del escritorio" — the practice page keeps its
 * REAL url (QR codes, shared links, guest play, the sitemap and the browser
 * back button all depend on it), it just RENDERS as a window.
 *
 * Split the same way `backNavigation.ts` is: pure, zero-DOM decisions
 * ({@link shouldStartFullScreen}, {@link shouldProceedAfterGuardDecision})
 * that are fully unit-testable, and thin DOM-wiring functions that read
 * `document`/`window` and defer to them. Anything that could silently be
 * WRONG belongs in a pure function, never inlined into a listener nobody can
 * assert on directly.
 */
import { addMinimizedWindow, removeMinimizedWindow } from './minimizedWindows';
import { isEmbeddedWindowDom, postDeskWindowMessage } from './deskWindowMessaging';

/**
 * Editor <-> window bridge (PART 6b). `DeskWindow`/`deskWindow.ts` are plain
 * DOM/vanilla TS with no idea a React island even exists; the activity
 * editor (`ActivityEditorIsland`) is a SEPARATE hydration island with its
 * own unsaved-changes state and its own `UnsavedChangesModal`. Neither one
 * can reach into the other's React state directly, so the editor registers
 * one small, explicit object on `window` while it is mounted — the only
 * thing the window's own close()/minimize() ever read from it. Unset
 * (every other window, e.g. the practice page) means "nothing to guard",
 * exactly today's unconditional-navigate behaviour.
 */
export const EDITOR_WINDOW_GUARD_KEY = '__inglesEditorWindowGuard';

export interface EditorWindowGuard {
  /** True while there is something genuinely unsaved right now. */
  isDirty(): boolean;
  /**
   * Silently flush (save) the current document — used by MINIMIZE, which is
   * "put this aside", not "leave": never worth interrupting with a modal.
   * Resolves `true` on a successful save, `false` on a failed one.
   */
  flush(): Promise<boolean>;
  /**
   * Ask the author via the editor's own `UnsavedChangesModal` (save-and-leave
   * / leave-without-saving / cancel) — used by CLOSE, and as the fallback
   * when `flush()` itself fails. Resolves once the author has answered the
   * SAME modal `ActivityEditorIsland` already shows for an in-app
   * navigation; `'saved'`/`'discarded'` both mean "safe to navigate now"
   * (whichever one happened), `'cancelled'` means "stay on this window".
   */
  confirmClose(): Promise<'saved' | 'discarded' | 'cancelled'>;
}

/**
 * Perf pass (owner report: the host's loader used to wait for the iframe's
 * own `load` event, i.e. EVERY resource this window pulls in, even once its
 * own chrome had already painted): runs `callback` two `requestAnimationFrame`
 * callbacks from now — the first one lands on the NEXT frame the browser
 * paints, the second confirms that paint actually happened rather than
 * merely being scheduled, the same "two rAFs" technique used elsewhere to
 * detect a real first paint instead of just "parsed". Falls back to two
 * deferred `setTimeout`s when `requestAnimationFrame` is unavailable (a
 * test double's fake `win`, or a very old/unusual environment) — same
 * best-effort posture as every other DOM call in this module.
 */
function afterFirstPaint(win: Window, callback: () => void): void {
  const raf = typeof win.requestAnimationFrame === 'function' ? win.requestAnimationFrame.bind(win) : null;
  if (raf) {
    raf(() => raf(callback));
    return;
  }
  win.setTimeout(() => win.setTimeout(callback, 0), 0);
}

function getEditorWindowGuard(win: Window): EditorWindowGuard | null {
  const guard = (win as unknown as Record<string, unknown>)[EDITOR_WINDOW_GUARD_KEY];
  return guard && typeof guard === 'object' ? (guard as EditorWindowGuard) : null;
}

/**
 * Pure: does a {@link EditorWindowGuard.confirmClose} outcome mean "go
 * ahead and navigate now"? Only `'cancelled'` (the author explicitly chose
 * to stay) ever says no.
 */
export function shouldProceedAfterGuardDecision(decision: 'saved' | 'discarded' | 'cancelled'): boolean {
  return decision !== 'cancelled';
}

/**
 * The CLOSE half of the editor guard, factored out of `close()` below so it
 * can ALSO be exposed as `window.deskWindowCanClose` (window-manager
 * architecture): embedded, the red light/Escape no longer resolve this
 * themselves — they just tell the host "close me" (`postDeskWindowMessage`)
 * and the HOST calls this exact function directly on the iframe's own
 * `contentWindow` (same-origin, no `postMessage` round trip needed for a
 * value it needs to `await`) before actually removing the frame. `true`
 * means "safe to close right now".
 */
async function canCloseNow(win: Window): Promise<boolean> {
  const guard = getEditorWindowGuard(win);
  if (guard && guard.isDirty()) {
    const decision = await guard.confirmClose();
    return shouldProceedAfterGuardDecision(decision);
  }
  return true;
}

/**
 * The MINIMIZE half — same split as {@link canCloseNow}, exposed as
 * `window.deskWindowCanMinimize`. A silent flush first (minimizing is "put
 * this aside", never "leave" — see `minimize()`'s own header below); only a
 * FAILED flush falls back to the same confirm modal `canCloseNow` uses.
 */
async function canMinimizeNow(win: Window): Promise<boolean> {
  const guard = getEditorWindowGuard(win);
  if (guard && guard.isDirty()) {
    const flushed = await guard.flush();
    if (!flushed) {
      const decision = await guard.confirmClose();
      return shouldProceedAfterGuardDecision(decision);
    }
  }
  return true;
}

const FULLSCREEN_STORAGE_KEY = 'ingles-desk-window-fullscreen';

/** How long the "minimize" CSS animation (`.ingles-window--minimizing`,
 * `global.css`) runs before the actual navigation fires — long enough to
 * read as a real minimize, short enough that it never feels like a stuck
 * click. Skipped entirely under `prefers-reduced-motion: reduce`. */
const MINIMIZE_ANIMATION_MS = 180;

/** Same posture for the red light's own "close" animation
 * (`.ingles-window--closing`, `global.css`) — PART 6c (owner spec
 * 2026-10-07): a subtle scale+fade, never a directional move (unlike
 * minimize, closing is not "going" anywhere in particular). */
const CLOSE_ANIMATION_MS = 160;

export const DESK_WINDOW_ATTR = {
  close: 'data-desk-window-close',
  minimize: 'data-desk-window-minimize',
  fullscreen: 'data-desk-window-fullscreen',
  opener: 'data-desk-window-open',
} as const;

/**
 * Every focusable element inside `container`, in DOM order — the focus
 * trap's own bounds below, and a pure/zero-DOM-event function so the
 * selector itself stays unit-testable without wiring up real keyboard
 * events. Deliberately simple: the one element this could wrongly include —
 * the "Más" overflow menu's own `<input type="checkbox">` trigger
 * (`[id].astro`) — is always genuinely focusable/operable regardless of
 * whether its panel is currently open, so no extra visibility filtering is
 * needed here.
 */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

/**
 * Where the red light (always) and the yellow light (when there is no
 * `trayId` to minimize to) send the visitor: a plain navigation to
 * `targetPath` — the signed-in visitor's Inglés hub/desk, or the ChuyoCode
 * home for a guest (whose hub would only ask them to sign in).
 *
 * PART 6c (owner spec 2026-10-07, "si en la ventana se hace click en el
 * botón rojo se cierra y deja la ventana del inglés main"): closing ALWAYS
 * lands on the desk now, via a plain `href` navigation — never
 * `history.back()`, regardless of whatever screen this visitor actually
 * came from. This deliberately replaces the older "prefer `history.back()`
 * to the tracked previous screen" behaviour (`resolveCloseAction`/
 * `resolveTrackedCloseAction`, removed here, along with the
 * `closeUsesTrackedPath` prop that selected between them): now that the
 * desk itself stays visible and interactive behind every window (PART 6c's
 * non-modal floating window), "closing" is unambiguously "go back to the
 * desk", not "go back to wherever I was before" — see `closeNow` below.
 */

/**
 * Should the window start full screen (green light toggled on, remembered
 * "per browser" — owner spec)? Pure given whatever `localStorage.getItem`
 * already returned, so the read/write Storage calls themselves stay in the
 * one thin wiring function below, inside their own `try`/`catch`.
 */
export function shouldStartFullScreen(storedValue: string | null): boolean {
  return storedValue === 'true';
}

/** Read the full-screen preference, `try`/`catch`-guarded (private browsing, quota, disabled storage). */
export function readFullScreenPreference(storage: Pick<Storage, 'getItem'> = localStorage): boolean {
  try {
    return shouldStartFullScreen(storage.getItem(FULLSCREEN_STORAGE_KEY));
  } catch {
    return false;
  }
}

/** Persist the full-screen preference, `try`/`catch`-guarded. */
export function writeFullScreenPreference(
  value: boolean,
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  try {
    storage.setItem(FULLSCREEN_STORAGE_KEY, String(value));
  } catch {
    // Best-effort — a visitor who blocks storage just re-opens in the default state next time.
  }
}

/**
 * Window-side: wires the three "traffic light" buttons, Escape, and initial
 * focus. `windowEl` is the `role="dialog"` element itself; `closeTargetPath`
 * is the hub/desk (signed-in) or the ChuyoCode home (guest) — see the
 * comment above `closeNow` below. `trayId` is the activity id the yellow
 * light minimizes TO a tray chip for — `null` for a guest (no desk/tray
 * behind a guest's window, see `DeskWindow.astro`'s own header), in which
 * case the yellow light just falls back to doing exactly what the red one
 * does.
 */
export function initDeskWindow(
  windowEl: HTMLElement,
  closeTargetPath: string,
  trayId: string | null = null,
  closeOnEscape: boolean = true,
  doc: Document = document,
  win: Window = window,
): void {
  // Guard against double-wiring (same posture as `deskHelper.ts#initDeskHelper`):
  // `DeskWindow.astro`'s own script calls this both immediately AND on
  // `astro:page-load` (which also fires for the very first load) — without
  // this flag, Escape/the lights would each fire twice on that first load.
  // The flag lives on `windowEl` itself, never a module-level variable, so a
  // genuine navigation to a DIFFERENT activity (a fresh, non-persisted
  // window element) still gets wired.
  if (windowEl.dataset.deskWindowReady === 'true') return;
  windowEl.dataset.deskWindowReady = 'true';

  // EMBEDDED (window-manager architecture): the host renders the entrance
  // animation (`deskWindowManager.ts#applyOpenAnimation`) and owns full-
  // screen/maximize state itself — see this file's own header on
  // `isEmbedded`/`postDeskWindowMessage` below. GUEST (never embedded): no
  // desk/folder exists for its window to have scaled in from either — a
  // guest always lands on this window directly (a QR code, a shared link),
  // never by clicking a `[data-desk-window-open]` desk item — so there has
  // never been an entrance animation to play here for either case.
  const embedded = isEmbeddedWindowDom(doc);

  const fullscreenButton = windowEl.querySelector<HTMLElement>(`[${DESK_WINDOW_ATTR.fullscreen}]`);
  // "Remembered per browser" (owner spec): applied on mount, before anything
  // else, so a visitor who left it full screen sees it that way immediately
  // rather than flashing open small first. Embedded: the host decides
  // maximize state fresh on every open — a stale per-browser preference
  // would otherwise flash a window maximized that the host never asked for.
  if (fullscreenButton && !embedded && readFullScreenPreference()) {
    windowEl.setAttribute('data-fullscreen', 'true');
    fullscreenButton.setAttribute('aria-pressed', 'true');
  }

  // `window.deskWindowCanClose`/`deskWindowCanMinimize` (window-manager
  // architecture): exposed UNCONDITIONALLY (harmless outside an iframe —
  // nothing else ever calls them) so the HOST can call them directly on
  // `iframe.contentWindow` before honouring a `close`/`minimize` message,
  // same-origin, no `postMessage` round trip needed for a value it awaits.
  (win as unknown as Record<string, unknown>).deskWindowCanClose = () => canCloseNow(win);
  (win as unknown as Record<string, unknown>).deskWindowCanMinimize = () => canMinimizeNow(win);

  function prefersReducedMotion(): boolean {
    try {
      return win.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }

  // Closing for good (red light / Escape) drops any tray chip this activity
  // may have left behind from an earlier minimize — owner spec: "closing
  // (red) removes any chip for that activity" — then ALWAYS navigates
  // straight to the desk (never `history.back()`, see this file's own
  // comment above `closeTargetPath`'s header), with a subtle "close"
  // animation (`.ingles-window--closing`, `global.css`) unless
  // `prefers-reduced-motion: reduce`.
  function closeNow(): void {
    if (trayId) removeMinimizedWindow(trayId, win.sessionStorage);
    const navigate = () => {
      win.location.href = closeTargetPath;
    };
    if (prefersReducedMotion()) {
      navigate();
      return;
    }
    windowEl.classList.add('ingles-window--closing');
    win.setTimeout(navigate, CLOSE_ANIMATION_MS);
  }

  // PART 6b: the editor-aware wrapper around `closeNow` — every other
  // window (no guard ever registered on `win`) resolves this on the same
  // tick, so nothing changes for them. A dirty editor asks its own modal
  // first (`confirmClose`) and only actually closes once the author picked
  // "save and leave" or "leave without saving"; "cancel" leaves the window
  // open with nothing navigated.
  //
  // EMBEDDED (window-manager architecture): the guard check moves to the
  // HOST (it calls `window.deskWindowCanClose` directly on this frame,
  // exposed above) — this just asks it to close, with no local animation or
  // navigation of its own; the host plays the close animation on its own
  // frame element and removes it once (if) it actually honours the request.
  async function close(): Promise<void> {
    if (embedded) {
      postDeskWindowMessage(win, { type: 'close' });
      return;
    }
    // Inlined rather than calling `canCloseNow` (same logic): a clean guard
    // (or no guard at all) must resolve `closeNow()` SYNCHRONOUSLY, with no
    // extra microtask tick — `canCloseNow`'s own `await` on an
    // already-resolved `Promise.resolve(true)` would still defer one tick,
    // which is observable (and was never true of this function before the
    // embedded branch above existed).
    const guard = getEditorWindowGuard(win);
    if (guard && guard.isDirty()) {
      const decision = await guard.confirmClose();
      if (!shouldProceedAfterGuardDecision(decision)) return;
    }
    closeNow();
  }

  // Minimizing (yellow light) — owner feedback 2026-10-06, replacing the old
  // behaviour where it just did exactly what the red light does: remember
  // this window as a tray chip (`@lib/ui/minimizedWindows`, the desk's own
  // dock reads it on mount), play a short "shrinking down" animation
  // (`.ingles-window--minimizing`, `global.css`, skipped entirely under
  // `prefers-reduced-motion: reduce`), THEN navigate to the hub — always a
  // plain `href` navigation, never `history.back()`: minimizing is "put this
  // aside", not "go back", and the chip's own reopen (a fresh navigation TO
  // this same URL) should feel symmetrical with how it got there. A guest
  // (`trayId === null`, no desk/tray behind their window) falls back to
  // `close()` outright — there is nowhere for a chip to live.
  function minimizeNow(): void {
    if (!trayId) {
      void close();
      return;
    }

    const titleEl = doc.getElementById(windowEl.getAttribute('aria-labelledby') ?? '');
    const title = titleEl?.textContent?.trim() ?? '';
    addMinimizedWindow(
      { id: trayId, title, href: `${win.location.pathname}${win.location.search}`, thumbnail: null, t: Date.now() },
      win.sessionStorage,
    );

    const navigate = () => {
      win.location.href = closeTargetPath;
    };

    if (prefersReducedMotion()) {
      navigate();
      return;
    }
    windowEl.classList.add('ingles-window--minimizing');
    win.setTimeout(navigate, MINIMIZE_ANIMATION_MS);
  }

  // PART 6b: minimizing is "put this aside", never "leave" — a dirty editor
  // gets a SILENT flush (`guard.flush()`) first, never the blocking modal,
  // so the author never loses the chip-reopen round trip over a confirm
  // dialog they did not expect here. Only if that flush itself fails do we
  // fall back to the SAME `confirmClose` modal `close()` uses above — by
  // then something is genuinely wrong with saving, and silently minimizing
  // over it would risk losing the draft for real.
  // EMBEDDED: same split as `close()` above — the host calls
  // `window.deskWindowCanMinimize` directly before honouring this, and owns
  // the tray entry/animation itself (the iframe stays alive, just hidden —
  // see `deskWindowManager.ts`'s own header), so there is nothing left for
  // this frame to write to `sessionStorage` or animate locally.
  async function minimize(): Promise<void> {
    if (embedded) {
      postDeskWindowMessage(win, { type: 'minimize' });
      return;
    }
    // Inlined, same reasoning as `close()` above — a clean guard resolves synchronously.
    const guard = getEditorWindowGuard(win);
    if (guard && guard.isDirty()) {
      const flushed = await guard.flush();
      if (!flushed) {
        const decision = await guard.confirmClose();
        if (!shouldProceedAfterGuardDecision(decision)) return;
      }
    }
    minimizeNow();
  }

  // The traffic lights are plain `<a href={closeHref}>` anchors (see
  // `DeskWindow.astro`'s own header on why) — this progressive-enhancement
  // click handler intercepts only a plain, unmodified left click (same guard
  // `backNavigation.ts#initBackButtons` uses) so Ctrl/Cmd/Shift-click and a
  // middle-click still open the hub normally, in a new tab. A plain click
  // calls `preventDefault` FIRST: without it, the anchor's own default
  // navigation to `closeHref` would race the animated-close/minimize
  // branches above.
  windowEl.querySelectorAll<HTMLElement>(`[${DESK_WINDOW_ATTR.close}]`).forEach((button) => {
    button.addEventListener('click', (event) => {
      if (event.defaultPrevented || !(event instanceof MouseEvent) || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      void close();
    });
  });

  windowEl.querySelectorAll<HTMLElement>(`[${DESK_WINDOW_ATTR.minimize}]`).forEach((button) => {
    button.addEventListener('click', (event) => {
      if (event.defaultPrevented || !(event instanceof MouseEvent) || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      void minimize();
    });
  });

  if (fullscreenButton) {
    fullscreenButton.addEventListener('click', () => {
      const next = windowEl.getAttribute('data-fullscreen') !== 'true';
      windowEl.setAttribute('data-fullscreen', String(next));
      fullscreenButton.setAttribute('aria-pressed', String(next));
      // Embedded: "full screen" means filling the HOST's own viewport (its
      // frame element), a host-owned layout decision with no meaningful
      // per-browser preference to remember inside the iframe — ask the host
      // instead of writing to `localStorage`.
      if (embedded) {
        postDeskWindowMessage(win, { type: 'maximize-toggle' });
      } else {
        writeFullScreenPreference(next);
      }
    });
  }

  // PART 6b: skipped entirely for a window whose body already owns Escape
  // for its own purpose (the editor) — see `closeOnEscape`'s own doc on
  // `DeskWindow.astro`. Every existing caller passes `true` (the default)
  // and keeps today's behaviour unchanged.
  if (closeOnEscape) {
    doc.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !event.defaultPrevented) void close();
    });
  }

  // INITIAL FOCUS lands on the dialog element itself, never the red light —
  // see `DeskWindow.astro`'s own header for why (no focus ring flashes on a
  // pointer visit). `outline-none` on the element keeps it invisible even
  // for a keyboard visit.
  //
  // NO FOCUS TRAP (PART 6c, owner spec 2026-10-07): the window is no longer
  // modal — the desk behind it stays visible AND usable, so Tab/Shift+Tab
  // are free to leave the window and reach the desk (or the header) exactly
  // like any other non-modal floating window. `focusableElements` above is
  // kept (still exported/tested) as a small, generic, reusable query — it
  // simply has no caller inside this function anymore.
  windowEl.focus();

  // EMBEDDED (window-manager architecture): tell the host what to show in
  // its OWN title bar/tray chip/`history.replaceState` — the host never
  // loads this window's data itself (`@lib/ui/embeddedWindow`'s own header),
  // so this is the only way it learns the real title, e.g. for the very
  // FIRST window a direct visit opens, before any `[data-desk-window-open]`
  // anchor text was there to seed it from. `navigating` on `pagehide` is
  // what re-arms the host's loader for every later IN-WINDOW navigation
  // (there is no `ClientRouter` here — each one is a real iframe navigation,
  // so this script re-runs fresh on the next page and posts its own title
  // again once mounted).
  if (embedded) {
    const titleEl = doc.getElementById(windowEl.getAttribute('aria-labelledby') ?? '');
    const initialTitle = titleEl?.textContent?.trim();
    if (initialTitle) postDeskWindowMessage(win, { type: 'title', text: initialTitle });
    win.addEventListener('pagehide', () => postDeskWindowMessage(win, { type: 'navigating' }));

    // "ready" (perf pass, owner report above): posted once this window's own
    // chrome has actually painted, so the HOST can hide its loader right
    // then instead of waiting for the iframe's own `load` — this function
    // only ever runs for a genuine desk window, so receiving this message at
    // all already proves the chrome exists (`deskWindowManager.ts`'s own
    // `ready` handler still leaves the chrome-less fallback-bar check on the
    // real `load` event, which needs the FULL document, not just this
    // script, to have run).
    afterFirstPaint(win, () => postDeskWindowMessage(win, { type: 'ready' }));
  }
}

/** `[data-desk-open-window]`'s own marker attribute — see {@link initDeskOpenWindowLinks}'s own header. */
export const DESK_OPEN_WINDOW_ATTR = 'data-desk-open-window';

/**
 * EMBEDDED-only (window-manager architecture): wires every
 * `[data-desk-open-window]` link INSIDE this window's own content — a
 * community card, the community window's own "+" shortcut, a future
 * "Duplicar" result — to ask the HOST to open a NEW window instead of
 * navigating (a plain in-window navigation otherwise, exactly the point of
 * `[data-desk-window-open]`'s OWN host-side click interception —
 * `@lib/ui/deskWindowManager.ts`'s own header — this is the embedded-side
 * counterpart for a link that must open ANOTHER window rather than replace
 * this one). A no-op outside embedded mode (every existing non-window page
 * this attribute might ever reach — e.g. `ActivityCard` reused elsewhere —
 * keeps today's plain navigation unchanged).
 *
 * Self-guards against double-wiring on `doc.documentElement`, same posture
 * as every other desk script; safe to call unconditionally once per page
 * (`DeskWindow.astro`'s own script already does, alongside `initDeskWindow`).
 */
export function initDeskOpenWindowLinks(doc: Document = document, win: Window = window): void {
  if (!isEmbeddedWindowDom(doc)) return;
  if (doc.documentElement.dataset.deskOpenWindowLinksReady === 'true') return;
  doc.documentElement.dataset.deskOpenWindowLinksReady = 'true';

  doc.addEventListener(
    'click',
    (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const opener = target.closest(`[${DESK_OPEN_WINDOW_ATTR}]`);
      if (!(opener instanceof HTMLAnchorElement)) return;
      const href = opener.getAttribute('href');
      if (!href) return;

      event.preventDefault();
      const title = opener.getAttribute('aria-label')?.trim() || opener.textContent?.trim() || '';
      postDeskWindowMessage(win, { type: 'open-window', href, title: title || null });
    },
    true,
  );
}
