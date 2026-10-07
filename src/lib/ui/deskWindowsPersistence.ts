/**
 * deskWindowsPersistence — restore-after-reload for the window manager
 * (robustness pass, owner spec: windows should come back after a plain
 * reload AND after returning from "Presentar"/"Imprimir", which escape the
 * iframe with `target="_top"` and therefore tear down the host page's own
 * in-memory `DeskWindowsState` entirely).
 *
 * Persists the FULL window list — href, geometry (offset), z, minimized/
 * maximized, `nextZ` — to `sessionStorage`. Deliberately a SEPARATE key from
 * `minimizedWindows.ts`'s own tray persistence: that module remembers a
 * short list of "chips to reopen" for the EMBEDDED/guest single-window model
 * (each chip is just a URL, reopened one at a time, fresh); this one
 * reconstructs the manager's own LIVE iframes wholesale on mount, geometry
 * and all.
 *
 * Split the same way every other desk module is (`minimizedWindows.ts`'s own
 * header): pure parse/serialize here, fully unit-testable with no DOM/
 * Storage dependency at all, plus thin `try`/`catch`-guarded Storage read/
 * write wrappers alongside them.
 */
import {
  MAX_DESK_WINDOWS,
  type DeskWindowEntry,
  type DeskWindowKind,
  type DeskWindowOffset,
  type DeskWindowsState,
} from '../deskWindowsState';

export const DESK_WINDOWS_STORAGE_KEY = 'ingles-desk-windows';

const VALID_KINDS: readonly DeskWindowKind[] = ['activity', 'editor', 'community', 'create'];

function isDeskWindowOffset(value: unknown): value is DeskWindowOffset {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.x === 'number' && typeof v.y === 'number';
}

function isDeskWindowEntry(value: unknown): value is DeskWindowEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    v.id.length > 0 &&
    typeof v.kind === 'string' &&
    (VALID_KINDS as readonly string[]).includes(v.kind) &&
    typeof v.href === 'string' &&
    typeof v.title === 'string' &&
    typeof v.minimized === 'boolean' &&
    typeof v.maximized === 'boolean' &&
    isDeskWindowOffset(v.offset) &&
    typeof v.z === 'number'
  );
}

/**
 * Pure: parse whatever `sessionStorage` returned. Anything malformed
 * (corrupted JSON, a non-object, a missing/invalid field on any one entry)
 * degrades to `null` — same "never worth a hard failure" posture as
 * `minimizedWindows.ts#parseMinimizedWindows` — so a restored session with
 * bad data is indistinguishable from a first visit, never a crash.
 *
 * Defensively re-clamped to {@link MAX_DESK_WINDOWS}, keeping the
 * HIGHEST-`z` (most recently used/focused) entries, even though the writer
 * (`writePersistedDeskWindows`) never itself persists more than that many —
 * this is the one read-side guard against a hand-edited or otherwise
 * tampered-with `sessionStorage` value.
 */
export function parsePersistedDeskWindows(raw: string | null): DeskWindowsState | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const v = parsed as Record<string, unknown>;
    if (!Array.isArray(v.windows) || typeof v.nextZ !== 'number') return null;

    const windows = v.windows.filter(isDeskWindowEntry);
    if (windows.length === 0) return null;

    const capped =
      windows.length <= MAX_DESK_WINDOWS
        ? windows
        : windows
            .slice()
            .sort((a, b) => b.z - a.z)
            .slice(0, MAX_DESK_WINDOWS);

    return { windows: capped, nextZ: v.nextZ };
  } catch {
    return null;
  }
}

/** Pure: the JSON to persist for `state`. */
export function serializePersistedDeskWindows(state: DeskWindowsState): string {
  return JSON.stringify({ windows: state.windows, nextZ: state.nextZ });
}

/** Read, `try`/`catch`-guarded (private browsing, quota, disabled storage). */
export function readPersistedDeskWindows(
  storage: Pick<Storage, 'getItem'> = sessionStorage,
): DeskWindowsState | null {
  try {
    return parsePersistedDeskWindows(storage.getItem(DESK_WINDOWS_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Persist, `try`/`catch`-guarded. */
export function writePersistedDeskWindows(
  state: DeskWindowsState,
  storage: Pick<Storage, 'setItem'> = sessionStorage,
): void {
  try {
    storage.setItem(DESK_WINDOWS_STORAGE_KEY, serializePersistedDeskWindows(state));
  } catch {
    // Best-effort — a visitor who blocks storage just loses restore-after-reload for this session.
  }
}
