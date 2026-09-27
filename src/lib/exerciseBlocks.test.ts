/**
 * `blocksForStep` grouping (openspec/changes/user-authored-exercises,
 * design.md §6, "Renderer integration"; specs/exercise-blocks/spec.md).
 *
 * Pure, deterministic, no React: walk `blocks` in order accumulating
 * non-row blocks; on reaching a row block, that buffer plus the row is the
 * group for that slot; trailing non-row blocks attach to the LAST group.
 */
import { describe, it, expect } from 'vitest';
import { blocksForStep } from './exerciseBlocks';
import type { Payload } from './exercisePayload';

/** Two slots, with leading context before the first row and trailing
 * context after the last row — the two edge cases the grouping must get
 * right. */
const TWO_SLOTS_WITH_BLOCKS: Payload = {
  pools: {},
  slots: [
    { id: 's1', label: 'The cat ___ on the mat', input: 'text', answer: ['sits'] },
    { id: 's2', label: 'The dog ___ in the yard', input: 'text', answer: ['runs'] },
  ],
  blocks: [
    { kind: 'prose', id: 'p1', text: 'Leading context before the first row.' },
    { kind: 'row', id: 'r1', slotId: 's1' },
    { kind: 'media', id: 'm1', image: 'https://cdn.test/cat.png' },
    { kind: 'row', id: 'r2', slotId: 's2' },
    { kind: 'prose', id: 'p2', text: 'Trailing context after the last row.' },
  ],
};

describe('blocksForStep', () => {
  it('attaches a leading non-row block to the first row it precedes', () => {
    expect(blocksForStep(TWO_SLOTS_WITH_BLOCKS, 0)).toEqual([
      { kind: 'prose', id: 'p1', text: 'Leading context before the first row.' },
      { kind: 'row', id: 'r1', slotId: 's1' },
    ]);
  });

  it('attaches a between-rows non-row block to the row that follows it, and a trailing block to the LAST group', () => {
    expect(blocksForStep(TWO_SLOTS_WITH_BLOCKS, 1)).toEqual([
      { kind: 'media', id: 'm1', image: 'https://cdn.test/cat.png' },
      { kind: 'row', id: 'r2', slotId: 's2' },
      { kind: 'prose', id: 'p2', text: 'Trailing context after the last row.' },
    ]);
  });

  it('returns an empty group for a step whose slot has no blocks assigned (defensive)', () => {
    const payload: Payload = {
      pools: {},
      slots: [{ id: 's1', label: 'L', input: 'text', answer: ['x'] }],
    };
    expect(blocksForStep(payload, 0)).toEqual([]);
  });

  it('returns an empty group when payload.blocks is absent — the legacy path', () => {
    const payload: Payload = {
      pools: {},
      slots: [{ id: 's1', label: 'L', input: 'text', answer: ['x'] }],
    };
    expect(blocksForStep(payload, 0)).toEqual([]);
  });

  it('returns an empty group for an out-of-range step, never throws', () => {
    expect(() => blocksForStep(TWO_SLOTS_WITH_BLOCKS, 99)).not.toThrow();
    expect(blocksForStep(TWO_SLOTS_WITH_BLOCKS, 99)).toEqual([]);
  });
});
