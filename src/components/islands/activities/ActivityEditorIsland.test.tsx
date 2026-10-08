// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import ActivityEditorIsland from './ActivityEditorIsland';
import type { WorksheetBlock } from '@/lib/activities/blocks';

const pipelineMocks = vi.hoisted(() => ({
  routeFileType: vi.fn(),
  convertImageToWebp: vi.fn(),
  validatePageSelection: vi.fn(),
  openPdfForConversion: vi.fn(),
  renderPdfThumbnails: vi.fn(),
}));
vi.mock('@/lib/activities/imagePipeline', async () => {
  const actual = await vi.importActual<typeof import('@/lib/activities/imagePipeline')>(
    '@/lib/activities/imagePipeline',
  );
  return {
    ...actual,
    routeFileType: pipelineMocks.routeFileType,
    convertImageToWebp: pipelineMocks.convertImageToWebp,
    validatePageSelection: pipelineMocks.validatePageSelection,
    openPdfForConversion: pipelineMocks.openPdfForConversion,
    renderPdfThumbnails: pipelineMocks.renderPdfThumbnails,
  };
});

// Several PDF pages stitch into ONE sheet now (one-sheet redesign) — real
// `<canvas>`/`createImageBitmap` work is "manual check only" (see
// `sheetStitcher.ts`'s own header), mocked here the same way
// `WorksheetUploader.test.tsx` does.
const stitcherMocks = vi.hoisted(() => ({
  stitchSourcesWithinSizeLimit: vi.fn(),
}));
vi.mock('@/lib/activities/sheetStitcher', async () => {
  const actual = await vi.importActual<typeof import('@/lib/activities/sheetStitcher')>(
    '@/lib/activities/sheetStitcher',
  );
  return {
    ...actual,
    stitchSourcesWithinSizeLimit: stitcherMocks.stitchSourcesWithinSizeLimit,
  };
});
if (typeof (globalThis as { createImageBitmap?: unknown }).createImageBitmap !== 'function') {
  (globalThis as unknown as { createImageBitmap: (source: Blob) => Promise<ImageBitmap> }).createImageBitmap = () =>
    Promise.resolve({ width: 100, height: 100, close: () => {} } as unknown as ImageBitmap);
}

const realLocation = window.location;

beforeEach(() => {
  // The navigation-guard tests below (`handleLeaveWithoutSaving`/
  // `handleSaveAndLeave`) really do assign `window.location.href` on
  // success, same as a real "leave this page" would — jsdom refuses to
  // redefine any property of the real `Location` object (it throws
  // "Cannot redefine property", by design, mirroring a real browser's
  // cross-origin protections) AND has no real navigation implementation
  // either way, so an un-stubbed assignment logs `Error: Not implemented:
  // navigation (except hash changes)` even though every one of those tests
  // already passes (nothing here asserts on `location.href`'s resulting
  // value). `window.location` ITSELF (unlike its own properties) is a
  // plain, configurable accessor on `window` — swapping in a `URL`, which
  // reparses on a `.href`/`.hash` write instead of trying to navigate, is
  // the standard jsdom workaround for this. Reads (origin/pathname/search)
  // stay correct: this app's jsdom URL is fixed for the whole run, and real
  // navigation never actually completes today either way.
  const stubbedLocation = Object.assign(new URL(realLocation.href), {
    assign: vi.fn(),
    replace: vi.fn(),
    reload: vi.fn(),
    ancestorOrigins: realLocation.ancestorOrigins,
  }) as unknown as Location;
  delete (window as unknown as { location?: unknown }).location;
  // Cast through `window`, not the value: `lib.dom.d.ts` types
  // `Window.location`'s setter as `string & Location` (it also accepts a
  // bare string, shorthand for navigating there), which a `Location`-shaped
  // object alone never satisfies.
  (window as unknown as { location: Location }).location = stubbedLocation;

  // "Desktop" redesign PART 6b (+ its own polish pass): the editor now
  // ALWAYS renders inside `DeskWindow`, whose title bar provides these four
  // DOM nodes — the (now visually-hidden, `aria-labelledby`-only) title
  // span, the autosave status span, the EDITABLE title/level/status-badge
  // group `ActivityEditorIsland` itself `createPortal`s its real controlled
  // `<input>`/`<Select>`/badge into (`DESK_WINDOW_TITLE_GROUP_ID`'s own doc
  // there), and the `actions` slot ("Ver como presentación"/"Enviar a
  // revisión", `DESK_WINDOW_ACTIONS_ID`). A standalone render of just this
  // island has no `DeskWindow` shell around it, so the tests build the same
  // four stand-in nodes by hand.
  document.body.insertAdjacentHTML(
    'beforeend',
    '<span id="desk-window-title"></span><div id="desk-window-title-group"></div><div id="desk-window-actions"></div>',
  );

  vi.spyOn(globalThis, 'createImageBitmap').mockResolvedValue(
    { width: 100, height: 100, close: () => {} } as unknown as ImageBitmap,
  );
  stitcherMocks.stitchSourcesWithinSizeLimit.mockResolvedValue(new Blob(['stitched']));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (window as unknown as { location?: unknown }).location;
  (window as unknown as { location: Location }).location = realLocation;
  // A handful of "one active block on entry" tests set this to exercise
  // hash-targeting — reset unconditionally so a later test never inherits a
  // leftover hash, even if one of those failed before its own cleanup line.
  window.location.hash = '';
  // Every test below reuses the same default `activityId` ("act-1") — the
  // active-block `sessionStorage` key must never leak from one test into
  // the next (same reasoning as the hash reset above).
  sessionStorage.clear();
  document.getElementById('desk-window-title')?.remove();
  document.getElementById('desk-window-title-group')?.remove();
  document.getElementById('desk-window-actions')?.remove();
});

const WORKSHEET_BLOCK: WorksheetBlock = {
  id: 'b1',
  type: 'worksheet',
  rotation: 0,
  image: { path: 'activity-uploads/u1/b1.webp', width: 800, height: 600 },
  zones: [],
};

const WORKSHEET_BLOCK_WITH_ZONE: WorksheetBlock = {
  ...WORKSHEET_BLOCK,
  zones: [{ id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: ['x'] }],
};

/** A DOMRect-shaped mock — same helper as `WorksheetZoneEditor.test.tsx`'s own. */
function mockRect(el: Element, box: { left?: number; top?: number; width: number; height: number }) {
  const left = box.left ?? 0;
  const top = box.top ?? 0;
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    left,
    top,
    width: box.width,
    height: box.height,
    right: left + box.width,
    bottom: top + box.height,
    x: left,
    y: top,
    toJSON() {
      return {};
    },
  });
}

/**
 * A real same-origin `<a>`, appended to `document.body` and clickable via
 * `fireEvent.click` — what the navigation-guard tests below need to prove
 * the component's own `click`/`preventDefault` wiring, without jsdom's
 * `Error: Not implemented: navigation (except hash changes)` (jsdom has no
 * real navigation; clicking an un-prevented same-origin link makes it try
 * anyway, and later log the failure — see https://github.com/jsdom/jsdom/issues/2112).
 *
 * The extra listener is a SAFETY NET, not a second assertion: it runs at the
 * link itself, which only fires AFTER the component's own `document`-level
 * CAPTURING listener already decided whether to call `preventDefault()` —
 * so it never changes `event.defaultPrevented`/`fireEvent.click`'s return
 * value for a click the component already prevented, only for one it (by
 * design) lets through, which none of these tests assert the outcome of.
 */
function createInternalLink(href = '/es/libros'): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = href;
  link.addEventListener('click', (e) => e.preventDefault());
  document.body.appendChild(link);
  return link;
}

/**
 * Dispatches a hand-built native pointer event through React's real event
 * system — jsdom has no `PointerEvent` constructor, so `fireEvent.pointerX`
 * drops `clientX`/`clientY`; same posture as `WorksheetZoneEditor.test.tsx`'s
 * own `firePointer`.
 */
function firePointer(
  el: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  clientX: number,
  clientY: number,
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { clientX, clientY, pointerId: 1, button: 0 });
  act(() => {
    el.dispatchEvent(event);
  });
}

function renderEditor(overrides: Partial<Parameters<typeof ActivityEditorIsland>[0]> = {}) {
  return render(
    <ActivityEditorIsland
      lang="es"
      activityId="act-1"
      initialTitle="Sin título"
      initialLevel={null}
      initialBlocks={[]}
      {...overrides}
    />,
  );
}

describe('ActivityEditorIsland — initial render', () => {
  it('renders the title, level and a clean save status', () => {
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK] });
    expect((screen.getByTestId('activity-title-input') as HTMLInputElement).value).toBe('Sin título');
    expect(screen.getByTestId('save-status').getAttribute('data-status')).toBe('saved');
  });

  // Empty activity (creator polish round 4, owner feedback #3): the two
  // type cards render immediately, no "+" click needed first — the
  // mobile-only text button is hidden in that state instead (`ActivityEditorIsland.tsx`'s
  // own `showAddFlow`).
  it('shows the empty-blocks state and the type picker immediately, with no add-block button', () => {
    renderEditor();
    expect(screen.getByTestId('blocks-empty')).toBeTruthy();
    expect(screen.getByTestId('block-type-picker')).toBeTruthy();
    expect(screen.queryByTestId('add-block-button')).toBeNull();
  });
});

describe('ActivityEditorIsland — one active block on entry (owner decision 2026-10-07, "Barra fina debajo")', () => {
  it('activates the first block automatically, with no click needed', () => {
    const b2: WorksheetBlock = { ...WORKSHEET_BLOCK, id: 'b2' };
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK, b2] });
    expect(screen.getByTestId('block-b1').querySelector('[data-testid="worksheet-zone-editor"]')).toBeTruthy();
    expect(screen.queryByTestId('block-b2')).toBeNull();
  });

  it('shows a brand-new (imageless) sole block\'s own upload drop zone immediately, active', () => {
    const emptyWorksheet: WorksheetBlock = { ...WORKSHEET_BLOCK, image: undefined, zones: [] };
    renderEditor({ initialBlocks: [emptyWorksheet] });
    expect(screen.getByTestId('worksheet-uploader')).toBeTruthy();
  });

  it('wires the Audio tool ("colocar un audio propio") on a worksheet block', () => {
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK] });
    expect(screen.getByTestId('tool-audio')).toBeTruthy();
  });

  it('still shows the empty-blocks state (no block to activate) for a brand-new, zero-block activity', () => {
    renderEditor({ initialBlocks: [] });
    expect(screen.getByTestId('blocks-empty')).toBeTruthy();
    expect(screen.queryByTestId('worksheet-zone-editor')).toBeNull();
  });

  it('activates the block the URL hash targets instead of the first one', () => {
    window.location.hash = '#block-b2';
    const b2: WorksheetBlock = { ...WORKSHEET_BLOCK, id: 'b2' };
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK, b2] });
    expect(screen.queryByTestId('block-b1')).toBeNull();
    expect(screen.getByTestId('block-b2').querySelector('[data-testid="worksheet-zone-editor"]')).toBeTruthy();
    window.location.hash = '';
  });

  it('falls back to the first block when the hash targets an unknown block id', () => {
    window.location.hash = '#block-does-not-exist';
    const b2: WorksheetBlock = { ...WORKSHEET_BLOCK, id: 'b2' };
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK, b2] });
    expect(screen.getByTestId('block-b1').querySelector('[data-testid="worksheet-zone-editor"]')).toBeTruthy();
    window.location.hash = '';
  });

  it('resumes the last active block remembered for this activity, from sessionStorage', () => {
    sessionStorage.setItem('chuyocode:editor-active-block:act-1', 'b2');
    const b2: WorksheetBlock = { ...WORKSHEET_BLOCK, id: 'b2' };
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK, b2] });
    expect(screen.queryByTestId('block-b1')).toBeNull();
    expect(screen.getByTestId('block-b2')).toBeTruthy();
  });

  it('ignores a remembered block id that no longer exists on this activity', () => {
    sessionStorage.setItem('chuyocode:editor-active-block:act-1', 'gone');
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK] });
    expect(screen.getByTestId('block-b1')).toBeTruthy();
  });

  it('remembers the active block across a remount of the same activity', () => {
    const b2: WorksheetBlock = { ...WORKSHEET_BLOCK, id: 'b2' };
    const { unmount } = renderEditor({ initialBlocks: [WORKSHEET_BLOCK, b2] });
    fireEvent.click(screen.getByTestId('sheet-nav-next'));
    expect(screen.getByTestId('block-b2')).toBeTruthy();
    unmount();

    renderEditor({ initialBlocks: [WORKSHEET_BLOCK, b2] });
    expect(screen.queryByTestId('block-b1')).toBeNull();
    expect(screen.getByTestId('block-b2')).toBeTruthy();
  });
});

describe('ActivityEditorIsland — the window IS the frame (PART 6b polish, "double framing" fix)', () => {
  it('the card no longer carries its own border/rounded/bg-card — DeskWindow supplies the frame now', () => {
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK] });
    const card = screen.getByTestId('activity-editor-card');
    expect(card.className).not.toContain('border');
    expect(card.className).not.toContain('rounded-lg');
    expect(card.className).not.toContain('bg-card');
    expect(card.contains(screen.getByTestId('block-list'))).toBe(true);
  });

  it('the title/level/status-badge header row is gone from the card body — relocated into the title bar', () => {
    renderEditor();
    const card = screen.getByTestId('activity-editor-card');
    expect(card.contains(screen.getByTestId('activity-title-input'))).toBe(false);
    expect(card.contains(screen.getByTestId('activity-level-select'))).toBe(false);
    expect(card.contains(screen.getByTestId('activity-status-badge'))).toBe(false);
  });

  it('reserves safe-area-aware bottom room for the mobile bottom action bar, cleared at lg', () => {
    renderEditor();
    const root = screen.getByTestId('activity-editor-island');
    expect(root.className).toContain('env(safe-area-inset-bottom)');
    expect(root.className).toContain('lg:pb-0');
  });

  it('keeps the sticky side toolbar exactly outside/unaffected by the card, body-portaled and JS-synced to the window (not the card)', () => {
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK] });
    const card = screen.getByTestId('activity-editor-card');
    const toolbar = screen.getByTestId('editor-side-toolbar');
    expect(card.contains(toolbar)).toBe(false);
    // Dock pass: the rail is ALWAYS portaled straight to `document.body` now
    // (never nested under the card either way) — see `EditorSideToolbar.tsx`'s
    // own header for why.
    expect(toolbar.parentElement).toBe(document.body);
  });

  // Scroll bug fix (owner report: "se rompe el scroll y no deja llegar a la
  // parte superior", confirmed root cause with a real browser — this card
  // was the ancestor that actually absorbed the stray scroll offset, see
  // `QuizBlockEditor.test.tsx`'s own header): this card's own comment
  // already says it must "stay fully visible on screen" — `overflow-hidden`
  // let a descendant's `scrollIntoView()` still scroll it programmatically
  // despite that, with no visible scrollbar for a visitor to undo it with.
  // `overflow-clip` keeps the exact same visual clipping but can never be
  // scrolled.
  it('is overflow-clip, never overflow-hidden — it must stay fully visible, not scrollable', () => {
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK] });
    const card = screen.getByTestId('activity-editor-card');
    expect(card.className).toContain('overflow-clip');
    expect(card.className).not.toContain('overflow-hidden');
  });
});

// Polish pass 2026-10-06 (owner report, `editor-window-1440.png`): the
// "Elige con qué seguir" type picker — shown while `blocks.length === 0`,
// before any block exists — used to render WITH the floating side toolbar
// next to it, even though there is nothing yet for the sheet switcher/undo/
// redo to act on. The toolbar now only mounts once there is an editor with
// blocks.
describe('ActivityEditorIsland — no side toolbar while the empty-blocks picker is showing', () => {
  it('does not render the floating side toolbar for a brand-new, zero-block activity', () => {
    renderEditor({ initialBlocks: [] });
    expect(screen.getByTestId('block-type-picker')).toBeTruthy();
    expect(screen.queryByTestId('editor-side-toolbar')).toBeNull();
    expect(screen.queryByTestId('editor-side-toolbar-mobile')).toBeNull();
  });

  it('renders the floating side toolbar once the activity has at least one block', () => {
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK] });
    expect(screen.getByTestId('editor-side-toolbar')).toBeTruthy();
  });
});

describe('ActivityEditorIsland — window title bar: the EDITABLE title (PART 6b polish)', () => {
  it('portals the real controlled title input, level select and status badge into the title group slot', () => {
    renderEditor({ initialTitle: 'Mi actividad', initialLevel: 'B1' });
    const group = document.getElementById('desk-window-title-group')!;
    expect(group.contains(screen.getByTestId('activity-title-input'))).toBe(true);
    expect(group.contains(screen.getByTestId('activity-level-select'))).toBe(true);
    expect(group.contains(screen.getByTestId('activity-status-badge'))).toBe(true);
  });

  it('has "Nueva actividad" as its placeholder and an accessible label', () => {
    renderEditor({ initialTitle: '' });
    const input = screen.getByTestId('activity-title-input') as HTMLInputElement;
    expect(input.placeholder).toBe('Nueva actividad');
    expect(input.getAttribute('aria-label')).toBe('Título');
  });

  it('never throws, and simply renders no title group, when mounted without the DeskWindow shell', () => {
    document.getElementById('desk-window-title-group')?.remove();
    expect(() => renderEditor()).not.toThrow();
    expect(screen.queryByTestId('activity-level-select')).toBeNull();
  });
});

/** Stubs `useIsDesktop`'s own `matchMedia` query to report a narrow (mobile) viewport — same pattern `EditorSideToolbar.test.tsx`/`WorksheetZoneEditor.test.tsx` already use. */
function stubMobileViewport() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
}

describe('ActivityEditorIsland — mobile title bar "⋯" menu (bug fix, owner report: title truncated to "Hoj…" on a 390px phone)', () => {
  it('on desktop, shows no "⋯" trigger — the level select/status badge/actions stay inline exactly as before', () => {
    renderEditor();
    expect(screen.queryByTestId('activity-mobile-menu-trigger')).toBeNull();
    expect(screen.getByTestId('activity-level-select')).toBeTruthy();
  });

  it('on a phone, collapses the level select/status badge/"Ver como presentación"/"Enviar a revisión" behind one "⋯" trigger', () => {
    stubMobileViewport();
    renderEditor();
    expect(screen.getByTestId('activity-mobile-menu-trigger')).toBeTruthy();
    const menu = screen.getByTestId('activity-mobile-menu-content');
    expect(menu.contains(screen.getByTestId('activity-level-select'))).toBe(true);
    expect(menu.contains(screen.getByTestId('activity-status-badge'))).toBe(true);
    expect(menu.contains(screen.getByTestId('view-as-presentation-button'))).toBe(true);
    expect(menu.contains(screen.getByTestId('submit-for-review-button'))).toBe(true);
  });

  it('on a phone, the title-bar actions slot renders nothing of its own — those two actions moved into the "⋯" menu', () => {
    stubMobileViewport();
    renderEditor();
    const actionsSlot = document.getElementById('desk-window-actions');
    expect(actionsSlot?.children.length).toBe(0);
  });

  it('on a phone, the level select inside the menu still edits the same document', () => {
    stubMobileViewport();
    renderEditor({ initialLevel: 'A1' });
    fireEvent.change(screen.getByTestId('activity-level-select'), { target: { value: 'B1' } });
    expect((screen.getByTestId('activity-level-select') as HTMLSelectElement).value).toBe('B1');
  });

  it('on a phone, "Enviar a revisión" inside the menu still opens the submit dialog', () => {
    stubMobileViewport();
    renderEditor();
    fireEvent.click(screen.getByTestId('submit-for-review-button'));
    expect(screen.getByTestId('submit-for-review-dialog')).toBeTruthy();
  });
});

describe('ActivityEditorIsland — window title bar sync (PART 6b)', () => {
  it('mirrors the title into the window title bar, falling back to "Nueva actividad" when empty', () => {
    renderEditor({ initialTitle: 'Mi actividad' });
    expect(document.getElementById('desk-window-title')?.textContent).toBe('Mi actividad');

    fireEvent.change(screen.getByTestId('activity-title-input'), { target: { value: '' } });
    expect(document.getElementById('desk-window-title')?.textContent).toBe('Nueva actividad');
  });

  it('localizes the empty-title fallback to English', () => {
    renderEditor({ lang: 'en', initialTitle: '' });
    expect(document.getElementById('desk-window-title')?.textContent).toBe('New activity');
  });

  it('renders "Ver como presentación" and "Enviar a revisión" into the window title bar actions slot, not the header row', () => {
    renderEditor();
    const actionsSlot = document.getElementById('desk-window-actions');
    expect(actionsSlot?.contains(screen.getByTestId('view-as-presentation-button'))).toBe(true);
    expect(actionsSlot?.contains(screen.getByTestId('submit-for-review-button'))).toBe(true);
    expect(screen.getByTestId('activity-editor-card').contains(screen.getByTestId('submit-for-review-button'))).toBe(
      false,
    );
  });

  it('never throws, and simply renders no title-bar actions, when mounted without the DeskWindow shell', () => {
    document.getElementById('desk-window-actions')?.remove();
    expect(() => renderEditor()).not.toThrow();
    expect(screen.queryByTestId('submit-for-review-button')).toBeNull();
  });
});

describe('ActivityEditorIsland — EditorWindowGuard bridge (PART 6b)', () => {
  it('registers window.__inglesEditorWindowGuard on mount and removes it on unmount', () => {
    const { unmount } = renderEditor();
    const guard = (window as unknown as Record<string, unknown>)['__inglesEditorWindowGuard'] as
      | { isDirty: () => boolean }
      | undefined;
    expect(guard).toBeTruthy();
    expect(guard?.isDirty()).toBe(false);
    unmount();
    expect((window as unknown as Record<string, unknown>)['__inglesEditorWindowGuard']).toBeUndefined();
  });

  it('isDirty() reflects the same dirty state the save-status indicator shows', () => {
    renderEditor();
    const guard = (window as unknown as Record<string, unknown>)['__inglesEditorWindowGuard'] as {
      isDirty: () => boolean;
    };
    expect(guard.isDirty()).toBe(false);
    fireEvent.change(screen.getByTestId('activity-title-input'), { target: { value: 'x' } });
    expect(guard.isDirty()).toBe(true);
  });

  it('flush() silently saves the current document and resolves true on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    renderEditor();
    fireEvent.change(screen.getByTestId('activity-title-input'), { target: { value: 'x' } });

    const guard = (window as unknown as Record<string, unknown>)['__inglesEditorWindowGuard'] as {
      flush: () => Promise<boolean>;
    };
    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await guard.flush();
    });

    expect(resolved).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('/api/actividades/act-1/guardar', expect.objectContaining({ method: 'POST' }));
    expect(screen.queryByTestId('unsaved-changes-modal')).toBeNull(); // never the modal — minimize is silent
  });

  it('flush() resolves false (never throws) when the save fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    renderEditor();
    fireEvent.change(screen.getByTestId('activity-title-input'), { target: { value: 'x' } });

    const guard = (window as unknown as Record<string, unknown>)['__inglesEditorWindowGuard'] as {
      flush: () => Promise<boolean>;
    };
    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await guard.flush();
    });

    expect(resolved).toBe(false);
  });

  it('confirmClose() opens the SAME unsaved-changes modal, and maps each button to its own outcome', async () => {
    renderEditor();
    fireEvent.change(screen.getByTestId('activity-title-input'), { target: { value: 'x' } });

    const guard = (window as unknown as Record<string, unknown>)['__inglesEditorWindowGuard'] as {
      confirmClose: () => Promise<'saved' | 'discarded' | 'cancelled'>;
    };
    let pending!: Promise<'saved' | 'discarded' | 'cancelled'>;
    act(() => {
      pending = guard.confirmClose();
    });
    expect(screen.getByTestId('unsaved-changes-modal')).toBeTruthy();

    fireEvent.click(screen.getByTestId('unsaved-modal-cancel'));
    expect(await pending).toBe('cancelled');
    expect(screen.queryByTestId('unsaved-changes-modal')).toBeNull();
  });

  it('confirmClose() resolves "discarded" for "Salir sin guardar"', async () => {
    renderEditor();
    fireEvent.change(screen.getByTestId('activity-title-input'), { target: { value: 'x' } });
    const guard = (window as unknown as Record<string, unknown>)['__inglesEditorWindowGuard'] as {
      confirmClose: () => Promise<'saved' | 'discarded' | 'cancelled'>;
    };
    let pending!: Promise<'saved' | 'discarded' | 'cancelled'>;
    act(() => {
      pending = guard.confirmClose();
    });
    fireEvent.click(screen.getByTestId('unsaved-modal-leave'));
    expect(await pending).toBe('discarded');
  });

  it('confirmClose() resolves "saved" only after "Guardar y salir" actually succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    renderEditor();
    fireEvent.change(screen.getByTestId('activity-title-input'), { target: { value: 'x' } });
    const guard = (window as unknown as Record<string, unknown>)['__inglesEditorWindowGuard'] as {
      confirmClose: () => Promise<'saved' | 'discarded' | 'cancelled'>;
    };
    let pending!: Promise<'saved' | 'discarded' | 'cancelled'>;
    act(() => {
      pending = guard.confirmClose();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('unsaved-modal-save-and-leave'));
    });
    expect(await pending).toBe('saved');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('ActivityEditorIsland — autosave', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('saves automatically ~5s after the last change, with no manual save click', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK] });

    fireEvent.change(screen.getByTestId('activity-title-input'), { target: { value: 'Autoguardado' } });
    expect(screen.getByTestId('save-status').getAttribute('data-status')).toBe('unsaved');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4999);
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('save-status').getAttribute('data-status')).toBe('saved');
  });

  it('shows a retry action on autosave failure, which retries the save', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK] });

    fireEvent.change(screen.getByTestId('activity-title-input'), { target: { value: 'x' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByTestId('save-status').getAttribute('data-status')).toBe('error');
    expect(screen.getByTestId('save-retry')).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByTestId('save-retry'));
    });
    expect(screen.getByTestId('save-status').getAttribute('data-status')).toBe('saved');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never autosaves mid-drag, then debounces ~5s from the moment the drag ends (creator polish round 3)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK_WITH_ZONE] });

    // The first (only) block opens on entry (owner feedback #1) — no click needed.
    const canvas = screen.getByTestId('zone-canvas');
    mockRect(canvas, { width: 200, height: 100 });
    const zone = screen.getByTestId('zone-z1');

    firePointer(zone, 'pointerdown', 20, 10);
    firePointer(canvas, 'pointermove', 40, 10); // a live, in-progress move frame
    expect(screen.getByTestId('save-status').getAttribute('data-status')).toBe('saved'); // no autosave scheduled yet

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000); // well past 5s, but still mid-drag
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('save-status').getAttribute('data-status')).toBe('saved');

    firePointer(canvas, 'pointerup', 40, 10); // seals the drag into one commit
    expect(screen.getByTestId('save-status').getAttribute('data-status')).toBe('unsaved');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4999);
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('ActivityEditorIsland — dirty tracking and save', () => {
  it('marks unsaved after editing the title', () => {
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK] });
    fireEvent.change(screen.getByTestId('activity-title-input'), { target: { value: 'Nuevo título' } });
    expect(screen.getByTestId('save-status').getAttribute('data-status')).toBe('unsaved');
  });

  it('saves successfully and posts the current title/level/blocks', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    // Deliberately zero blocks (the empty-blocks picker state, no floating
    // side toolbar mounted — see the "no side toolbar" describe block below):
    // saved via the Ctrl/⌘+S shortcut, which is wired at the island level,
    // independently of the toolbar's own save button.
    renderEditor({ initialLevel: 'A2' });

    fireEvent.change(screen.getByTestId('activity-title-input'), { target: { value: 'Mi actividad' } });
    await act(async () => {
      fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/actividades/act-1/guardar',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ title: 'Mi actividad', level: 'A2', blocks: [] }),
        }),
      ),
    );
  });

  it('shows an error status when the save request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK] });
    await act(async () => {
      fireEvent.click(screen.getByTestId('save-button'));
    });
    await waitFor(() => expect(screen.getByTestId('save-status').getAttribute('data-status')).toBe('error'));
  });
});

describe('ActivityEditorIsland — level select', () => {
  it('changing the level marks unsaved and updates the value', () => {
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK] });
    fireEvent.change(screen.getByTestId('activity-level-select'), { target: { value: 'B1' } });
    expect((screen.getByTestId('activity-level-select') as HTMLSelectElement).value).toBe('B1');
    expect(screen.getByTestId('save-status').getAttribute('data-status')).toBe('unsaved');
  });
});

describe('ActivityEditorIsland — preview toggle', () => {
  it('switches to the read-only preview and back', () => {
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK] });
    fireEvent.click(screen.getByTestId('preview-toggle'));
    expect(screen.getByTestId('activity-preview')).toBeTruthy();
    expect(screen.getByTestId('worksheet-player')).toBeTruthy();
    fireEvent.click(screen.getByTestId('preview-toggle'));
    expect(screen.queryByTestId('activity-preview')).toBeNull();
  });
});

describe('ActivityEditorIsland — adding a worksheet block', () => {
  it('opens the picker, then the uploader, and appends the resulting block on completion', async () => {
    pipelineMocks.routeFileType.mockReturnValue('image');
    pipelineMocks.convertImageToWebp.mockResolvedValue(new Blob(['x']));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ path: 'p.webp', width: 400, height: 300 }) }),
    );

    renderEditor();
    // Empty activity: the picker is already open, no "+" click needed first.
    expect(screen.getByTestId('block-type-picker')).toBeTruthy();

    fireEvent.click(screen.getByTestId('picker-worksheet'));
    expect(screen.getByTestId('worksheet-uploader')).toBeTruthy();

    const input = screen.getByTestId('worksheet-file-input') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
    });

    await waitFor(() => expect(screen.getByTestId('block-list')).toBeTruthy());
    expect(screen.queryByTestId('worksheet-uploader')).toBeNull();
    // The new block is selected: its zone editor is already expanded.
    expect(screen.getByTestId('worksheet-zone-editor')).toBeTruthy();
  });
});

describe('ActivityEditorIsland — adding a quiz block', () => {
  it('opens the picker and appends an empty, expanded quiz block immediately — no upload step', () => {
    renderEditor();
    // Empty activity: the picker is already open, no "+" click needed first.
    expect(screen.getByTestId('block-type-picker')).toBeTruthy();

    fireEvent.click(screen.getByTestId('picker-questions'));

    expect(screen.queryByTestId('block-type-picker')).toBeNull();
    expect(screen.getByTestId('block-list')).toBeTruthy();
    // The new block is selected: its quiz editor is already expanded.
    expect(screen.getByTestId(/^quiz-editor-/)).toBeTruthy();
  });
});

describe('ActivityEditorIsland — Escape deselects the current zone', () => {
  it('deselects the selected zone on Escape, without collapsing its block', () => {
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK_WITH_ZONE] });
    // The first (only) block opens on entry (owner feedback #1) — no click needed.
    expect(screen.getByTestId('worksheet-zone-editor')).toBeTruthy();

    // Selects the existing zone (canvas tools pass: the accessible "+ Zona"
    // button is gone — the Zona tool now owns zone creation via a pointer
    // drag, a manual/Playwright check per `WorksheetZoneEditor.tsx`'s own
    // header; picking an already-drawn zone needs no real layout at all).
    fireEvent.pointerDown(screen.getByTestId('zone-z1'));
    expect(screen.getByTestId('zone-properties-content')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('zone-properties-content')).toBeNull();
    // The block itself stays expanded — collapse is independent (owner request #6).
    expect(screen.getByTestId('worksheet-zone-editor')).toBeTruthy();
  });
});

describe('ActivityEditorIsland — one active block at a time (owner decision 2026-10-07, "Barra fina debajo")', () => {
  it('switching the active block never shows two editors at once', () => {
    const b2: WorksheetBlock = { ...WORKSHEET_BLOCK, id: 'b2' };
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK, b2] });

    // The first block is active on entry (owner feedback #1) — no click needed.
    expect(screen.getAllByTestId('worksheet-zone-editor')).toHaveLength(1);
    expect(screen.getByTestId('block-b1')).toBeTruthy();

    // ‹ › switches to the next sheet instead.
    fireEvent.click(screen.getByTestId('sheet-nav-next'));
    expect(screen.getAllByTestId('worksheet-zone-editor')).toHaveLength(1);
    expect(screen.queryByTestId('block-b1')).toBeNull();
    expect(screen.getByTestId('block-b2')).toBeTruthy();
  });

  it('uploading a multi-page PDF stitches it into ONE new block (one-sheet redesign)', async () => {
    // A PDF with several selected pages used to hand `handleUploadComplete`
    // one new block PER page — see `WorksheetUploader.tsx`'s own header on
    // why that is now stitched into a single combined sheet instead (an
    // activity has only one block at all now).
    pipelineMocks.routeFileType.mockReturnValue('pdf');
    // The thumbnail grid is a separate concern (`WorksheetUploader.test.tsx`
    // owns it) — this test only cares about the single-block result, so it
    // takes the text-field fallback path by having thumbnail rendering fail.
    pipelineMocks.renderPdfThumbnails.mockRejectedValue(new Error('pdf_failed'));
    pipelineMocks.validatePageSelection.mockReturnValue([1, 2]);
    pipelineMocks.openPdfForConversion.mockResolvedValue({
      totalPages: 2,
      convertPage: vi.fn(async (pageNumber: number) => new Blob([`p${pageNumber}`])),
      dispose: vi.fn(async () => {}),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ path: 'combined.webp', width: 400, height: 300 }) }),
    );

    renderEditor();
    // Empty activity: the picker is already open, no "+" click needed first.
    fireEvent.click(screen.getByTestId('picker-worksheet'));

    const input = screen.getByTestId('worksheet-file-input') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['x'], 'a.pdf', { type: 'application/pdf' })] } });
    });
    fireEvent.change(screen.getByTestId('pdf-pages-input'), { target: { value: '1, 2' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('pdf-pages-confirm'));
    });

    await waitFor(() => expect(screen.getByTestId('block-list')).toBeTruthy());
    // ONE block, fully active — no bar at all (one-sheet redesign: a single
    // block never gets the legacy minimal switcher).
    expect(screen.queryByTestId('active-sheet-bar')).toBeNull();
    expect(screen.getAllByTestId('worksheet-zone-editor')).toHaveLength(1);
  });
});

describe('ActivityEditorIsland — undo/redo', () => {
  it('undoes a title change and redoes it', () => {
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK] });
    const input = screen.getByTestId('activity-title-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Nuevo título' } });
    expect(input.value).toBe('Nuevo título');

    fireEvent.click(screen.getByTestId('undo-button'));
    expect(input.value).toBe('Sin título');

    fireEvent.click(screen.getByTestId('redo-button'));
    expect(input.value).toBe('Nuevo título');
  });

  it('starts with undo/redo both disabled', () => {
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK] });
    expect((screen.getByTestId('undo-button') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('redo-button') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('ActivityEditorIsland — unsaved changes navigation guard', () => {
  it('does not show the modal for an internal link click when nothing is dirty', () => {
    renderEditor();
    const link = createInternalLink();
    fireEvent.click(link, { button: 0 });
    expect(screen.queryByTestId('unsaved-changes-modal')).toBeFalsy();
    link.remove();
  });

  it('intercepts an internal link click while dirty and shows the modal', () => {
    renderEditor();
    fireEvent.change(screen.getByTestId('activity-title-input'), { target: { value: 'x' } });

    const link = createInternalLink();
    const event = fireEvent.click(link, { button: 0 });
    expect(event).toBe(false); // preventDefault() was called
    expect(screen.getByTestId('unsaved-changes-modal')).toBeTruthy();
    link.remove();
  });

  it('"Cancelar" closes the modal without navigating', () => {
    renderEditor();
    fireEvent.change(screen.getByTestId('activity-title-input'), { target: { value: 'x' } });
    const link = createInternalLink();
    fireEvent.click(link, { button: 0 });

    fireEvent.click(screen.getByTestId('unsaved-modal-cancel'));
    expect(screen.queryByTestId('unsaved-changes-modal')).toBeNull();
    link.remove();
  });

  it('"Guardar y salir" saves, then navigates on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    renderEditor();
    fireEvent.change(screen.getByTestId('activity-title-input'), { target: { value: 'x' } });

    const link = createInternalLink();
    fireEvent.click(link, { button: 0 });

    await act(async () => {
      fireEvent.click(screen.getByTestId('unsaved-modal-save-and-leave'));
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    link.remove();
  });

  it('shows an inline error and keeps the modal open when "Guardar y salir" fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    renderEditor();
    fireEvent.change(screen.getByTestId('activity-title-input'), { target: { value: 'x' } });

    const link = createInternalLink();
    fireEvent.click(link, { button: 0 });

    await act(async () => {
      fireEvent.click(screen.getByTestId('unsaved-modal-save-and-leave'));
    });

    expect(screen.getByTestId('unsaved-modal-error')).toBeTruthy();
    expect(screen.getByTestId('unsaved-changes-modal')).toBeTruthy();
    link.remove();
  });

  it('ignores a modifier-clicked or middle-clicked link (browser default handles it)', () => {
    renderEditor();
    fireEvent.change(screen.getByTestId('activity-title-input'), { target: { value: 'x' } });
    const link = createInternalLink();
    fireEvent.click(link, { button: 0, ctrlKey: true });
    expect(screen.queryByTestId('unsaved-changes-modal')).toBeNull();
    link.remove();
  });

  it('shows the modal on an astro:before-preparation navigation while dirty', () => {
    renderEditor();
    fireEvent.change(screen.getByTestId('activity-title-input'), { target: { value: 'x' } });

    const event = new Event('astro:before-preparation', { cancelable: true });
    Object.assign(event, { to: new URL('https://example.test/es/libros') });
    act(() => {
      document.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByTestId('unsaved-changes-modal')).toBeTruthy();
  });
});

describe('ActivityEditorIsland — Bug 3, no double "unsaved changes" prompt', () => {
  function openModalWhileDirty() {
    fireEvent.change(screen.getByTestId('activity-title-input'), { target: { value: 'x' } });
    const link = createInternalLink();
    fireEvent.click(link, { button: 0 });
    return link;
  }

  it('"Salir sin guardar" removes the beforeunload guard before navigating — no native prompt follows', () => {
    renderEditor();
    const link = openModalWhileDirty();

    fireEvent.click(screen.getByTestId('unsaved-modal-leave'));

    // Our own in-app navigation already ran (`window.location.href`); the
    // native prompt must not ALSO fire for it.
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    link.remove();
  });

  it('"Guardar y salir" removes the beforeunload guard only AFTER a successful save, before navigating', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    renderEditor();
    const link = openModalWhileDirty();

    await act(async () => {
      fireEvent.click(screen.getByTestId('unsaved-modal-save-and-leave'));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    link.remove();
  });

  it('keeps the beforeunload guard armed when "Guardar y salir" fails to save — stays on the page, no navigation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    renderEditor();
    const link = openModalWhileDirty();

    await act(async () => {
      fireEvent.click(screen.getByTestId('unsaved-modal-save-and-leave'));
    });

    expect(screen.getByTestId('unsaved-modal-error')).toBeTruthy();
    // Never saved, never navigated — the native guard must still be armed.
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    link.remove();
  });
});

describe('ActivityEditorIsland — beforeunload guard', () => {
  it('prevents unload while there are unsaved changes', () => {
    renderEditor();
    fireEvent.change(screen.getByTestId('activity-title-input'), { target: { value: 'x' } });

    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('does not prevent unload when there is nothing unsaved', () => {
    renderEditor();
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});

describe('ActivityEditorIsland — review-state badge', () => {
  it('shows "Borrador" for a brand-new activity by default', () => {
    renderEditor();
    expect(screen.getByTestId('activity-status-badge').textContent).toContain('Borrador');
  });

  it('shows "En revisión" for a pending_review activity', () => {
    renderEditor({ initialStatus: 'pending_review' });
    expect(screen.getByTestId('activity-status-badge').textContent).toContain('En revisión');
  });

  it('shows "Publicada" for a live activity', () => {
    renderEditor({ initialStatus: 'live' });
    expect(screen.getByTestId('activity-status-badge').textContent).toContain('Publicada');
  });

  it('shows "Rechazada" plus the reviewer note for a rejected activity', () => {
    renderEditor({ initialStatus: 'rejected', initialReviewNote: 'Falta una zona en la hoja 2.' });
    expect(screen.getByTestId('activity-status-badge').textContent).toContain('Rechazada');
    expect(screen.getByTestId('activity-review-note').textContent).toContain('Falta una zona en la hoja 2.');
  });

  it('shows no reviewer note when the activity was never rejected', () => {
    renderEditor();
    expect(screen.queryByTestId('activity-review-note')).toBeNull();
  });
});

describe('ActivityEditorIsland — "Duplicar y adaptar" credit line (D7)', () => {
  it('shows nothing when the activity has no source', () => {
    renderEditor();
    expect(screen.queryByTestId('activity-based-on')).toBeNull();
  });

  it('links to the source when it is still live', () => {
    renderEditor({ sourceActivity: { title: 'Original', href: '/es/ingles/actividades/orig-1' } });
    const line = screen.getByTestId('activity-based-on');
    expect(line.textContent).toContain('Original');
    const link = line.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/es/ingles/actividades/orig-1');
  });

  it('shows the title with no link once the source is no longer live', () => {
    renderEditor({ sourceActivity: { title: 'Original', href: null } });
    const line = screen.getByTestId('activity-based-on');
    expect(line.textContent).toContain('Original');
    expect(line.querySelector('a')).toBeNull();
  });
});

describe('ActivityEditorIsland — submit for review', () => {
  it('opens the submit dialog from the top bar button', () => {
    renderEditor();
    expect(screen.queryByTestId('submit-for-review-dialog')).toBeNull();
    fireEvent.click(screen.getByTestId('submit-for-review-button'));
    expect(screen.getByTestId('submit-for-review-dialog')).toBeTruthy();
  });

  it('saves first, then submits, and updates the badge to "En revisión" on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    renderEditor();

    fireEvent.click(screen.getByTestId('submit-for-review-button'));
    fireEvent.click(screen.getByTestId('submit-rights-checkbox'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-dialog-confirm'));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/actividades/act-1/guardar',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/actividades/act-1/enviar',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ acceptedRights: true }),
      }),
    );
    expect(screen.queryByTestId('submit-for-review-dialog')).toBeNull();
    expect(screen.getByTestId('activity-status-badge').textContent).toContain('En revisión');
  });

  it('keeps the badge on "Publicada" when a live activity is submitted', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    renderEditor({ initialStatus: 'live' });

    fireEvent.click(screen.getByTestId('submit-for-review-button'));
    fireEvent.click(screen.getByTestId('submit-rights-checkbox'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-dialog-confirm'));
    });

    expect(screen.getByTestId('activity-status-badge').textContent).toContain('Publicada');
  });

  it('shows an inline error and keeps the dialog open when the submit endpoint rejects it', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) }) // guardar
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'no_blocks' }) }); // enviar
    vi.stubGlobal('fetch', fetchMock);
    renderEditor();

    fireEvent.click(screen.getByTestId('submit-for-review-button'));
    fireEvent.click(screen.getByTestId('submit-rights-checkbox'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-dialog-confirm'));
    });

    expect(screen.getByTestId('submit-for-review-dialog')).toBeTruthy();
    expect(screen.getByTestId('submit-dialog-error').textContent).toContain(
      'Agrega al menos un bloque',
    );
    expect(screen.getByTestId('activity-status-badge').textContent).toContain('Borrador');
  });

  it('jumps to the exact block/zone on an "incomplete" submit response (creator polish round 3)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) }) // guardar
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'incomplete', blockId: 'b1', zoneId: 'z1', reason: 'no_answers' }),
      }); // enviar
    vi.stubGlobal('fetch', fetchMock);
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK_WITH_ZONE] });

    fireEvent.click(screen.getByTestId('submit-for-review-button'));
    fireEvent.click(screen.getByTestId('submit-rights-checkbox'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-dialog-confirm'));
    });

    // Dialog closed, block expanded, zone selected, inline message shown.
    expect(screen.queryByTestId('submit-for-review-dialog')).toBeNull();
    expect(screen.getByTestId('worksheet-zone-editor')).toBeTruthy();
    expect(screen.getByTestId('zone-incomplete-message').textContent).toContain(
      'todavía no tiene una respuesta',
    );
  });

  it('clears the inline incomplete message once the author edits the block again', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'incomplete', blockId: 'b1', zoneId: null, reason: 'no_zones' }),
      });
    vi.stubGlobal('fetch', fetchMock);
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK] });

    fireEvent.click(screen.getByTestId('submit-for-review-button'));
    fireEvent.click(screen.getByTestId('submit-rights-checkbox'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-dialog-confirm'));
    });
    expect(screen.getByTestId('worksheet-incomplete-message')).toBeTruthy();

    // Any block edit clears it (canvas tools pass: the removed "+ Zona"
    // button is no longer the way to trigger one here) — rotating needs no
    // real layout and needs the block neither expanded nor selected.
    fireEvent.click(screen.getByTestId('rotate-right-b1'));
    expect(screen.queryByTestId('worksheet-incomplete-message')).toBeNull();
  });

  it('cancels the dialog without submitting anything', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderEditor();

    fireEvent.click(screen.getByTestId('submit-for-review-button'));
    fireEvent.click(screen.getByTestId('submit-dialog-cancel'));

    expect(screen.queryByTestId('submit-for-review-dialog')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('ActivityEditorIsland — "Ver como presentación" overlay (worksheet zoom tour, sprint week 3)', () => {
  it('opens a full-screen presentation of the CURRENT draft state, unsaved changes included', () => {
    renderEditor({ initialTitle: 'Título guardado' });
    expect(screen.queryByTestId('presentation-viewport')).toBeNull();

    // An unsaved title edit — the overlay must reflect THIS, not whatever
    // was last saved.
    fireEvent.change(screen.getByTestId('activity-title-input'), { target: { value: 'Título sin guardar' } });

    fireEvent.click(screen.getByTestId('view-as-presentation-button'));
    expect(screen.getByTestId('presentation-viewport')).toBeTruthy();
    expect(screen.getByTestId('presentation-slide-cover').textContent).toContain('Título sin guardar');
  });

  it('presents the current worksheet/quiz blocks, including a worksheet zone (reusing the SAME island the real route mounts)', () => {
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK_WITH_ZONE] });
    fireEvent.click(screen.getByTestId('view-as-presentation-button'));
    fireEvent.click(screen.getByTestId('presentation-next'));
    expect(screen.getByTestId('presentation-worksheet-viewport')).toBeTruthy();
  });

  it('closes on Escape and returns focus to the button that opened it', () => {
    renderEditor();
    const trigger = screen.getByTestId('view-as-presentation-button');
    fireEvent.click(trigger);
    expect(screen.getByTestId('presentation-viewport')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('presentation-viewport')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes via the overlay\'s own exit control too (rendered as a button, not a navigation link)', () => {
    renderEditor();
    fireEvent.click(screen.getByTestId('view-as-presentation-button'));
    expect(screen.queryByRole('link', { name: 'Salir' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Salir' }));
    expect(screen.queryByTestId('presentation-viewport')).toBeNull();
  });
});

describe('ActivityEditorIsland — scoped ScrollToTop wiring, PREVIEW ONLY (owner decision 2026-10-07, "Barra fina debajo")', () => {
  // The active block's own body now fills the editor edge to edge with no
  // outer list to scroll past (`WorksheetZoneEditor`'s canvas pans
  // internally; `QuizBlockEditor`'s own columns scroll internally) — so
  // this is mounted only while `preview` is, same as `previewScrollRef`'s
  // own header in `ActivityEditorIsland.tsx`.
  it('is not mounted while editing', () => {
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK] });
    expect(screen.queryByTestId('scroll-to-top-scoped')).toBeNull();
  });

  it('appears after scrolling the preview list, and scrolls it back to the top on click', () => {
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK] });
    fireEvent.click(screen.getByTestId('preview-toggle'));
    const preview = screen.getByTestId('activity-preview');
    expect(screen.getByTestId('scroll-to-top-scoped').getAttribute('aria-hidden')).toBe('true');

    Object.defineProperty(preview, 'clientHeight', { value: 200, configurable: true });
    Object.defineProperty(preview, 'scrollTop', { value: 500, configurable: true });
    act(() => {
      preview.dispatchEvent(new Event('scroll'));
    });
    expect(screen.getByTestId('scroll-to-top-scoped').getAttribute('aria-hidden')).toBe('false');

    const scrollTo = vi.fn();
    preview.scrollTo = scrollTo;
    fireEvent.click(screen.getByTestId('scroll-to-top-scoped'));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });
});
