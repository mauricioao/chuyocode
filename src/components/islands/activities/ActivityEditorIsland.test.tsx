// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
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

describe('ActivityEditorIsland — Escape deselects', () => {
  it('deselects the currently selected block on Escape', () => {
    renderEditor({ initialBlocks: [WORKSHEET_BLOCK] });
    fireEvent.click(screen.getByTestId('block-header-b1'));
    expect(screen.getByTestId('worksheet-zone-editor')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('worksheet-zone-editor')).toBeNull();
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
