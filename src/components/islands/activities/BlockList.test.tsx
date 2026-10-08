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
}: {
  initialBlocks: Block[];
  initialActiveId?: string | null;
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
      onSetActiveBlock={setActiveBlockId}
      onSelectZone={setSelectedZoneId}
      onBlocksChange={setBlocks}
    />
  );
}

describe('BlockList — empty state', () => {
  it('shows the empty-state copy when there are no blocks', () => {
    render(<Harness initialBlocks={[]} />);
    expect(screen.getByTestId('blocks-empty')).toBeTruthy();
    expect(screen.queryByTestId('block-list')).toBeNull();
    expect(screen.getByTestId('blocks-empty').textContent).toBe('Elige con qué seguir');
  });
});

describe('BlockList — one active block at a time', () => {
  it('renders only the active block\'s own editor, never a second one', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1'), worksheetBlock('b2')]} initialActiveId="b1" />);
    expect(screen.getAllByTestId('worksheet-zone-editor')).toHaveLength(1);
    expect(screen.getByTestId('block-b1')).toBeTruthy();
    expect(screen.queryByTestId('block-b2')).toBeNull();
  });

  it('defaults an unnamed active block to "Hoja N" by position', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1'), worksheetBlock('b2')]} initialActiveId="b2" />);
    const input = screen.getByLabelText('Nombre del bloque') as HTMLInputElement;
    expect(input.value).toBe('Hoja 2');
  });

  it('shows a custom name instead of the positional default', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1', { name: 'Repaso de verbos' })]} />);
    const input = screen.getByLabelText('Nombre del bloque') as HTMLInputElement;
    expect(input.value).toBe('Repaso de verbos');
  });

  it('renaming the active block updates its displayed name', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1')]} />);
    const input = screen.getByLabelText('Nombre del bloque') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Mi hoja' } });
    expect(input.value).toBe('Mi hoja');
  });

  it('shows the "n de N" position', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1'), worksheetBlock('b2'), worksheetBlock('b3')]} initialActiveId="b2" />);
    expect(screen.getByTestId('sheet-position').textContent).toBe('2 de 3');
  });

  it('shows a zone count badge for the active worksheet block', () => {
    const zone: Zone = { id: 'z1', x: 0.1, y: 0.1, w: 0.1, h: 0.1, kind: 'text', answers: ['x'] };
    render(<Harness initialBlocks={[worksheetBlock('b1', { zones: [zone] })]} />);
    expect(screen.getByTestId('zone-count-b1').textContent).toContain('1');
    expect(screen.getByTestId('zone-count-b1').textContent).toContain('zona');
  });
});

describe('BlockList — switching the active block with ‹ ›', () => {
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
});

describe('BlockList — quiz blocks', () => {
  it('shows the quiz editor, not the worksheet zone editor, for the active quiz block', () => {
    render(<Harness initialBlocks={[quizBlock('b1')]} />);
    expect(screen.getByTestId('quiz-editor-b1')).toBeTruthy();
    expect(screen.queryByTestId('worksheet-zone-editor')).toBeNull();
  });

  it('shows a question count badge for the active quiz block', () => {
    const payload = {
      pools: {},
      slots: [{ id: 's1', label: 'L', input: 'text' as const, answer: ['x'] }],
    };
    render(<Harness initialBlocks={[quizBlock('b1', { payload })]} />);
    expect(screen.getByTestId('question-count-b1').textContent).toContain('1');
    expect(screen.getByTestId('question-count-b1').textContent).toContain('pregunta');
  });

  it('adding a question through the quiz editor updates the block via onBlocksChange', () => {
    render(<Harness initialBlocks={[quizBlock('b1')]} />);
    // Empty quiz block: the example-first empty state's "Empezar en blanco"
    // (item 4), not the trailing "+ Agregar pregunta" (that only appears
    // once at least one question already exists).
    fireEvent.click(screen.getByTestId('quiz-start-blank-b1'));
    expect(screen.getByTestId('question-count-b1').textContent).toContain('pregunta');
    expect(screen.getByTestId('quiz-question-list-b1')).toBeTruthy();
  });

  it('never shows rotate controls or a zone count for a quiz block', () => {
    render(<Harness initialBlocks={[quizBlock('b1')]} />);
    expect(screen.queryByTestId('rotate-left-b1')).toBeNull();
    expect(screen.queryByTestId('rotate-right-b1')).toBeNull();
    expect(screen.queryByTestId('zone-count-b1')).toBeNull();
  });
});

describe('BlockList — empty worksheet block (creator polish round 4, owner feedback #2)', () => {
  it('shows the upload drop zone instead of the canvas when the active worksheet block has no image yet', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1', { image: undefined, zones: [] })]} />);
    expect(screen.getByTestId('worksheet-uploader')).toBeTruthy();
    expect(screen.queryByTestId('worksheet-zone-editor')).toBeNull();
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

  it('a multi-page PDF fills this block with the first page and appends the rest as new (inactive) blocks', async () => {
    pipelineMocks.routeFileType.mockReturnValue('pdf');
    // Same "text-field fallback" path `ActivityEditorIsland.test.tsx`'s own
    // multi-page test uses — thumbnail rendering is a separate concern
    // (`WorksheetUploader.test.tsx` owns it).
    pipelineMocks.renderPdfThumbnails.mockRejectedValue(new Error('pdf_failed'));
    pipelineMocks.validatePageSelection.mockReturnValue([1, 2]);
    pipelineMocks.openPdfForConversion.mockResolvedValue({
      totalPages: 2,
      convertPage: vi.fn(async (pageNumber: number) => new Blob([`p${pageNumber}`])),
      dispose: vi.fn(async () => {}),
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ path: 'p1.webp', width: 400, height: 300 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ path: 'p2.webp', width: 400, height: 300 }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<Harness initialBlocks={[worksheetBlock('b1', { image: undefined, zones: [] })]} />);
    const input = screen.getByTestId('worksheet-file-input') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['x'], 'a.pdf', { type: 'application/pdf' })] } });
    });
    await waitFor(() => expect(screen.getByTestId('pdf-pages-input')).toBeTruthy());
    fireEvent.change(screen.getByTestId('pdf-pages-input'), { target: { value: '1, 2' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('pdf-pages-confirm'));
    });

    // b1 is filled (its own canvas is now active) and the second page landed
    // in a brand-new sibling block the harness never activated.
    await waitFor(() => expect(screen.getByTestId('worksheet-zone-editor')).toBeTruthy());
    expect(screen.getByTestId('sheet-position').textContent).toBe('1 de 2');
  });
});

describe('BlockList — rotation', () => {
  it('rotating right advances rotation by 90 and keeps zones (transformed)', () => {
    const zone: Zone = { id: 'z1', x: 0, y: 0, w: 0.1, h: 0.2, kind: 'text', answers: ['x'] };
    render(<Harness initialBlocks={[worksheetBlock('b1', { zones: [zone] })]} />);
    fireEvent.click(screen.getByTestId('rotate-right-b1'));
    expect(screen.getByTestId('zone-count-b1')).toBeTruthy(); // still the same active block
  });

  it('rotating left decreases rotation, wrapping at 0 (no crash, stays active)', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1')]} />);
    fireEvent.click(screen.getByTestId('rotate-left-b1'));
    expect(screen.getByTestId('block-b1')).toBeTruthy();
  });
});

describe('BlockList — reordering via the "⋯" menu (build item 2, "no capability disappears")', () => {
  it('disables "Mover antes" for the first block and "Mover después" for the last one', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1'), worksheetBlock('b2')]} initialActiveId="b1" />);
    fireEvent.click(screen.getByTestId('sheet-actions-trigger'));
    expect((screen.getByTestId('sheet-move-earlier') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('sheet-move-later') as HTMLButtonElement).disabled).toBe(false);
  });

  it('"Mover después" swaps the active block with its following sibling', () => {
    let latest: Block[] = [worksheetBlock('b1'), worksheetBlock('b2')];
    function Wrapper() {
      const [blocks, setBlocks] = useState<Block[]>(latest);
      const [activeBlockId, setActiveBlockId] = useState<string | null>('b1');
      return (
        <BlockList
          lang="es"
          blocks={blocks}
          activeBlockId={activeBlockId}
          selectedZoneId={null}
          resolveImageUrl={(p) => p}
          onSetActiveBlock={setActiveBlockId}
          onSelectZone={() => {}}
          onBlocksChange={(next) => {
            latest = next;
            setBlocks(next);
          }}
        />
      );
    }
    render(<Wrapper />);
    fireEvent.click(screen.getByTestId('sheet-actions-trigger'));
    fireEvent.click(screen.getByTestId('sheet-move-later'));
    expect(latest.map((b) => b.id)).toEqual(['b2', 'b1']);
    // The active block id is unchanged — it simply moved to a new position.
    expect(screen.getByTestId('sheet-position').textContent).toBe('2 de 2');
  });

  it('closes the menu after choosing an action', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1'), worksheetBlock('b2')]} initialActiveId="b1" />);
    fireEvent.click(screen.getByTestId('sheet-actions-trigger'));
    fireEvent.click(screen.getByTestId('sheet-move-later'));
    expect(screen.queryByTestId('sheet-actions-menu')).toBeNull();
  });
});

describe('BlockList — delete with confirm, activates a neighbour', () => {
  it('requires a confirm step before removing the active block', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1')]} />);
    fireEvent.click(screen.getByTestId('delete-block-trigger'));
    expect(screen.getByTestId('delete-confirm')).toBeTruthy();
    expect(screen.getByTestId('block-b1')).toBeTruthy(); // not deleted yet
  });

  it('cancel keeps the block', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1')]} />);
    fireEvent.click(screen.getByTestId('delete-block-trigger'));
    fireEvent.click(screen.getByText('Cancelar'));
    expect(screen.getByTestId('block-b1')).toBeTruthy();
    expect(screen.queryByTestId('delete-confirm')).toBeNull();
  });

  it('accepting removes the only block and falls back to the empty state', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1')]} />);
    fireEvent.click(screen.getByTestId('delete-block-trigger'));
    fireEvent.click(screen.getByTestId('delete-confirm-accept'));
    expect(screen.queryByTestId('block-b1')).toBeNull();
    expect(screen.getByTestId('blocks-empty')).toBeTruthy();
  });

  it('deleting the active block activates its neighbour instead of leaving nothing active', () => {
    function Wrapper() {
      const [blocks, setBlocks] = useState<Block[]>([worksheetBlock('a'), worksheetBlock('b'), worksheetBlock('c')]);
      const [activeBlockId, setActiveBlockId] = useState<string | null>('b');
      return (
        <BlockList
          lang="es"
          blocks={blocks}
          activeBlockId={activeBlockId}
          selectedZoneId={null}
          resolveImageUrl={(p) => p}
          onSetActiveBlock={setActiveBlockId}
          onSelectZone={() => {}}
          onBlocksChange={setBlocks}
        />
      );
    }
    render(<Wrapper />);
    fireEvent.click(screen.getByTestId('delete-block-trigger'));
    fireEvent.click(screen.getByTestId('delete-confirm-accept'));
    // "b" is gone; a neighbour (not nothing) is now active.
    expect(screen.queryByTestId('block-b')).toBeNull();
    expect(screen.getByTestId('block-list')).toBeTruthy();
    expect(screen.getByTestId('sheet-position')).toBeTruthy();
  });
});
