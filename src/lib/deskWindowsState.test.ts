import { describe, it, expect } from 'vitest';
import {
  classifyWindowRoute,
  reduceDeskWindows,
  activeWindowId,
  isWindowActive,
  visibleWindows,
  minimizedWindowsOf,
  minimizedWindowsOldestFirst,
  initialDeskWindowsState,
  CASCADE_STEP_PX,
  MAX_DESK_WINDOWS,
  type DeskWindowsState,
} from './deskWindowsState';

describe('classifyWindowRoute', () => {
  it('matches the community catalog, ignoring query/filters', () => {
    expect(classifyWindowRoute('/es/ingles/actividades')).toEqual({ kind: 'community', id: 'community' });
  });

  it('matches an activity practice page', () => {
    expect(classifyWindowRoute('/es/ingles/actividades/abc123')).toEqual({
      kind: 'activity',
      id: 'activity:abc123',
      activityId: 'abc123',
    });
  });

  it('matches the create picker', () => {
    expect(classifyWindowRoute('/en/crear')).toEqual({ kind: 'create', id: 'create' });
  });

  it('matches the editor', () => {
    expect(classifyWindowRoute('/en/crear/xyz9')).toEqual({ kind: 'editor', id: 'editor:xyz9', activityId: 'xyz9' });
  });

  it('does not match presentar/imprimir (target=_top routes)', () => {
    expect(classifyWindowRoute('/es/ingles/actividades/abc123/presentar')).toBeNull();
    expect(classifyWindowRoute('/es/ingles/actividades/abc123/imprimir')).toBeNull();
  });

  it('does not match the hub or an unrelated route', () => {
    expect(classifyWindowRoute('/es/ingles')).toBeNull();
    expect(classifyWindowRoute('/es/libros')).toBeNull();
  });
});

function open(state: DeskWindowsState, id: string, kind: 'activity' | 'editor' | 'community' | 'create', href = `/${id}`, title = id) {
  return reduceDeskWindows(state, { type: 'open', id, kind, href, title });
}

describe('reduceDeskWindows', () => {
  it('opens a first window at offset {0,0}, focused', () => {
    const state = open(initialDeskWindowsState, 'community', 'community');
    expect(state.windows).toHaveLength(1);
    expect(state.windows[0].offset).toEqual({ x: 0, y: 0 });
    expect(activeWindowId(state)).toBe('community');
  });

  it('cascades a second window +28/+28 from the topmost one', () => {
    let state = open(initialDeskWindowsState, 'community', 'community');
    state = open(state, 'activity:1', 'activity');
    const second = state.windows.find((w) => w.id === 'activity:1')!;
    expect(second.offset).toEqual({ x: CASCADE_STEP_PX, y: CASCADE_STEP_PX });
  });

  it('cascades from the topmost window, not insertion order', () => {
    let state = open(initialDeskWindowsState, 'community', 'community');
    state = open(state, 'activity:1', 'activity');
    // Bring community back to front before opening a third window.
    state = reduceDeskWindows(state, { type: 'focus', id: 'community' });
    state = open(state, 'activity:2', 'activity');
    const third = state.windows.find((w) => w.id === 'activity:2')!;
    expect(third.offset).toEqual({ x: CASCADE_STEP_PX, y: CASCADE_STEP_PX });
  });

  it('dedupes: opening an already-open id updates href/title and focuses instead of duplicating', () => {
    let state = open(initialDeskWindowsState, 'community', 'community', '/community?nivel=A1', 'Comunidad');
    state = open(state, 'activity:1', 'activity');
    state = reduceDeskWindows(state, {
      type: 'open',
      id: 'community',
      kind: 'community',
      href: '/community?nivel=A2',
      title: 'Comunidad',
    });
    expect(state.windows).toHaveLength(2);
    const community = state.windows.find((w) => w.id === 'community')!;
    expect(community.href).toBe('/community?nivel=A2');
    expect(activeWindowId(state)).toBe('community');
  });

  it('reopening a minimized window via open() restores it', () => {
    let state = open(initialDeskWindowsState, 'community', 'community');
    state = reduceDeskWindows(state, { type: 'minimize', id: 'community' });
    expect(minimizedWindowsOf(state)).toHaveLength(1);
    state = open(state, 'community', 'community');
    expect(minimizedWindowsOf(state)).toHaveLength(0);
    expect(activeWindowId(state)).toBe('community');
  });

  it('focus brings a background window to front and demotes the previous one', () => {
    let state = open(initialDeskWindowsState, 'community', 'community');
    state = open(state, 'activity:1', 'activity');
    expect(activeWindowId(state)).toBe('activity:1');
    state = reduceDeskWindows(state, { type: 'focus', id: 'community' });
    expect(activeWindowId(state)).toBe('community');
    expect(isWindowActive(state, 'activity:1')).toBe(false);
  });

  it('focus is a no-op (no nextZ churn) when already topmost', () => {
    let state = open(initialDeskWindowsState, 'community', 'community');
    const before = state.nextZ;
    state = reduceDeskWindows(state, { type: 'focus', id: 'community' });
    expect(state.nextZ).toBe(before);
  });

  it('minimize removes a window from activeWindowId without closing it', () => {
    let state = open(initialDeskWindowsState, 'community', 'community');
    state = reduceDeskWindows(state, { type: 'minimize', id: 'community' });
    expect(state.windows).toHaveLength(1);
    expect(activeWindowId(state)).toBeNull();
    expect(visibleWindows(state)).toHaveLength(0);
  });

  it('minimizing the active window promotes the next-highest visible window', () => {
    let state = open(initialDeskWindowsState, 'community', 'community');
    state = open(state, 'activity:1', 'activity');
    state = reduceDeskWindows(state, { type: 'minimize', id: 'activity:1' });
    expect(activeWindowId(state)).toBe('community');
  });

  it('restore un-minimizes and focuses', () => {
    let state = open(initialDeskWindowsState, 'community', 'community');
    state = open(state, 'activity:1', 'activity');
    state = reduceDeskWindows(state, { type: 'minimize', id: 'activity:1' });
    state = reduceDeskWindows(state, { type: 'restore', id: 'activity:1' });
    expect(activeWindowId(state)).toBe('activity:1');
  });

  it('close removes the window entirely', () => {
    let state = open(initialDeskWindowsState, 'community', 'community');
    state = reduceDeskWindows(state, { type: 'close', id: 'community' });
    expect(state.windows).toHaveLength(0);
  });

  it('maximizeToggle toggles maximized and focuses', () => {
    let state = open(initialDeskWindowsState, 'community', 'community');
    state = open(state, 'activity:1', 'activity');
    state = reduceDeskWindows(state, { type: 'maximizeToggle', id: 'community' });
    const community = state.windows.find((w) => w.id === 'community')!;
    expect(community.maximized).toBe(true);
    expect(activeWindowId(state)).toBe('community');
    state = reduceDeskWindows(state, { type: 'maximizeToggle', id: 'community' });
    expect(state.windows.find((w) => w.id === 'community')!.maximized).toBe(false);
  });

  it('move sets the offset directly (drag)', () => {
    let state = open(initialDeskWindowsState, 'community', 'community');
    state = reduceDeskWindows(state, { type: 'move', id: 'community', offset: { x: 50, y: -10 } });
    expect(state.windows[0].offset).toEqual({ x: 50, y: -10 });
  });

  it('title updates the window title (editor autosave/portal title sync)', () => {
    let state = open(initialDeskWindowsState, 'editor:1', 'editor', '/crear/1', 'Nueva actividad');
    state = reduceDeskWindows(state, { type: 'title', id: 'editor:1', title: 'Present Simple' });
    expect(state.windows[0].title).toBe('Present Simple');
  });

  it('navigate updates href (and optionally title) for an in-window navigation', () => {
    let state = open(initialDeskWindowsState, 'community', 'community', '/community', 'Comunidad');
    state = reduceDeskWindows(state, { type: 'navigate', id: 'community', href: '/community?page=2' });
    expect(state.windows[0].href).toBe('/community?page=2');
    expect(state.windows[0].title).toBe('Comunidad');
  });

  it('events targeting an unknown id are no-ops', () => {
    const state = open(initialDeskWindowsState, 'community', 'community');
    expect(reduceDeskWindows(state, { type: 'focus', id: 'nope' })).toBe(state);
    expect(reduceDeskWindows(state, { type: 'restore', id: 'nope' })).toBe(state);
    expect(reduceDeskWindows(state, { type: 'maximizeToggle', id: 'nope' })).toBe(state);
    expect(reduceDeskWindows(state, { type: 'navigate', id: 'nope', href: '/x' })).toBe(state);
  });
});

// Robustness pass (owner spec): the 8-window cap's own eviction order —
// `deskWindowManager.ts#openAtCapacity` tries these, oldest-minimized first,
// before giving up and showing a notice.
describe('minimizedWindowsOldestFirst', () => {
  it('is empty when nothing is minimized', () => {
    const state = open(initialDeskWindowsState, 'community', 'community');
    expect(minimizedWindowsOldestFirst(state)).toEqual([]);
  });

  it('orders minimized windows oldest (lowest z) first, ignoring visible ones', () => {
    let state = open(initialDeskWindowsState, 'community', 'community');
    state = open(state, 'activity:1', 'activity');
    state = open(state, 'activity:2', 'activity');
    // Minimize in a DIFFERENT order than they were opened, so this proves
    // the sort is by `z` (recency), not array/insertion order.
    state = reduceDeskWindows(state, { type: 'minimize', id: 'activity:2' });
    state = reduceDeskWindows(state, { type: 'minimize', id: 'community' });

    const ordered = minimizedWindowsOldestFirst(state);
    expect(ordered.map((w) => w.id)).toEqual(['community', 'activity:2']);
    // `activity:1` stayed visible — never a candidate at all.
    expect(ordered.some((w) => w.id === 'activity:1')).toBe(false);
  });

  it('moving a minimized window back to front (reopen, then re-minimize) re-ages it to the back of the eviction order', () => {
    let state = open(initialDeskWindowsState, 'community', 'community');
    state = open(state, 'activity:1', 'activity');
    state = reduceDeskWindows(state, { type: 'minimize', id: 'community' });
    state = reduceDeskWindows(state, { type: 'minimize', id: 'activity:1' });
    expect(minimizedWindowsOldestFirst(state).map((w) => w.id)).toEqual(['community', 'activity:1']);

    // Reopen + re-minimize "community" — it is now the MOST recently
    // touched, so it should evict LAST, not first.
    state = open(state, 'community', 'community');
    state = reduceDeskWindows(state, { type: 'minimize', id: 'community' });
    expect(minimizedWindowsOldestFirst(state).map((w) => w.id)).toEqual(['activity:1', 'community']);
  });
});

describe('MAX_DESK_WINDOWS', () => {
  it('is 8 (owner spec)', () => {
    expect(MAX_DESK_WINDOWS).toBe(8);
  });
});
