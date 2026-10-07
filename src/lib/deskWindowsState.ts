/**
 * deskWindowsState — pure, zero-DOM state for the desk's own window manager
 * (window-floats-over-the-desk architecture, replacing the one-window-per-
 * SSR-route model: see `src/lib/ui/deskWindowManager.ts`'s own header for the
 * DOM wiring this drives).
 *
 * Owner's complaint this exists to fix: "actualmente al abrir la ventana se
 * borran los tips, me da la impresión clara que pasa a otra ventana, esto no
 * debería pasar" — opening a window used to NAVIGATE the desk route away,
 * discarding the helper's tip bubble (and every other desk-local state).
 * Every window is now a same-origin `<iframe>` floating over a desk that
 * never unmounts; this module is the reducer that owns which windows exist,
 * their stacking order, their minimized/maximized flags and their drag
 * offset — same split every other desk script uses (`chromeVisibility.ts`'s
 * own `reduceChromeVisibility`, `deskWindowDragMath.ts`): pure decisions
 * here, DOM/`postMessage` glue in `deskWindowManager.ts`.
 *
 * IDENTITY: a window's `id` is also its dedupe key —
 * {@link classifyWindowRoute} derives it structurally from a same-origin
 * pathname, so two links to the SAME activity (a community card and a tray
 * chip, say) always resolve to the identical id and therefore the same
 * window, and `community`/`create` are deliberately constant ids (single-
 * instance windows: opening either with a different query just updates the
 * existing window's `href` and focuses it, never duplicates it).
 */

export type DeskWindowKind = 'activity' | 'editor' | 'community' | 'create';

export interface WindowRouteMatch {
  kind: DeskWindowKind;
  /** The dedupe key — `activity:<id>` / `editor:<id>` / the constant `'community'` / `'create'`. */
  id: string;
  /** Only present for `'activity'`/`'editor'` — the activity id itself. */
  activityId?: string;
}

/**
 * Pure: does `pathname` belong to one of the four window routes, and if so
 * which window identity does it resolve to? `null` for anything else
 * (`/presentar`, `/imprimir`, the hub itself, any unrelated route) — those
 * are deliberately never window-manager targets (see their own callers:
 * presentation/print links stay `target="_top"`).
 *
 * Structural only, same "shape, not permission" posture as
 * `@lib/access#isPublicActivityRoute` — this never checks whether the lang
 * segment is valid or whether the id actually exists; the route itself still
 * 404s normally once the window's iframe actually loads it.
 *
 * @param pathname - A same-origin path, e.g. `/es/ingles/actividades/abc123`.
 */
export function classifyWindowRoute(pathname: string): WindowRouteMatch | null {
  const segments = pathname.split('/').filter((segment) => segment.length > 0);

  // segments[0] is always the lang prefix — never inspected here, same as
  // `@lib/access#requiresLogin`'s own posture (shape only).
  if (segments.length === 2 && segments[1] === 'crear') {
    return { kind: 'create', id: 'create' };
  }
  if (segments.length === 3 && segments[1] === 'crear' && segments[2].length > 0) {
    return { kind: 'editor', id: `editor:${segments[2]}`, activityId: segments[2] };
  }
  if (segments.length === 3 && segments[1] === 'ingles' && segments[2] === 'actividades') {
    return { kind: 'community', id: 'community' };
  }
  if (segments.length === 4 && segments[1] === 'ingles' && segments[2] === 'actividades' && segments[3].length > 0) {
    return { kind: 'activity', id: `activity:${segments[3]}`, activityId: segments[3] };
  }
  return null;
}

/** An in-memory drag/cascade offset — same shape as `@lib/deskWindowDragMath#Offset`, kept separate (this module has no DOM/storage dependency at all). */
export interface DeskWindowOffset {
  x: number;
  y: number;
}

export interface DeskWindowEntry {
  id: string;
  kind: DeskWindowKind;
  /** The real route URL (path + query), WITHOUT `?ventana=1` — history/the tray/the title bar all read this. */
  href: string;
  title: string;
  minimized: boolean;
  maximized: boolean;
  /** Cascade/drag offset from the window's own default geometry — see `deskWindowManager.ts`'s own clamp. */
  offset: DeskWindowOffset;
  /** Stacking order — strictly higher paints in front. Never reused/compacted (see {@link reduceDeskWindows}'s own `nextZ`), so comparing two windows' `z` is always a safe "which opened/was-focused more recently" check. */
  z: number;
}

export interface DeskWindowsState {
  windows: readonly DeskWindowEntry[];
  /** The `z` the NEXT focused/opened window receives, then incremented — a monotonic counter, never decremented, so stacking order is stable even after windows close. */
  nextZ: number;
}

export const CASCADE_STEP_PX = 28;

export const initialDeskWindowsState: DeskWindowsState = { windows: [], nextZ: 1 };

export type DeskWindowEvent =
  | { type: 'open'; id: string; kind: DeskWindowKind; href: string; title: string }
  | { type: 'close'; id: string }
  | { type: 'minimize'; id: string }
  | { type: 'restore'; id: string }
  | { type: 'focus'; id: string }
  | { type: 'maximizeToggle'; id: string }
  | { type: 'move'; id: string; offset: DeskWindowOffset }
  | { type: 'title'; id: string; title: string }
  /** An in-window navigation (filters, pagination, search, create -> editor) — same window, new real URL/title. */
  | { type: 'navigate'; id: string; href: string; title?: string };

function findWindow(state: DeskWindowsState, id: string): DeskWindowEntry | undefined {
  return state.windows.find((w) => w.id === id);
}

function replaceWindow(state: DeskWindowsState, id: string, patch: Partial<DeskWindowEntry>): DeskWindowsState {
  return { ...state, windows: state.windows.map((w) => (w.id === id ? { ...w, ...patch } : w)) };
}

/** The topmost window by `z`, regardless of minimized state — the cascade's own anchor. `null` when nothing is open yet. */
function topmostWindow(state: DeskWindowsState): DeskWindowEntry | null {
  return state.windows.reduce<DeskWindowEntry | null>((top, w) => (!top || w.z > top.z ? w : top), null);
}

/**
 * The reducer — one event in, the next state out. Mirrors
 * `@lib/chromeVisibility#reduceChromeVisibility`'s own split: every decision
 * lives here, fully unit-testable with no DOM at all.
 */
export function reduceDeskWindows(state: DeskWindowsState, event: DeskWindowEvent): DeskWindowsState {
  switch (event.type) {
    case 'open': {
      const existing = findWindow(state, event.id);
      if (existing) {
        // Single-instance windows (community/create) and reopening an
        // already-open activity/editor window alike: update to the fresh
        // href/title (a different filter/query, or simply the same one) and
        // bring it to front, restoring it if it was minimized — "opening an
        // existing window focuses/restores it instead of duplicating" (owner
        // spec).
        return {
          ...replaceWindow(state, event.id, { href: event.href, title: event.title, minimized: false, z: state.nextZ }),
          nextZ: state.nextZ + 1,
        };
      }

      const top = topmostWindow(state);
      const offset: DeskWindowOffset = top
        ? { x: top.offset.x + CASCADE_STEP_PX, y: top.offset.y + CASCADE_STEP_PX }
        : { x: 0, y: 0 };

      const entry: DeskWindowEntry = {
        id: event.id,
        kind: event.kind,
        href: event.href,
        title: event.title,
        minimized: false,
        maximized: false,
        offset,
        z: state.nextZ,
      };
      return { windows: [...state.windows, entry], nextZ: state.nextZ + 1 };
    }

    case 'close':
      return { ...state, windows: state.windows.filter((w) => w.id !== event.id) };

    case 'minimize':
      return replaceWindow(state, event.id, { minimized: true });

    case 'restore':
      if (!findWindow(state, event.id)) return state;
      return { ...replaceWindow(state, event.id, { minimized: false, z: state.nextZ }), nextZ: state.nextZ + 1 };

    case 'focus': {
      const existing = findWindow(state, event.id);
      if (!existing || existing.minimized) return state;
      // No-op (no `z`/`nextZ` churn) when already topmost — keeps repeated
      // pointerdowns on an already-focused window from inflating `nextZ` for
      // no observable change.
      const top = topmostWindow(state);
      if (top && top.id === event.id) return state;
      return { ...replaceWindow(state, event.id, { z: state.nextZ }), nextZ: state.nextZ + 1 };
    }

    case 'maximizeToggle': {
      const existing = findWindow(state, event.id);
      if (!existing) return state;
      return {
        ...replaceWindow(state, event.id, { maximized: !existing.maximized, minimized: false, z: state.nextZ }),
        nextZ: state.nextZ + 1,
      };
    }

    case 'move':
      return replaceWindow(state, event.id, { offset: event.offset });

    case 'title':
      return replaceWindow(state, event.id, { title: event.title });

    case 'navigate': {
      const existing = findWindow(state, event.id);
      if (!existing) return state;
      return replaceWindow(state, event.id, { href: event.href, title: event.title ?? existing.title });
    }

    default:
      return state;
  }
}

/** The focused window — the non-minimized window with the highest `z`, or `null` when every window is minimized (or none are open). Drives `data-window-inactive` on every OTHER window and the active traffic-light styling. */
export function activeWindowId(state: DeskWindowsState): string | null {
  let active: DeskWindowEntry | null = null;
  for (const w of state.windows) {
    if (w.minimized) continue;
    if (!active || w.z > active.z) active = w;
  }
  return active?.id ?? null;
}

export function isWindowActive(state: DeskWindowsState, id: string): boolean {
  return activeWindowId(state) === id;
}

export function visibleWindows(state: DeskWindowsState): DeskWindowEntry[] {
  return state.windows.filter((w) => !w.minimized);
}

export function minimizedWindowsOf(state: DeskWindowsState): DeskWindowEntry[] {
  return state.windows.filter((w) => w.minimized);
}

/**
 * Restore-after-reload + the 8-window cap (robustness pass, owner spec):
 * at most this many windows open at once, restored or freshly opened alike.
 * Opening past it never silently grows the desk forever — the HOST
 * (`deskWindowManager.ts#openWindow`) tries to evict the OLDEST minimized
 * window first ({@link minimizedWindowsOldestFirst}), and shows a calm
 * notice instead of opening when none can close.
 */
export const MAX_DESK_WINDOWS = 8;

/** Minimized windows, OLDEST-minimized/reopened first (lowest `z` first) — the eviction order {@link MAX_DESK_WINDOWS}'s own cap tries, one at a time, before giving up and showing a notice. */
export function minimizedWindowsOldestFirst(state: DeskWindowsState): DeskWindowEntry[] {
  return minimizedWindowsOf(state)
    .slice()
    .sort((a, b) => a.z - b.z);
}
