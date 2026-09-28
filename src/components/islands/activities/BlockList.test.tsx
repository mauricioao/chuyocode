// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import BlockList from './BlockList';
import type { Block, WorksheetBlock } from '@/lib/activities/blocks';

afterEach(() => cleanup());

function worksheetBlock(id: string): WorksheetBlock {
  return {
    id,
    type: 'worksheet',
    rotation: 0,
    image: { path: `activity-uploads/u1/${id}.webp`, width: 800, height: 600 },
    zones: [],
  };
}

function Harness({ initialBlocks }: { initialBlocks: Block[] }) {
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  return (
    <BlockList
      lang="es"
      blocks={blocks}
      selectedBlockId={selectedBlockId}
      selectedZoneId={selectedZoneId}
      resolveImageUrl={(path) => `/preview?path=${path}`}
      onSelectBlock={setSelectedBlockId}
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
  });
});

describe('BlockList — rendering and selection', () => {
  it('renders a header per block, collapsed by default', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1'), worksheetBlock('b2')]} />);
    expect(screen.getByTestId('block-header-b1').textContent).toContain('Hoja de trabajo');
    expect(screen.queryByTestId('worksheet-zone-editor')).toBeNull();
  });

  it('expands the selected block to show its editor', () => {
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
});

describe('BlockList — reordering', () => {
  it('disables move-up on the first block and move-down on the last', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1'), worksheetBlock('b2')]} />);
    const upButtons = screen.getAllByLabelText('Subir bloque') as HTMLButtonElement[];
    const downButtons = screen.getAllByLabelText('Bajar bloque') as HTMLButtonElement[];
    expect(upButtons[0].disabled).toBe(true);
    expect(downButtons[1].disabled).toBe(true);
    expect(upButtons[1].disabled).toBe(false);
    expect(downButtons[0].disabled).toBe(false);
  });

  it('moves a block down, changing rendered order', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1'), worksheetBlock('b2')]} />);
    const downButtons = screen.getAllByLabelText('Bajar bloque');
    fireEvent.click(downButtons[0]);
    const ids = screen.getAllByTestId(/^block-header-/).map((el) => el.getAttribute('data-testid'));
    expect(ids).toEqual(['block-header-b2', 'block-header-b1']);
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

  it('accepting removes the block and clears its selection', () => {
    render(<Harness initialBlocks={[worksheetBlock('b1')]} />);
    fireEvent.click(screen.getByTestId('block-header-b1'));
    fireEvent.click(screen.getByTestId('delete-block-trigger'));
    fireEvent.click(screen.getByTestId('delete-confirm-accept'));
    expect(screen.queryByTestId('block-b1')).toBeNull();
    expect(screen.getByTestId('blocks-empty')).toBeTruthy();
  });
});
