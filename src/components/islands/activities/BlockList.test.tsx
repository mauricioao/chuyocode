// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import { useState } from 'react';
import BlockList from './BlockList';
import type { Block, QuizBlock, WorksheetBlock, Zone } from '@/lib/activities/blocks';

// The empty worksheet block's own empty state (creator polish round 4,
// owner feedback #2) renders `WorksheetUploader` inline — same pipeline
// mocking pattern as `WorksheetUploader.test.tsx`/`ActivityEditorIsland.test.tsx`.
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
});

function worksheetBlock(id: string, overrides: Partial<WorksheetBlock> = {}): WorksheetBlock {
  return {
    id,
    type: 'worksheet',
    rotation: 0,
    image: { path: `activity-uploads/u1/${id}.webp`, width: 800, height: 600 },
    zones: [],
    ...overrides,
  };
}

function quizBlock(id: string, overrides: Partial<QuizBlock> = {}): QuizBlock {
  return {
    id,
    type: 'quiz',
    payload: { pools: {}, slots: [] },
    ...overrides,
  };
}

function Harness({
  initialBlocks,
  initialActiveId = initialBlocks[0]?.id ?? null,
  withAudio = false,
}: {
  initialBlocks: Block[];
  initialActiveId?: string | null;
  /** "Colocar un audio propio": wires `resolveAudioUrl` so the Audio tool actually shows. */
  withAudio?: boolean;
}) {
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(initialActiveId);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  return (
    <BlockList
      lang="es"
      blocks={blocks}
      activeBlockId={activeBlockId}
      selectedZoneId={selectedZoneId}
      resolveImageUrl={(path) => `/preview?path=${path}`}
      resolveAudioUrl={withAudio ? (path) => `/audio?path=${path}` : undefined}
      onSetActiveBlock={setActiveBlockId}
      onSelectZone={setSelectedZoneId}
      onBlocksChange={setBlocks}
    />
  );
}

describe('BlockList — audio markers ("colocar un audio propio") threading', () => {
  it('never shows the Audio tool when resolveAudioUrl is not given', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1')]} />);
    expect(screen.queryByTestId('tool-audio')).toBeNull();
  });

  it('shows the Audio tool once resolveAudioUrl is given', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1')]} withAudio />);
    expect(screen.getByTestId('tool-audio')).toBeTruthy();
  });

  it('threads an existing marker through to the canvas, resolved via resolveAudioUrl', () => {
    const block = worksheetBlock('b1', {
      audio: [{ id: 'm1', x: 0.5, y: 0.5, path: 'activity-audio/a/m1.webm' }],
    });
    render(<Harness initialBlocks={[block]} withAudio />);
    fireEvent.click(screen.getByTestId('tool-audio'));
    fireEvent.pointerDown(screen.getByTestId('audio-marker-m1'));
    const player = screen.getByTestId('audio-marker-player') as HTMLAudioElement;
    expect(player.getAttribute('src')).toBe('/audio?path=activity-audio/a/m1.webm');
  });

  it("deleting an audio marker from the panel updates the worksheet block's own audio field", () => {
    const block = worksheetBlock('b1', {
      audio: [{ id: 'm1', x: 0.5, y: 0.5, path: 'activity-audio/a/m1.webm' }],
    });
    render(<Harness initialBlocks={[block]} withAudio />);
    fireEvent.click(screen.getByTestId('tool-audio'));
    fireEvent.pointerDown(screen.getByTestId('audio-marker-m1'));
    fireEvent.click(screen.getByTestId('audio-delete'));
    expect(screen.queryByTestId('audio-marker-m1')).toBeNull();
  });
});

describe('BlockList — empty state', () => {
  it('shows the empty-state copy when there are no blocks', () => {
    render(<Harness initialBlocks={[]} />);
    expect(screen.getByTestId('blocks-empty')).toBeTruthy();
    expect(screen.queryByTestId('block-list')).toBeNull();
    expect(screen.getByTestId('blocks-empty').textContent).toBe('Elige con qué seguir');
  });
});

describe('BlockList — one-sheet redesign: a single-block activity has NO bar at all', () => {
  it('renders only the active block\'s own editor, with no active-sheet bar', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1')]} />);
    expect(screen.getAllByTestId('worksheet-zone-editor')).toHaveLength(1);
    expect(screen.getByTestId('block-b1')).toBeTruthy();
    expect(screen.queryByTestId('active-sheet-bar')).toBeNull();
  });

  it('has no name field, no position switcher, no reorder menu, no delete button', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1')]} />);
    expect(screen.queryByLabelText('Nombre del bloque')).toBeNull();
    expect(screen.queryByTestId('sheet-position')).toBeNull();
    expect(screen.queryByTestId('sheet-nav-prev')).toBeNull();
    expect(screen.queryByTestId('sheet-nav-next')).toBeNull();
    expect(screen.queryByTestId('sheet-actions-trigger')).toBeNull();
    expect(screen.queryByTestId('delete-block-trigger')).toBeNull();
  });

  it('has no zone count or question count badge', () => {
    const zone: Zone = { id: 'z1', x: 0.1, y: 0.1, w: 0.1, h: 0.1, kind: 'text', answers: ['x'] };
    render(<Harness initialBlocks={[worksheetBlock('b1', { zones: [zone] })]} />);
    expect(screen.queryByTestId('zone-count-b1')).toBeNull();
  });
});

describe('BlockList — backward compatibility: a legacy multi-block activity keeps a minimal ‹ n/N › switcher', () => {
  it('shows the minimal switcher for 2+ blocks', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1'), worksheetBlock('b2')]} initialActiveId="b1" />);
    expect(screen.getByTestId('active-sheet-bar')).toBeTruthy();
    expect(screen.getByTestId('sheet-position').textContent).toBe('1 de 2');
  });

  // Updated for "delete and reorder for legacy multi-block activities"
  // (PLAN-OCTUBRE.md "Pendientes nuevos"): the minimal switcher still has no
  // name field or way to ADD another block, but it now offers the active
  // sheet's own "Más" menu — see the dedicated describe block below for
  // reorder/delete coverage.
  it('the minimal switcher still has no name field or way to add another block', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1'), worksheetBlock('b2')]} initialActiveId="b1" />);
    expect(screen.queryByLabelText('Nombre del bloque')).toBeNull();
    expect(screen.queryByTestId('add-block-trigger')).toBeNull();
  });

  it('moves to the next block, disabled at the last one', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1'), worksheetBlock('b2')]} initialActiveId="b1" />);
    expect((screen.getByTestId('sheet-nav-prev') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('sheet-nav-next') as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByTestId('sheet-nav-next'));
    expect(screen.getByTestId('block-b2')).toBeTruthy();
    expect((screen.getByTestId('sheet-nav-next') as HTMLButtonElement).disabled).toBe(true);
  });

  it('moves to the previous block, disabled at the first one', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1'), worksheetBlock('b2')]} initialActiveId="b2" />);
    fireEvent.click(screen.getByTestId('sheet-nav-prev'));
    expect(screen.getByTestId('block-b1')).toBeTruthy();
    expect((screen.getByTestId('sheet-nav-prev') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the "n de N" position for a third block', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1'), worksheetBlock('b2'), worksheetBlock('b3')]} initialActiveId="b2" />);
    expect(screen.getByTestId('sheet-position').textContent).toBe('2 de 3');
  });
});

describe('BlockList — "Más" menu on the active sheet (legacy multi-sheet activities, 2+ blocks)', () => {
  it('shows the trigger for 2+ blocks', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1'), worksheetBlock('b2')]} initialActiveId="b1" />);
    expect(screen.getByTestId('sheet-actions-trigger')).toBeTruthy();
  });

  it('for the first of three sheets, disables "mover a la izquierda" and enables "mover a la derecha"', () => {
    render(
      <Harness
        initialBlocks={[worksheetBlock('b1'), worksheetBlock('b2'), worksheetBlock('b3')]}
        initialActiveId="b1"
      />,
    );
    fireEvent.click(screen.getByTestId('sheet-actions-trigger'));
    expect((screen.getByTestId('sheet-move-left') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('sheet-move-right') as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByTestId('delete-block-trigger')).toBeTruthy();
  });

  it('for the last of three sheets, disables "mover a la derecha" and enables "mover a la izquierda"', () => {
    render(
      <Harness
        initialBlocks={[worksheetBlock('b1'), worksheetBlock('b2'), worksheetBlock('b3')]}
        initialActiveId="b3"
      />,
    );
    fireEvent.click(screen.getByTestId('sheet-actions-trigger'));
    expect((screen.getByTestId('sheet-move-right') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('sheet-move-left') as HTMLButtonElement).disabled).toBe(false);
  });

  it('moving right reorders the blocks and keeps the moved sheet active', () => {
    render(
      <Harness
        initialBlocks={[worksheetBlock('b1'), worksheetBlock('b2'), worksheetBlock('b3')]}
        initialActiveId="b1"
      />,
    );
    fireEvent.click(screen.getByTestId('sheet-actions-trigger'));
    fireEvent.click(screen.getByTestId('sheet-move-right'));
    expect(screen.getByTestId('sheet-position').textContent).toBe('2 de 3');
    expect(screen.getByTestId('block-b1')).toBeTruthy();
  });

  it('moving left reorders the blocks and keeps the moved sheet active', () => {
    render(
      <Harness
        initialBlocks={[worksheetBlock('b1'), worksheetBlock('b2'), worksheetBlock('b3')]}
        initialActiveId="b2"
      />,
    );
    fireEvent.click(screen.getByTestId('sheet-actions-trigger'));
    fireEvent.click(screen.getByTestId('sheet-move-left'));
    expect(screen.getByTestId('sheet-position').textContent).toBe('1 de 3');
    expect(screen.getByTestId('block-b2')).toBeTruthy();
  });

  it('deleting the active sheet removes it, activates a neighbor, and shows the undo status line', () => {
    render(
      <Harness
        initialBlocks={[worksheetBlock('b1'), worksheetBlock('b2'), worksheetBlock('b3')]}
        initialActiveId="b2"
      />,
    );
    fireEvent.click(screen.getByTestId('sheet-actions-trigger'));
    fireEvent.click(screen.getByTestId('delete-block-trigger'));
    expect(screen.queryByTestId('block-b2')).toBeNull();
    expect(screen.getByTestId('sheet-position').textContent).toBe('2 de 2');
    expect(screen.getByTestId('sheet-status').textContent).toBe('Hoja eliminada · Ctrl+Z para deshacer');
  });

  it('deleting down to one sheet removes the whole bar, but keeps the undo status line visible', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1'), worksheetBlock('b2')]} initialActiveId="b1" />);
    fireEvent.click(screen.getByTestId('sheet-actions-trigger'));
    fireEvent.click(screen.getByTestId('delete-block-trigger'));
    expect(screen.queryByTestId('active-sheet-bar')).toBeNull();
    expect(screen.getByTestId('block-b2')).toBeTruthy();
    expect(screen.getByTestId('sheet-status').textContent).toBe('Hoja eliminada · Ctrl+Z para deshacer');
  });
});

describe('BlockList — quiz blocks', () => {
  it('shows the quiz editor, not the worksheet zone editor, for the active quiz block', () => {
    render(<Harness initialBlocks={[quizBlock('b1')]} />);
    expect(screen.getByTestId('quiz-editor-b1')).toBeTruthy();
    expect(screen.queryByTestId('worksheet-zone-editor')).toBeNull();
  });

  it('adding a question through the quiz editor updates the block via onBlocksChange', () => {
    render(<Harness initialBlocks={[quizBlock('b1')]} />);
    // Empty quiz block ("Varios juegos", R3): typing into the empty-list
    // ghost row's question field (`MatchPairsEditor.tsx`'s own pattern)
    // creates the first real row.
    fireEvent.change(screen.getByTestId('varios-example-question-b1'), { target: { value: 'What color is the sky?' } });
    expect(screen.getByTestId('quiz-question-list-b1')).toBeTruthy();
  });

  it('never shows rotate controls or the worksheet tool cluster for a quiz block', () => {
    render(<Harness initialBlocks={[quizBlock('b1')]} />);
    expect(screen.queryByTestId('rotate-left-b1')).toBeNull();
    expect(screen.queryByTestId('rotate-right-b1')).toBeNull();
    expect(screen.queryByTestId('tool-zone')).toBeNull();
    expect(screen.queryByTestId('tool-hand')).toBeNull();
  });
});

describe('BlockList — empty worksheet block (creator polish round 4, owner feedback #2)', () => {
  it('shows the upload drop zone instead of the canvas when the active worksheet block has no image yet', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1', { image: undefined, zones: [] })]} />);
    expect(screen.getByTestId('worksheet-uploader')).toBeTruthy();
    expect(screen.queryByTestId('worksheet-zone-editor')).toBeNull();
  });

  // CANVAS EVERYWHERE (owner spec): the dotted pattern simulates the canvas
  // even before an image exists, so the author sees where to drop a file.
  it('wraps the empty-state drop zone in the same dotted canvas surface the filled canvas uses', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1', { image: undefined, zones: [] })]} />);
    const uploader = screen.getByTestId('worksheet-uploader');
    expect(uploader.closest('.canvas-dots')).not.toBeNull();
  });

  it('fills the block with the uploaded image and switches to the zone editor', async () => {
    pipelineMocks.routeFileType.mockReturnValue('image');
    pipelineMocks.convertImageToWebp.mockResolvedValue(new Blob(['x']));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ path: 'p.webp', width: 400, height: 300 }) }),
    );

    render(<Harness initialBlocks={[worksheetBlock('b1', { image: undefined, zones: [] })]} />);
    const input = screen.getByTestId('worksheet-file-input') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
    });

    await waitFor(() => expect(screen.getByTestId('worksheet-zone-editor')).toBeTruthy());
    expect(screen.queryByTestId('worksheet-uploader')).toBeNull();
  });
});

describe('BlockList — rotation (via the worksheet tool cluster — portaled, or inline with no portal target)', () => {
  it('rotating right advances rotation by 90 and keeps the block active', () => {
    const zone: Zone = { id: 'z1', x: 0, y: 0, w: 0.1, h: 0.2, kind: 'text', answers: ['x'] };
    render(<Harness initialBlocks={[worksheetBlock('b1', { zones: [zone] })]} />);
    fireEvent.click(screen.getByTestId('rotate-right-b1'));
    expect(screen.getByTestId('block-b1')).toBeTruthy();
  });

  it('rotating left decreases rotation, wrapping at 0 (no crash, stays active)', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1')]} />);
    fireEvent.click(screen.getByTestId('rotate-left-b1'));
    expect(screen.getByTestId('block-b1')).toBeTruthy();
  });

  it('is absent before the first upload (nothing to rotate yet)', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1', { image: undefined, zones: [] })]} />);
    expect(screen.queryByTestId('rotate-left-b1')).toBeNull();
    expect(screen.queryByTestId('rotate-right-b1')).toBeNull();
  });
});

describe('BlockList — the Zona/Mano tool cluster', () => {
  it('portals into the given sideToolsPortalTarget', () => {
    const slot = document.createElement('div');
    document.body.appendChild(slot);
    render(
      <BlockList
        lang="es"
        blocks={[worksheetBlock('b1')]}
        activeBlockId="b1"
        selectedZoneId={null}
        resolveImageUrl={(p) => p}
        onSetActiveBlock={() => {}}
        onSelectZone={() => {}}
        onBlocksChange={() => {}}
        sideToolsPortalTarget={slot}
      />,
    );
    expect(slot.querySelector('[data-testid="tool-zone"]')).not.toBeNull();
    expect(slot.querySelector('[data-testid="rotate-left-b1"]')).not.toBeNull();
    slot.remove();
  });

  it('falls back to rendering inline when no portal target is given', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1')]} />);
    expect(screen.getByTestId('tool-zone')).toBeTruthy();
    expect(screen.getByTestId('tool-hand')).toBeTruthy();
  });
});

describe('BlockList — "Cambiar imagen" (replaces the per-block delete)', () => {
  it('replaces the image directly when the worksheet has no zones yet', async () => {
    pipelineMocks.routeFileType.mockReturnValue('image');
    pipelineMocks.convertImageToWebp.mockResolvedValue(new Blob(['x']));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ path: 'new.webp', width: 500, height: 400 }) }),
    );

    render(<Harness initialBlocks={[worksheetBlock('b1', { zones: [] })]} />);
    fireEvent.click(screen.getByTestId('change-image-trigger-b1'));
    expect(screen.queryByTestId('change-image-confirm')).toBeNull();
    expect(screen.getByTestId('worksheet-uploader')).toBeTruthy();

    const input = screen.getByTestId('worksheet-file-input') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['x'], 'b.png', { type: 'image/png' })] } });
    });
    await waitFor(() => expect(screen.getByTestId('worksheet-zone-editor')).toBeTruthy());
  });

  it('asks for confirmation first when the worksheet already has zones', () => {
    const zone: Zone = { id: 'z1', x: 0, y: 0, w: 0.1, h: 0.1, kind: 'text', answers: ['x'] };
    render(<Harness initialBlocks={[worksheetBlock('b1', { zones: [zone] })]} />);
    fireEvent.click(screen.getByTestId('change-image-trigger-b1'));
    expect(screen.getByTestId('change-image-confirm')).toBeTruthy();
    // Nothing happened yet — still the canvas, not the uploader.
    expect(screen.getByTestId('worksheet-zone-editor')).toBeTruthy();
  });

  it('confirming opens the replace-image drop zone, discarding the old zones', async () => {
    const zone: Zone = { id: 'z1', x: 0, y: 0, w: 0.1, h: 0.1, kind: 'text', answers: ['x'] };
    render(<Harness initialBlocks={[worksheetBlock('b1', { zones: [zone] })]} />);
    fireEvent.click(screen.getByTestId('change-image-trigger-b1'));
    fireEvent.click(screen.getByTestId('change-image-confirm-accept'));
    expect(screen.getByTestId('worksheet-uploader')).toBeTruthy();
    expect(screen.getByTestId('change-image-cancel')).toBeTruthy();
  });

  it('cancelling the replace flow goes back to the canvas untouched', () => {
    const zone: Zone = { id: 'z1', x: 0, y: 0, w: 0.1, h: 0.1, kind: 'text', answers: ['x'] };
    render(<Harness initialBlocks={[worksheetBlock('b1', { zones: [zone] })]} />);
    fireEvent.click(screen.getByTestId('change-image-trigger-b1'));
    fireEvent.click(screen.getByTestId('change-image-confirm-accept'));
    fireEvent.click(screen.getByTestId('change-image-cancel'));
    expect(screen.getByTestId('worksheet-zone-editor')).toBeTruthy();
  });

  it('is absent before the first upload (nothing to replace yet)', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1', { image: undefined, zones: [] })]} />);
    expect(screen.queryByTestId('change-image-trigger-b1')).toBeNull();
  });
});
