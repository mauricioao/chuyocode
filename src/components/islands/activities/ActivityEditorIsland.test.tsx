// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import ActivityEditorIsland from './ActivityEditorIsland';
import type { WorksheetBlock } from '@/lib/activities/blocks';
import { UI_LABELS } from '@/lib/i18n';

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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  // A handful of "open the first block on entry" tests set this to exercise
  // hash-targeting — reset unconditionally so a later test never inherits a
  // leftover hash, even if one of those failed before its own cleanup line.
  window.location.hash = '';
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
    renderEditor();
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

describe('ActivityEditorIsland — open the first block on entry (creator polish round 4, owner feedback #1)', () => {
  it('expands the first block automatically, with no click needed', () => {
    const b2: WorksheetBlock = { ...WORKSHEET_BLOCK, id: 'b2' };
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK, b2] });
    expect(screen.getByTestId('block-b1').querySelector('[data-testid="worksheet-zone-editor"]')).toBeTruthy();
    expect(screen.getByTestId('block-b2').querySelector('[data-testid="worksheet-zone-editor"]')).toBeNull();
    expect(document.getElementById('block-b1')?.getAttribute('data-focus-active')).toBe('true');
  });

  it('shows a brand-new (imageless) sole block\'s own upload drop zone immediately, auto-expanded', () => {
    const emptyWorksheet: WorksheetBlock = { ...WORKSHEET_BLOCK, image: undefined, zones: [] };
    renderEditor({ initialBlocks: [emptyWorksheet] });
    expect(screen.getByTestId('worksheet-uploader')).toBeTruthy();
  });

  it('still shows the empty-blocks state (no block to expand) for a brand-new, zero-block activity', () => {
    renderEditor({ initialBlocks: [] });
    expect(screen.getByTestId('blocks-empty')).toBeTruthy();
    expect(screen.queryByTestId('worksheet-zone-editor')).toBeNull();
  });

  it('expands the block the URL hash targets instead of the first one', () => {
    window.location.hash = '#block-b2';
    const b2: WorksheetBlock = { ...WORKSHEET_BLOCK, id: 'b2' };
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK, b2] });
    expect(screen.getByTestId('block-b1').querySelector('[data-testid="worksheet-zone-editor"]')).toBeNull();
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

  it('"collapse all" still works after the first block auto-opens', () => {
    const b2: WorksheetBlock = { ...WORKSHEET_BLOCK, id: 'b2' };
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK, b2] });
    expect(screen.getByTestId('worksheet-zone-editor')).toBeTruthy();
    fireEvent.click(screen.getByTestId('collapse-all-button'));
    expect(screen.queryByTestId('worksheet-zone-editor')).toBeNull();
  });
});

describe('ActivityEditorIsland — one framed card (creator polish round 3)', () => {
  it('wraps the title/level header row and the block list inside ONE bordered card', () => {
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK] });
    const card = screen.getByTestId('activity-editor-card');
    expect(card.className).toContain('lg:rounded-lg');
    expect(card.className).toContain('lg:border');
    expect(card.className).toContain('lg:bg-card');
    expect(card.contains(screen.getByTestId('activity-title-input'))).toBe(true);
    expect(card.contains(screen.getByTestId('block-list'))).toBe(true);
    // The header row no longer carries its own separate box at `lg:` —
    // only a bottom border, since the card itself supplies the frame.
    // Mobile layout pass: the title `<label>` now sits one level deeper,
    // inside the inline-back-button wrapper (`.parentElement` twice) —
    // see `ActivityEditorIsland.tsx`'s own header on that title row.
    const header = screen.getByTestId('activity-title-input').closest('label')?.parentElement?.parentElement;
    expect(header?.className).toContain('lg:border-b');
    expect(header?.className).toContain('lg:rounded-none');
  });

  it('reserves safe-area-aware bottom room for the mobile bottom action bar, cleared at lg', () => {
    renderEditor();
    const root = screen.getByTestId('activity-editor-island');
    expect(root.className).toContain('env(safe-area-inset-bottom)');
    expect(root.className).toContain('lg:pb-0');
  });

  it('keeps the sticky side toolbar exactly outside/unaffected by the card', () => {
    renderEditor();
    const card = screen.getByTestId('activity-editor-card');
    const toolbar = screen.getByTestId('editor-side-toolbar');
    expect(card.contains(toolbar)).toBe(false);
    expect(toolbar.className).toContain('fixed');
  });
});

describe('ActivityEditorIsland — inline mobile back button (mobile layout pass)', () => {
  it('renders inline, immediately left of the title, hidden at lg (desktop keeps its own floating gutter button instead)', () => {
    renderEditor();
    const titleInput = screen.getByTestId('activity-title-input');
    const back = titleInput.closest('label')?.parentElement?.querySelector('a[data-back-button]');
    expect(back).toBeTruthy();
    expect(back?.className).toContain('lg:hidden');
    // Immediately before the title's own <label> in the same row — "inline
    // left of the title", not a separate row above it.
    expect(back?.nextElementSibling).toBe(titleInput.closest('label'));
  });

  it('links to /mis-actividades, lang-prefixed, with the same history.back() progressive enhancement every other BackButton uses', () => {
    renderEditor({ lang: 'es' });
    const back = screen.getByTestId('activity-title-input').closest('label')?.parentElement?.querySelector('a[data-back-button]');
    expect(back?.getAttribute('href')).toBe('/es/mis-actividades');
    expect(back?.hasAttribute('data-back-button')).toBe(true);
  });

  it('localizes its accessible label to English', () => {
    renderEditor({ lang: 'en', activityId: 'act-1' });
    const back = screen.getByTestId('activity-title-input').closest('label')?.parentElement?.querySelector('a[data-back-button]');
    expect(back?.getAttribute('aria-label')).toBe(UI_LABELS.en.common.back);
    expect(back?.getAttribute('href')).toBe('/en/mis-actividades');
  });
});

describe('ActivityEditorIsland — autosave', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('saves automatically ~5s after the last change, with no manual save click', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    renderEditor();

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
    renderEditor();

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
    renderEditor();
    fireEvent.change(screen.getByTestId('activity-title-input'), { target: { value: 'Nuevo título' } });
    expect(screen.getByTestId('save-status').getAttribute('data-status')).toBe('unsaved');
  });

  it('saves successfully and posts the current title/level/blocks', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    renderEditor({ initialLevel: 'A2' });

    fireEvent.change(screen.getByTestId('activity-title-input'), { target: { value: 'Mi actividad' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('save-button'));
    });

    await waitFor(() => expect(screen.getByTestId('save-status').getAttribute('data-status')).toBe('saved'));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/actividades/act-1/guardar',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ title: 'Mi actividad', level: 'A2', blocks: [] }),
      }),
    );
  });

  it('shows an error status when the save request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    renderEditor();
    await act(async () => {
      fireEvent.click(screen.getByTestId('save-button'));
    });
    await waitFor(() => expect(screen.getByTestId('save-status').getAttribute('data-status')).toBe('error'));
  });
});

describe('ActivityEditorIsland — level select', () => {
  it('changing the level marks unsaved and updates the value', () => {
    renderEditor();
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

describe('ActivityEditorIsland — sticky toolbar wiring', () => {
  it('expand-all/collapse-all in the toolbar affect every block', () => {
    const b2: WorksheetBlock = { ...WORKSHEET_BLOCK, id: 'b2' };
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK, b2] });

    fireEvent.click(screen.getByTestId('expand-all-button'));
    expect(screen.getAllByTestId('worksheet-zone-editor')).toHaveLength(2);

    fireEvent.click(screen.getByTestId('collapse-all-button'));
    expect(screen.queryByTestId('worksheet-zone-editor')).toBeNull();
  });

  it('the block index popover expands the chosen block', () => {
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK] });
    fireEvent.click(screen.getByTestId('block-index-trigger'));
    fireEvent.click(screen.getByTestId('block-index-item-b1'));
    expect(screen.getByTestId('worksheet-zone-editor')).toBeTruthy();
  });
});

describe('ActivityEditorIsland — collapse/expand per block', () => {
  it('collapses the (auto-opened) block on header click, and a second click re-expands it', () => {
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK] });
    // The first block opens on entry (owner feedback #1) — no click needed.
    expect(screen.getByTestId('worksheet-zone-editor')).toBeTruthy();
    fireEvent.click(screen.getByTestId('block-header-b1'));
    expect(screen.queryByTestId('worksheet-zone-editor')).toBeNull();
    fireEvent.click(screen.getByTestId('block-header-b1'));
    expect(screen.getByTestId('worksheet-zone-editor')).toBeTruthy();
  });
});

describe('ActivityEditorIsland — desktop focus layout (creator "one-screen" pass)', () => {
  it('expanding a block collapses the previously-active one (accordion — only one focus block at a time)', () => {
    const b2: WorksheetBlock = { ...WORKSHEET_BLOCK, id: 'b2' };
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK, b2] });

    // The first block opens on entry (owner feedback #1) — no click needed.
    expect(screen.getAllByTestId('worksheet-zone-editor')).toHaveLength(1);
    expect(screen.getByTestId('block-b1').querySelector('[data-testid="worksheet-zone-editor"]')).toBeTruthy();

    // Selecting another block makes IT the active/expanded one instead.
    fireEvent.click(screen.getByTestId('block-header-b2'));
    expect(screen.getAllByTestId('worksheet-zone-editor')).toHaveLength(1);
    expect(screen.getByTestId('block-b1').querySelector('[data-testid="worksheet-zone-editor"]')).toBeNull();
    expect(screen.getByTestId('block-b2').querySelector('[data-testid="worksheet-zone-editor"]')).toBeTruthy();

    // The active block's own <li> is the one marked focus-active for the
    // desktop layout's flexible-height treatment (see `BlockList.tsx`).
    expect(document.getElementById('block-b1')?.getAttribute('data-focus-active')).toBeNull();
    expect(document.getElementById('block-b2')?.getAttribute('data-focus-active')).toBe('true');
  });

  it('the block-index popover switches the active block the same way', () => {
    const b2: WorksheetBlock = { ...WORKSHEET_BLOCK, id: 'b2' };
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK, b2] });

    fireEvent.click(screen.getByTestId('block-header-b1'));
    fireEvent.click(screen.getByTestId('block-index-trigger'));
    fireEvent.click(screen.getByTestId('block-index-item-b2'));

    expect(screen.getAllByTestId('worksheet-zone-editor')).toHaveLength(1);
    expect(screen.getByTestId('block-b2').querySelector('[data-testid="worksheet-zone-editor"]')).toBeTruthy();
  });

  it('"expand all" is NOT a focus state — no block is marked focus-active while several are expanded', () => {
    const b2: WorksheetBlock = { ...WORKSHEET_BLOCK, id: 'b2' };
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK, b2] });

    fireEvent.click(screen.getByTestId('expand-all-button'));
    expect(screen.getAllByTestId('worksheet-zone-editor')).toHaveLength(2);
    expect(document.getElementById('block-b1')?.getAttribute('data-focus-active')).toBeNull();
    expect(document.getElementById('block-b2')?.getAttribute('data-focus-active')).toBeNull();
  });

  it('uploading a multi-page PDF (several new blocks at once) activates only the LAST new block', async () => {
    // A PDF with several selected pages is the one real path that hands
    // `handleUploadComplete` MULTIPLE new blocks in a single call — see
    // `WorksheetUploader.tsx`'s `handlePdfPagesConfirm` (a plain image
    // upload only ever produces one).
    pipelineMocks.routeFileType.mockReturnValue('pdf');
    // The thumbnail grid is a separate concern (`WorksheetUploader.test.tsx`
    // owns it) — this test only cares about the multi-block fan-out, so it
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
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ path: 'p1.webp', width: 400, height: 300 }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ path: 'p2.webp', width: 400, height: 300 }) }),
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
    // Two new blocks were added, but only ONE is active/expanded.
    expect(screen.getAllByTestId(/^block-header-/)).toHaveLength(2);
    expect(screen.getAllByTestId('worksheet-zone-editor')).toHaveLength(1);
  });
});

describe('ActivityEditorIsland — undo/redo', () => {
  it('undoes a title change and redoes it', () => {
    renderEditor();
    const input = screen.getByTestId('activity-title-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Nuevo título' } });
    expect(input.value).toBe('Nuevo título');

    fireEvent.click(screen.getByTestId('undo-button'));
    expect(input.value).toBe('Sin título');

    fireEvent.click(screen.getByTestId('redo-button'));
    expect(input.value).toBe('Nuevo título');
  });

  it('starts with undo/redo both disabled', () => {
    renderEditor();
    expect((screen.getByTestId('undo-button') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('redo-button') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('ActivityEditorIsland — unsaved changes navigation guard', () => {
  it('does not show the modal for an internal link click when nothing is dirty', () => {
    renderEditor();
    const link = document.createElement('a');
    link.href = '/es/libros';
    document.body.appendChild(link);
    fireEvent.click(link, { button: 0 });
    expect(screen.queryByTestId('unsaved-changes-modal')).toBeFalsy();
    link.remove();
  });

  it('intercepts an internal link click while dirty and shows the modal', () => {
    renderEditor();
    fireEvent.change(screen.getByTestId('activity-title-input'), { target: { value: 'x' } });

    const link = document.createElement('a');
    link.href = '/es/libros';
    document.body.appendChild(link);
    const event = fireEvent.click(link, { button: 0 });
    expect(event).toBe(false); // preventDefault() was called
    expect(screen.getByTestId('unsaved-changes-modal')).toBeTruthy();
    link.remove();
  });

  it('"Cancelar" closes the modal without navigating', () => {
    renderEditor();
    fireEvent.change(screen.getByTestId('activity-title-input'), { target: { value: 'x' } });
    const link = document.createElement('a');
    link.href = '/es/libros';
    document.body.appendChild(link);
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

    const link = document.createElement('a');
    link.href = '/es/libros';
    document.body.appendChild(link);
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

    const link = document.createElement('a');
    link.href = '/es/libros';
    document.body.appendChild(link);
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
    const link = document.createElement('a');
    link.href = '/es/libros';
    document.body.appendChild(link);
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
    const link = document.createElement('a');
    link.href = '/es/libros';
    document.body.appendChild(link);
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

describe('ActivityEditorIsland — scoped ScrollToTop wiring (nav buttons pass)', () => {
  it('appears after scrolling the block list — the list is the ACTUAL scroll container, not its outer wrapper', () => {
    // Regression test for the actual root cause: the scoped ScrollToTop
    // used to track the outer wrapper div, which also carries
    // `overflow-y-auto` but never actually overflows in ordinary use —
    // `BlockList.tsx`'s own `<ul>` does (see `ActivityEditorIsland.tsx`'s
    // `blockListRef` header). Scrolling that `<ul>` directly is exactly
    // what would have stayed invisible under the old wiring.
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK] });
    const list = screen.getByTestId('block-list');
    expect(screen.getByTestId('scroll-to-top-scoped').getAttribute('aria-hidden')).toBe('true');

    Object.defineProperty(list, 'clientHeight', { value: 200, configurable: true });
    Object.defineProperty(list, 'scrollTop', { value: 500, configurable: true });
    act(() => {
      list.dispatchEvent(new Event('scroll'));
    });

    expect(screen.getByTestId('scroll-to-top-scoped').getAttribute('aria-hidden')).toBe('false');
  });

  it('scrolls the block list to the top (the first block) on click', () => {
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK] });
    const list = screen.getByTestId('block-list') as HTMLUListElement;
    const scrollTo = vi.fn();
    list.scrollTo = scrollTo;

    fireEvent.click(screen.getByTestId('scroll-to-top-scoped'));

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });
});
