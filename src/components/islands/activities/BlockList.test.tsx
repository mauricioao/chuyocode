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
  initialExpanded = [],
}: {
  initialBlocks: Block[];
  initialExpanded?: string[];
}) {
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(initialExpanded));
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  return (
    <BlockList
      lang="es"
      blocks={blocks}
      expandedBlockIds={expanded}
      selectedZoneId={selectedZoneId}
      resolveImageUrl={(path) => `/preview?path=${path}`}
      onToggleExpand={(id) =>
        setExpanded((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        })
      }
      onSelectZone={setSelectedZoneId}
      onBlocksChange={setBlocks}
    />
  );
}

describe('BlockList — scrollbar gutter (creator polish round 3, no layout jump)', () => {
  it('reserves the scroll container\'s own gutter so its content reflow never steals width', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1')]} />);
    expect(screen.getByTestId('block-list').className).toContain('[scrollbar-gutter:stable]');
  });
});

describe('BlockList — empty state', () => {
  it('shows the empty-state copy when there are no blocks', () => {
    render(<Harness initialBlocks={[]} />);
    expect(screen.getByTestId('blocks-empty')).toBeTruthy();
    expect(screen.queryByTestId('block-list')).toBeNull();
  });
});

describe('BlockList — rendering, naming, and expand/collapse', () => {
  it('renders a header per block, collapsed by default', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1'), worksheetBlock('b2')]} />);
    expect(screen.queryByTestId('worksheet-zone-editor')).toBeNull();
  });

  it('defaults an unnamed block to "Hoja N" by position', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1'), worksheetBlock('b2')]} />);
    const inputs = screen.getAllByLabelText('Nombre del bloque') as HTMLInputElement[];
    expect(inputs[0].value).toBe('Hoja 1');
    expect(inputs[1].value).toBe('Hoja 2');
  });

  it('shows a custom name instead of the positional default', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1', { name: 'Repaso de verbos' })]} />);
    const input = screen.getByLabelText('Nombre del bloque') as HTMLInputElement;
    expect(input.value).toBe('Repaso de verbos');
  });

  it('renaming a block updates its displayed name, even while collapsed', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1')]} />);
    const input = screen.getByLabelText('Nombre del bloque') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Mi hoja' } });
    expect(input.value).toBe('Mi hoja');
    expect(screen.queryByTestId('worksheet-zone-editor')).toBeNull(); // still collapsed
  });

  it('expands a block to show its editor on header click', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1')]} />);
    fireEvent.click(screen.getByTestId('block-header-b1'));
    expect(screen.getByTestId('worksheet-zone-editor')).toBeTruthy();
  });

  it('collapses again when its header is clicked a second time', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1')]} />);
    fireEvent.click(screen.getByTestId('block-header-b1'));
    fireEvent.click(screen.getByTestId('block-header-b1'));
    expect(screen.queryByTestId('worksheet-zone-editor')).toBeNull();
  });

  it('expands multiple blocks independently at the same time', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1'), worksheetBlock('b2')]} />);
    fireEvent.click(screen.getByTestId('block-header-b1'));
    fireEvent.click(screen.getByTestId('block-header-b2'));
    expect(screen.getAllByTestId('worksheet-zone-editor')).toHaveLength(2);
  });

  it('shows a zone count badge for a worksheet block', () => {
    const zone: Zone = { id: 'z1', x: 0.1, y: 0.1, w: 0.1, h: 0.1, kind: 'text', answers: ['x'] };
    render(<Harness initialBlocks={[worksheetBlock('b1', { zones: [zone] })]} />);
    expect(screen.getByTestId('block-b1').textContent).toContain('1');
    expect(screen.getByTestId('block-b1').textContent).toContain('zona');
  });
});

describe('BlockList — quiz blocks', () => {
  it('expands a quiz block into its own editor, not the worksheet zone editor', () => {
    render(<Harness initialBlocks={[quizBlock('b1')]} />);
    fireEvent.click(screen.getByTestId('block-header-b1'));
    expect(screen.getByTestId('quiz-editor-b1')).toBeTruthy();
    expect(screen.queryByTestId('worksheet-zone-editor')).toBeNull();
  });

  it('shows a question count badge for a quiz block', () => {
    const payload = {
      pools: {},
      slots: [{ id: 's1', label: 'L', input: 'text' as const, answer: ['x'] }],
    };
    render(<Harness initialBlocks={[quizBlock('b1', { payload })]} />);
    expect(screen.getByTestId('block-b1').textContent).toContain('1');
    expect(screen.getByTestId('block-b1').textContent).toContain('pregunta');
  });

  it('adding a question through the quiz editor updates the block list via onBlocksChange', () => {
    render(<Harness initialBlocks={[quizBlock('b1')]} />);
    fireEvent.click(screen.getByTestId('block-header-b1'));
    // Empty quiz block: the example-first empty state's "Empezar en blanco"
    // (item 4), not the trailing "+ Agregar pregunta" (that only appears
    // once at least one question already exists).
    fireEvent.click(screen.getByTestId('quiz-start-blank-b1'));
    expect(screen.getByTestId('block-b1').textContent).toContain('pregunta');
    expect(screen.getByTestId('quiz-question-list-b1')).toBeTruthy();
  });
});

describe('BlockList — empty worksheet block (creator polish round 4, owner feedback #2)', () => {
  it('shows the upload drop zone instead of the canvas when a worksheet block has no image yet', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1', { image: undefined, zones: [] })]} initialExpanded={['b1']} />);
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

    render(<Harness initialBlocks={[worksheetBlock('b1', { image: undefined, zones: [] })]} initialExpanded={['b1']} />);
    const input = screen.getByTestId('worksheet-file-input') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
    });

    await waitFor(() => expect(screen.getByTestId('worksheet-zone-editor')).toBeTruthy());
    expect(screen.queryByTestId('worksheet-uploader')).toBeNull();
  });

  it('a multi-page PDF fills this block with the first page and appends the rest as new blocks', async () => {
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

    render(<Harness initialBlocks={[worksheetBlock('b1', { image: undefined, zones: [] })]} initialExpanded={['b1']} />);
    const input = screen.getByTestId('worksheet-file-input') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['x'], 'a.pdf', { type: 'application/pdf' })] } });
    });
    await waitFor(() => expect(screen.getByTestId('pdf-pages-input')).toBeTruthy());
    fireEvent.change(screen.getByTestId('pdf-pages-input'), { target: { value: '1, 2' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('pdf-pages-confirm'));
    });

    await waitFor(() => expect(screen.getAllByTestId(/^block-handle-/)).toHaveLength(2));
    // The originally-empty block b1 is filled (its own canvas is expanded);
    // the SECOND page landed in a brand-new sibling block, still collapsed.
    expect(screen.getByTestId('worksheet-zone-editor')).toBeTruthy();
  });
});

describe('BlockList — empty block list (creator polish round 4, owner feedback #3)', () => {
  it('shows the "choose what to continue with" heading, not the older generic empty text', () => {
    render(<Harness initialBlocks={[]} />);
    expect(screen.getByTestId('blocks-empty').textContent).toBe('Elige con qué seguir');
  });
});

describe('BlockList — desktop focus layout (creator "one-screen" pass)', () => {
  it('marks the sole expanded block focus-active; a collapsed block is not', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1'), worksheetBlock('b2')]} initialExpanded={['b1']} />);
    expect(document.getElementById('block-b1')?.getAttribute('data-focus-active')).toBe('true');
    expect(document.getElementById('block-b2')?.getAttribute('data-focus-active')).toBeNull();
    expect(screen.getByTestId('block-b1').closest('li')?.className).toContain('lg:flex-1');
    expect(screen.getByTestId('block-b2').closest('li')?.className).toContain('lg:flex-none');
  });

  it('marks NO block focus-active when several are expanded at once (e.g. "expand all")', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1'), worksheetBlock('b2')]} initialExpanded={['b1', 'b2']} />);
    expect(document.getElementById('block-b1')?.getAttribute('data-focus-active')).toBeNull();
    expect(document.getElementById('block-b2')?.getAttribute('data-focus-active')).toBeNull();
  });
});

describe('BlockList — reordering (drag-and-drop wiring)', () => {
  it('renders a labeled, focusable drag handle per block', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1'), worksheetBlock('b2')]} />);
    expect(screen.getByTestId('block-handle-b1')).toBeTruthy();
    expect(screen.getByTestId('block-handle-b2')).toBeTruthy();
  });
});

describe('BlockList — fill the empty space (creator polish round 4, owner feedback #2)', () => {
  it('keeps the drag handle inside the block HEADER row, not its own column beside the expanded body', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1')]} initialExpanded={['b1']} />);
    const handle = screen.getByTestId('block-handle-b1');
    const headerCaret = screen.getByTestId('block-header-b1');
    // Same immediate row: the handle and the expand/collapse caret are
    // siblings inside ONE header row, not the handle sitting in its own
    // sibling column of the whole block (the old structure — see
    // `SortableBlockItem`'s own header for why that left an empty gutter the
    // expanded body's full height).
    expect(handle.parentElement).toBe(headerCaret.parentElement);
  });

  it('lets the expanded body span the block\'s full width — no intermediate wrapper narrows it beside a handle column', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1')]} initialExpanded={['b1']} />);
    const blockDiv = screen.getByTestId('block-b1');
    // The `<li>` (focus layout's own bounded-height element) now has exactly
    // ONE direct child: the `block-${id}` div itself — no wrapping flex ROW
    // (handle + content, `items-start`) sitting between them any more.
    const li = blockDiv.closest('li')!;
    expect(Array.from(li.children)).toEqual([blockDiv]);
    // That div's own two children are the header row and the expanded body
    // — both full width, no reserved handle gutter beside the body.
    expect(blockDiv.children).toHaveLength(2);
    expect(blockDiv.children[1].querySelector('[data-testid="worksheet-zone-editor"]')).toBeTruthy();
  });

  it('keeps a real flex-1/min-h-0 chain from the focus-active <li> down to the canvas viewport — no `items-start` ancestor breaks it', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1')]} initialExpanded={['b1']} />);
    const viewport = screen.getByTestId('zone-viewport');
    const li = screen.getByTestId('block-b1').closest('li')!;
    expect(li.className).toContain('lg:flex-1');

    let el: Element | null = viewport;
    while (el && el !== li) {
      expect(el.className).not.toContain('items-start');
      el = el.parentElement;
    }
    expect(el).toBe(li); // actually reached the <li> — the chain is intact
  });

  // Scroll bug fix (owner report: "se rompe el scroll y no deja llegar a la
  // parte superior") — these wrappers exist ONLY to clip their rounded
  // corners/overflow, never to scroll: `overflow: hidden` is still a valid
  // target for a descendant's `scrollIntoView()`/`.focus()` call (confirmed
  // with a real browser — see `QuizBlockEditor.test.tsx`'s own header),
  // even though it has no visible scrollbar for a visitor to undo that with.
  // `overflow: clip` keeps the exact same visual clipping but can never be
  // scrolled programmatically.
  it('clips the focus-active <li> and its expanded-block wrapper with `overflow-clip`, never `overflow-hidden`', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1')]} initialExpanded={['b1']} />);
    const li = screen.getByTestId('block-b1').closest('li')!;
    expect(li.className).toContain('overflow-clip');
    expect(li.className).not.toContain('overflow-hidden');

    const expandedWrapper = screen.getByTestId('worksheet-zone-editor').closest('[class*="border-t"]')!;
    expect(expandedWrapper.className).toContain('overflow-clip');
    expect(expandedWrapper.className).not.toContain('overflow-hidden');
  });
});

describe('BlockList — rotation', () => {
  it('rotating right advances rotation by 90 and keeps zones (transformed)', () => {
    const zone: Zone = { id: 'z1', x: 0, y: 0, w: 0.1, h: 0.2, kind: 'text', answers: ['x'] };
    let latest: Block[] = [worksheetBlock('b1', { zones: [zone] })];
    function Wrapper() {
      const [blocks, setBlocks] = useState<Block[]>(latest);
      return (
        <BlockList
          lang="es"
          blocks={blocks}
          expandedBlockIds={new Set()}
          selectedZoneId={null}
          resolveImageUrl={(p) => p}
          onToggleExpand={() => {}}
          onSelectZone={() => {}}
          onBlocksChange={(next) => {
            latest = next;
            setBlocks(next);
          }}
        />
      );
    }
    render(<Wrapper />);
    fireEvent.click(screen.getByTestId('rotate-right-b1'));
    const rotated = latest[0] as WorksheetBlock;
    expect(rotated.rotation).toBe(90);
    expect(rotated.zones[0]).toMatchObject({ x: 0.8, y: 0, w: 0.2, h: 0.1 });
  });

  it('rotating left decreases rotation, wrapping at 0', () => {
    let latest: Block[] = [worksheetBlock('b1')];
    function Wrapper() {
      const [blocks, setBlocks] = useState<Block[]>(latest);
      return (
        <BlockList
          lang="es"
          blocks={blocks}
          expandedBlockIds={new Set()}
          selectedZoneId={null}
          resolveImageUrl={(p) => p}
          onToggleExpand={() => {}}
          onSelectZone={() => {}}
          onBlocksChange={(next) => {
            latest = next;
            setBlocks(next);
          }}
        />
      );
    }
    render(<Wrapper />);
    fireEvent.click(screen.getByTestId('rotate-left-b1'));
    expect((latest[0] as WorksheetBlock).rotation).toBe(270);
  });
});

describe('BlockList — delete with confirm', () => {
  it('requires a confirm step before removing a block', () => {
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

  it('accepting removes the block', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1')]} />);
    fireEvent.click(screen.getByTestId('delete-block-trigger'));
    fireEvent.click(screen.getByTestId('delete-confirm-accept'));
    expect(screen.queryByTestId('block-b1')).toBeNull();
    expect(screen.getByTestId('blocks-empty')).toBeTruthy();
  });
});
