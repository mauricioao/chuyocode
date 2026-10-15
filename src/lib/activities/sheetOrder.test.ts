import { describe, it, expect } from 'vitest';
import { moveBlockLeft, moveBlockRight, removeBlock } from './sheetOrder';
import type { Block, QuizBlock } from './blocks';

function block(id: string): QuizBlock {
  return { id, type: 'quiz', payload: { pools: {}, slots: [] } };
}

describe('moveBlockLeft', () => {
  it('swaps the block one position toward the start', () => {
    const blocks: Block[] = [block('a'), block('b'), block('c')];
    const next = moveBlockLeft(blocks, 'b');
    expect(next.map((b) => b.id)).toEqual(['b', 'a', 'c']);
  });

  it('returns the same reference when the block is already first', () => {
    const blocks: Block[] = [block('a'), block('b')];
    expect(moveBlockLeft(blocks, 'a')).toBe(blocks);
  });

  it('returns the same reference when the block id is missing', () => {
    const blocks: Block[] = [block('a'), block('b')];
    expect(moveBlockLeft(blocks, 'z')).toBe(blocks);
  });
});

describe('moveBlockRight', () => {
  it('swaps the block one position toward the end', () => {
    const blocks: Block[] = [block('a'), block('b'), block('c')];
    const next = moveBlockRight(blocks, 'b');
    expect(next.map((b) => b.id)).toEqual(['a', 'c', 'b']);
  });

  it('returns the same reference when the block is already last', () => {
    const blocks: Block[] = [block('a'), block('b')];
    expect(moveBlockRight(blocks, 'b')).toBe(blocks);
  });

  it('returns the same reference when the block id is missing', () => {
    const blocks: Block[] = [block('a'), block('b')];
    expect(moveBlockRight(blocks, 'z')).toBe(blocks);
  });
});

describe('removeBlock', () => {
  it('removes exactly the matching block, keeping the rest in order', () => {
    const blocks: Block[] = [block('a'), block('b'), block('c')];
    const next = removeBlock(blocks, 'b');
    expect(next.map((b) => b.id)).toEqual(['a', 'c']);
  });

  it('returns the same reference when the block id is missing', () => {
    const blocks: Block[] = [block('a'), block('b')];
    expect(removeBlock(blocks, 'z')).toBe(blocks);
  });

  it('can remove down to a single remaining block', () => {
    const blocks: Block[] = [block('a'), block('b')];
    const next = removeBlock(blocks, 'a');
    expect(next.map((b) => b.id)).toEqual(['b']);
  });
});
