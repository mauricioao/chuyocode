// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import ActivityEditorIsland from './ActivityEditorIsland';
import type { WorksheetBlock } from '@/lib/activities/blocks';

const pipelineMocks = vi.hoisted(() => ({
  routeFileType: vi.fn(),
  convertImageToWebp: vi.fn(),
}));
vi.mock('@/lib/activities/imagePipeline', async () => {
  const actual = await vi.importActual<typeof import('@/lib/activities/imagePipeline')>(
    '@/lib/activities/imagePipeline',
  );
  return { ...actual, routeFileType: pipelineMocks.routeFileType, convertImageToWebp: pipelineMocks.convertImageToWebp };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const WORKSHEET_BLOCK: WorksheetBlock = {
  id: 'b1',
  type: 'worksheet',
  rotation: 0,
  image: { path: 'activity-uploads/u1/b1.webp', width: 800, height: 600 },
  zones: [],
};

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

  it('shows the empty-blocks state and the add-block button', () => {
    renderEditor();
    expect(screen.getByTestId('blocks-empty')).toBeTruthy();
    expect(screen.getByTestId('add-block-button')).toBeTruthy();
  });
});

describe('ActivityEditorIsland — autosave', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('saves automatically ~3s after the last change, with no manual save click', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    renderEditor();

    fireEvent.change(screen.getByTestId('activity-title-input'), { target: { value: 'Autoguardado' } });
    expect(screen.getByTestId('save-status').getAttribute('data-status')).toBe('unsaved');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
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
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(screen.getByTestId('save-status').getAttribute('data-status')).toBe('error');
    expect(screen.getByTestId('save-retry')).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByTestId('save-retry'));
    });
    expect(screen.getByTestId('save-status').getAttribute('data-status')).toBe('saved');
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
    fireEvent.click(screen.getByTestId('add-block-button'));
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

describe('ActivityEditorIsland — Escape deselects the current zone', () => {
  it('deselects the selected zone on Escape, without collapsing its block', () => {
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK] });
    fireEvent.click(screen.getByTestId('block-header-b1'));
    expect(screen.getByTestId('worksheet-zone-editor')).toBeTruthy();

    fireEvent.click(screen.getByTestId('add-zone'));
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
  it('collapses a block again on a second header click', () => {
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK] });
    fireEvent.click(screen.getByTestId('block-header-b1'));
    expect(screen.getByTestId('worksheet-zone-editor')).toBeTruthy();
    fireEvent.click(screen.getByTestId('block-header-b1'));
    expect(screen.queryByTestId('worksheet-zone-editor')).toBeNull();
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
