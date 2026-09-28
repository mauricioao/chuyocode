// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import BlockList from './BlockList';
import type { Block, WorksheetBlock, Zone } from '@/lib/activities/blocks';

afterEach(() => cleanup());

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
