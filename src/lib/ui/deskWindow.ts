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
 * ({@link resolveCloseAction}, {@link shouldStartFullScreen}) that are fully
 * unit-testable, and thin DOM-wiring functions that read `document`/`window`
 * and defer to them. Anything that could silently be WRONG belongs in a pure
 * function, never inlined into a listener nobody can assert on directly.
 */

const FULLSCREEN_STORAGE_KEY = 'ingles-desk-window-fullscreen';
const ORIGIN_STORAGE_KEY = 'ingles-desk-window-origin';
const RETURN_FOCUS_STORAGE_KEY = 'ingles-desk-window-return-focus';
/** An origin/return-focus entry older than this is treated as stale (e.g. a
 * folder click that led somewhere other than a window, or a browser tab left
 * open for a while) and ignored rather than mis-applied to an unrelated
 * later visit. */
const ORIGIN_MAX_AGE_MS = 5000;

export const DESK_WINDOW_ATTR = {
  close: 'data-desk-window-close',
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
 * Where the close/minimize "traffic lights" should send the visitor.
 *
 * Both lights do the exact same thing (owner spec: "closing the window
 * returns to the desk"): navigate to `targetPath` — the signed-in visitor's
 * Inglés hub, or the ChuyoCode home for a guest (whose hub would only ask
 * them to sign in). When the browser ALREADY has `targetPath` as the
 * immediately previous history entry (same-origin referrer, at least one
 * earlier entry), `history.back()` is preferred over a fresh navigation to
 * the same place — it is what lets the desk's `transition:persist`-ed DOM
 * come back exactly as it was, and feels like "back" rather than a forward
 * navigation that happens to land on the same URL.
 *
 * @param referrer - `document.referrer`.
 * @param currentOrigin - `window.location.origin`.
 * @param historyLength - `window.history.length`.
 * @param targetPath - The close target's own pathname (e.g. `/es/ingles` or `/es/`).
 */
export function resolveCloseAction(
  referrer: string,
  currentOrigin: string,
  historyLength: number,
  targetPath: string,
): { kind: 'back' } | { kind: 'href'; href: string } {
  if (historyLength > 1 && referrer) {
    try {
      const referrerUrl = new URL(referrer);
      if (referrerUrl.origin === currentOrigin && referrerUrl.pathname === targetPath) {
        return { kind: 'back' };
      }
    } catch {
      // A malformed `document.referrer` (some privacy extensions blank it to
      // a non-URL string rather than "") falls through to the plain href.
    }
  }
  return { kind: 'href', href: targetPath };
}

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
 * is the hub (signed-in) or the ChuyoCode home (guest) — see
 * {@link resolveCloseAction}.
 */
export function initDeskWindow(
  windowEl: HTMLElement,
  closeTargetPath: string,
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

  function close(): void {
    const action = resolveCloseAction(doc.referrer, win.location.origin, win.history.length, closeTargetPath);
    if (action.kind === 'back') {
      win.history.back();
    } else {
      win.location.href = action.href;
    }
  }

  // The close/minimize lights are plain `<a href={closeHref}>` anchors (see
  // `DeskWindow.astro`'s own header on why) — this progressive-enhancement
  // click handler intercepts only a plain, unmodified left click (same guard
  // `backNavigation.ts#initBackButtons` uses) so Ctrl/Cmd/Shift-click and a
  // middle-click still open the hub normally, in a new tab. A plain click
  // calls `preventDefault` FIRST: without it, the anchor's own default
  // navigation to `closeHref` would race the `history.back()` branch below.
  windowEl.querySelectorAll<HTMLElement>(`[${DESK_WINDOW_ATTR.close}]`).forEach((button) => {
    button.addEventListener('click', (event) => {
      if (event.defaultPrevented || !(event instanceof MouseEvent) || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      close();
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

  doc.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !event.defaultPrevented) close();
  });

  // Focus trap (bugfix, 2026-10-06): Tab/Shift+Tab cycle among the dialog's
  // OWN focusable elements only, never escaping to the rest of the page.
  // `inert` on the header/footer/desk (`BaseLayout.astro`/`DeskScene.astro`)
  // already removes every one of THEIR elements from the tab order, so this
  // is mostly a safety net for browsers/assistive tech that do not honour
  // `inert` for sequential focus navigation — but it also fixes the one case
  // `inert` cannot: wrapping Tab past the dialog's OWN last element (or
  // Shift+Tab past its first) back around to the other end, instead of
  // leaving the page/document entirely.
  windowEl.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab' || event.defaultPrevented) return;
    const elements = focusableElements(windowEl);
    if (elements.length === 0) {
      event.preventDefault();
      return;
    }
    const first = elements[0];
    const last = elements[elements.length - 1];
    const active = doc.activeElement;
    if (event.shiftKey) {
      if (active === first || active === windowEl) {
        event.preventDefault();
        last.focus();
      }
    } else if (active === last) {
      event.preventDefault();
      first.focus();
    }
  });

  // INITIAL FOCUS lands on the dialog element itself, never the red light —
  // see `DeskWindow.astro`'s own header for why (no focus ring flashes on a
  // pointer visit). `outline-none` on the element keeps it invisible even
  // for a keyboard visit; the very next Tab reaches the red light exactly as
  // before, via the trap above.
  windowEl.focus();
}
