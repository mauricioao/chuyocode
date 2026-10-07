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

const FULLSCREEN_STORAGE_KEY = 'ingles-desk-window-fullscreen';
const ORIGIN_STORAGE_KEY = 'ingles-desk-window-origin';
const RETURN_FOCUS_STORAGE_KEY = 'ingles-desk-window-return-focus';
/** An origin/return-focus entry older than this is treated as stale (e.g. a
 * folder click that led somewhere other than a window, or a browser tab left
 * open for a while) and ignored rather than mis-applied to an unrelated
 * later visit. */
const ORIGIN_MAX_AGE_MS = 5000;

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

interface OriginEntry {
  id: string;
  x: number;
  y: number;
  t: number;
}

function isOriginEntry(value: unknown): value is OriginEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string' && typeof v.x === 'number' && typeof v.y === 'number' && typeof v.t === 'number';
}

/**
 * Hub-side (and anywhere else a `[data-desk-window-open]` opener lives):
 * capture the clicked opener's own viewport rect BEFORE the browser
 * navigates away, so the window page can scale in FROM that spot (mockup's
 * own `--from` custom property) instead of always from the screen's centre.
 * Does not call `preventDefault` — the real navigation proceeds exactly as
 * the plain `<a href>` already describes; this only ever writes a few bytes
 * to `sessionStorage` alongside it.
 */
export function initDeskWindowOpeners(doc: Document = document, win: Window = window): void {
  // Guard against double-wiring (same posture as `deskHelper.ts#initDeskHelper`):
  // this listener is bound to `document`, which survives every client-side
  // navigation for the whole session, while the hub's own script re-runs
  // `initDeskWindowOpeners` every time a visitor RETURNS to the hub — without
  // this flag, each return trip would stack another full-document click
  // listener on top of the last.
  const root = doc.documentElement;
  if (root.dataset.deskWindowOpenersReady === 'true') return;
  root.dataset.deskWindowOpenersReady = 'true';

  doc.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const target = event.target;
    if (!(target instanceof Element)) return;
    const opener = target.closest(`[${DESK_WINDOW_ATTR.opener}]`);
    if (!(opener instanceof HTMLElement)) return;
    const id = opener.getAttribute(DESK_WINDOW_ATTR.opener);
    if (!id) return;

    const rect = opener.getBoundingClientRect();
    const entry: OriginEntry = {
      id,
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      t: Date.now(),
    };
    try {
      win.sessionStorage.setItem(ORIGIN_STORAGE_KEY, JSON.stringify(entry));
    } catch {
      // Best-effort — the window just opens centred instead.
    }
  });
}

/**
 * Window-side, on mount: consume a fresh (not stale) opener entry, if any,
 * to set the scale-in's transform-origin — then move it to the
 * return-focus key (same id) so the hub can refocus that exact opener once
 * the window closes. A direct visit (no entry, or a stale one from an
 * unrelated earlier click) leaves the CSS default (centre) alone.
 */
export function applyDeskWindowOrigin(
  windowEl: HTMLElement,
  win: Window = window,
): void {
  let raw: string | null;
  try {
    raw = win.sessionStorage.getItem(ORIGIN_STORAGE_KEY);
    win.sessionStorage.removeItem(ORIGIN_STORAGE_KEY);
  } catch {
    return;
  }
  if (!raw) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  if (!isOriginEntry(parsed)) return;
  if (Date.now() - parsed.t > ORIGIN_MAX_AGE_MS) return;

  windowEl.style.setProperty('--ingles-window-from', `${parsed.x}px ${parsed.y}px`);
  try {
    win.sessionStorage.setItem(RETURN_FOCUS_STORAGE_KEY, parsed.id);
  } catch {
    // Best-effort — the hub just leaves focus wherever it already is.
  }
}

/**
 * Hub-side, on mount (first load AND every `astro:page-load`, since the hub
 * is exactly where a closed window returns to): refocus the opener the
 * window remembers closing back to, if it still exists on the page.
 * Always clears the key, found or not, so a later unrelated visit never
 * inherits a stale focus target.
 */
export function applyDeskWindowReturnFocus(doc: Document = document, win: Window = window): void {
  let id: string | null;
  try {
    id = win.sessionStorage.getItem(RETURN_FOCUS_STORAGE_KEY);
    win.sessionStorage.removeItem(RETURN_FOCUS_STORAGE_KEY);
  } catch {
    return;
  }
  if (!id) return;

  const opener = doc.querySelector(`[${DESK_WINDOW_ATTR.opener}="${id}"]`);
  if (opener instanceof HTMLElement) {
    opener.focus();
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

  applyDeskWindowOrigin(windowEl, win);

  const fullscreenButton = windowEl.querySelector<HTMLElement>(`[${DESK_WINDOW_ATTR.fullscreen}]`);
  // "Remembered per browser" (owner spec): applied on mount, before anything
  // else, so a visitor who left it full screen sees it that way immediately
  // rather than flashing open small first.
  if (fullscreenButton && readFullScreenPreference()) {
    windowEl.setAttribute('data-fullscreen', 'true');
    fullscreenButton.setAttribute('aria-pressed', 'true');
  }

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
  async function close(): Promise<void> {
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
  async function minimize(): Promise<void> {
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
      writeFullScreenPreference(next);
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
}
