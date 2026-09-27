/**
 * `authoringDraft.ts` — pure, no React (design.md §8). One behavior per
 * function, plus a full round trip through `draftToPayload`/`payloadToDraft`
 * and immutability checks on the two functions most likely to be called on
 * every keystroke (`setRowLabel`, `setSlotAnswer`).
 */
import { describe, expect, it } from 'vitest';
import type { Payload } from './exercisePayload';
import {
  addMediaBlock,
  addPoolItem,
  addProseBlock,
  addRowBlock,
  createEmptyDraft,
  draftToPayload,
  moveBlock,
  payloadToDraft,
  removeBlock,
  removePoolItem,
  setBlockAlt,
  setBlockAudio,
  setBlockImage,
  setBlockText,
  setPool,
  setPoolItemMedia,
  setPoolItemText,
  setRowLabel,
  setSlotAnswer,
  setSlotInput,
  setSlotPool,
  type Draft,
} from './authoringDraft';

const TWO_ROW_DRAFT: Draft = {
  pools: {},
  slots: [
    { id: 's1', label: 'The cat ___ on the mat', input: 'text', answer: ['sits'] },
    { id: 's2', label: 'The dog ___ in the yard', input: 'text', answer: ['runs'] },
  ],
  blocks: [
    { kind: 'row', id: 'r1', slotId: 's1' },
    { kind: 'row', id: 'r2', slotId: 's2' },
  ],
};

describe('createEmptyDraft', () => {
  it('is empty pools, slots and blocks', () => {
    expect(createEmptyDraft()).toEqual({ pools: {}, slots: [], blocks: [] });
  });
});

describe('payloadToDraft / draftToPayload — round trip', () => {
  it('round-trips a payload that already has blocks, verbatim', () => {
    const payload: Payload = {
      pools: { opts: [{ id: 'a', text: 'sit' }] },
      slots: [{ id: 's1', label: 'The cat ___', input: 'choice', pool: 'opts', answer: ['a'] }],
      blocks: [{ kind: 'row', id: 'r1', slotId: 's1' }],
    };

    const draft = payloadToDraft(payload);
    expect(draftToPayload(draft)).toEqual(payload);
  });

  it('carries payload.media through the round trip', () => {
    const payload: Payload = {
      media: { audio: 'https://cdn.sanity.io/a.mp3' },
      pools: {},
      slots: [{ id: 's1', label: 'sentence', input: 'text', answer: ['x'] }],
      blocks: [{ kind: 'row', id: 'r1', slotId: 's1' }],
    };

    expect(draftToPayload(payloadToDraft(payload))).toEqual(payload);
  });

  it('synthesizes one row block per slot when payload.blocks is absent', () => {
    const payload: Payload = {
      pools: {},
      slots: [
        { id: 's1', label: 'a', input: 'text', answer: ['x'] },
        { id: 's2', label: 'b', input: 'text', answer: ['y'] },
      ],
    };

    const draft = payloadToDraft(payload);
    expect(draft.blocks).toEqual([
      { kind: 'row', id: 'row-s1', slotId: 's1' },
      { kind: 'row', id: 'row-s2', slotId: 's2' },
    ]);
    // And that synthesized draft still converts back to a payload whose
    // blocks now exactly cover its slots — the invariant the whole model
    // depends on.
    expect(draftToPayload(draft).blocks).toHaveLength(2);
  });

  it('omits media on draftToPayload when the draft never set it', () => {
    const payload = draftToPayload(createEmptyDraft());
    expect(payload.media).toBeUndefined();
  });
});

describe('moveBlock', () => {
  it('moves a block earlier in the array', () => {
    const next = moveBlock(TWO_ROW_DRAFT, 1, 0);
    expect(next.blocks.map((b) => b.id)).toEqual(['r2', 'r1']);
  });

  it('moves a block later in the array', () => {
    const next = moveBlock(TWO_ROW_DRAFT, 0, 1);
    expect(next.blocks.map((b) => b.id)).toEqual(['r2', 'r1']);
  });

  it('clamps an out-of-range target index rather than throwing', () => {
    const next = moveBlock(TWO_ROW_DRAFT, 0, 99);
    expect(next.blocks.map((b) => b.id)).toEqual(['r2', 'r1']);
  });

  it('is a no-op for an out-of-range source index', () => {
    expect(moveBlock(TWO_ROW_DRAFT, 5, 0)).toBe(TWO_ROW_DRAFT);
  });

  it('never mutates the input draft', () => {
    const before = JSON.parse(JSON.stringify(TWO_ROW_DRAFT));
    moveBlock(TWO_ROW_DRAFT, 0, 1);
    expect(TWO_ROW_DRAFT).toEqual(before);
  });
});

describe('removeBlock', () => {
  it('removes a row block and its slot together', () => {
    const next = removeBlock(TWO_ROW_DRAFT, 'r1');
    expect(next.blocks.map((b) => b.id)).toEqual(['r2']);
    expect(next.slots.map((s) => s.id)).toEqual(['s2']);
  });

  it('removes a prose block without touching any slot', () => {
    const draft = addProseBlock(TWO_ROW_DRAFT, 'p1', 'context');
    const next = removeBlock(draft, 'p1');
    expect(next.blocks.map((b) => b.id)).toEqual(['r1', 'r2']);
    expect(next.slots).toHaveLength(2);
  });

  it('is a no-op for an unknown block id', () => {
    expect(removeBlock(TWO_ROW_DRAFT, 'nope')).toEqual(TWO_ROW_DRAFT);
  });
});

describe('addProseBlock / addMediaBlock / addRowBlock', () => {
  it('appends an empty prose block', () => {
    const next = addProseBlock(createEmptyDraft(), 'p1');
    expect(next.blocks).toEqual([{ kind: 'prose', id: 'p1', text: '' }]);
  });

  it('appends an empty media block', () => {
    const next = addMediaBlock(createEmptyDraft(), 'm1');
    expect(next.blocks).toEqual([{ kind: 'media', id: 'm1' }]);
  });

  it('appends a row block AND its slot together', () => {
    const next = addRowBlock(createEmptyDraft(), 'r1', 's1');
    expect(next.blocks).toEqual([{ kind: 'row', id: 'r1', slotId: 's1' }]);
    expect(next.slots).toEqual([{ id: 's1', label: '', input: 'text', answer: [] }]);
  });
});

describe('setBlockText / setBlockImage / setBlockAudio / setBlockAlt', () => {
  it('sets a prose block text', () => {
    const draft = addProseBlock(createEmptyDraft(), 'p1');
    expect(setBlockText(draft, 'p1', 'hello').blocks[0]).toEqual({
      kind: 'prose',
      id: 'p1',
      text: 'hello',
    });
  });

  it('is a no-op on a block of a different kind', () => {
    const draft = addMediaBlock(createEmptyDraft(), 'm1');
    expect(setBlockText(draft, 'm1', 'hello').blocks[0]).toEqual({ kind: 'media', id: 'm1' });
  });

  it('sets and clears a media block image', () => {
    const draft = addMediaBlock(createEmptyDraft(), 'm1');
    const withImage = setBlockImage(draft, 'm1', 'https://cdn.sanity.io/a.png');
    expect(withImage.blocks[0]).toEqual({
      kind: 'media',
      id: 'm1',
      image: 'https://cdn.sanity.io/a.png',
    });
    expect(setBlockImage(withImage, 'm1', undefined).blocks[0]).toEqual({
      kind: 'media',
      id: 'm1',
    });
  });

  it('sets and clears a media block audio', () => {
    const draft = addMediaBlock(createEmptyDraft(), 'm1');
    const withAudio = setBlockAudio(draft, 'm1', 'https://cdn.sanity.io/a.mp3');
    expect(withAudio.blocks[0]).toMatchObject({ audio: 'https://cdn.sanity.io/a.mp3' });
    expect(setBlockAudio(withAudio, 'm1', undefined).blocks[0]).toEqual({
      kind: 'media',
      id: 'm1',
    });
  });

  it('sets and clears a media block alt', () => {
    const draft = addMediaBlock(createEmptyDraft(), 'm1');
    const withAlt = setBlockAlt(draft, 'm1', 'a cat');
    expect(withAlt.blocks[0]).toMatchObject({ alt: 'a cat' });
    expect(setBlockAlt(withAlt, 'm1', undefined).blocks[0]).toEqual({ kind: 'media', id: 'm1' });
  });
});

describe('setRowLabel', () => {
  it('replaces the slot label', () => {
    const next = setRowLabel(TWO_ROW_DRAFT, 's1', 'A new ___ sentence');
    expect(next.slots.find((s) => s.id === 's1')?.label).toBe('A new ___ sentence');
  });

  it('leaves every other slot untouched', () => {
    const next = setRowLabel(TWO_ROW_DRAFT, 's1', 'changed');
    expect(next.slots.find((s) => s.id === 's2')).toEqual(TWO_ROW_DRAFT.slots[1]);
  });

  it('never mutates the input draft', () => {
    const before = JSON.parse(JSON.stringify(TWO_ROW_DRAFT));
    setRowLabel(TWO_ROW_DRAFT, 's1', 'changed');
    expect(TWO_ROW_DRAFT).toEqual(before);
  });
});

describe('setSlotInput / setSlotPool', () => {
  it('changes a slot mechanic', () => {
    const next = setSlotInput(TWO_ROW_DRAFT, 's1', 'choice');
    expect(next.slots.find((s) => s.id === 's1')?.input).toBe('choice');
  });

  it('sets and clears a slot pool', () => {
    const withPool = setSlotPool(TWO_ROW_DRAFT, 's1', 'opts');
    expect(withPool.slots.find((s) => s.id === 's1')?.pool).toBe('opts');
    expect(setSlotPool(withPool, 's1', undefined).slots.find((s) => s.id === 's1')?.pool).toBeUndefined();
  });
});

describe('setSlotAnswer', () => {
  it('replaces the accepted answers for one slot', () => {
    const next = setSlotAnswer(TWO_ROW_DRAFT, 's1', ['sits', 'is sitting']);
    expect(next.slots.find((s) => s.id === 's1')?.answer).toEqual(['sits', 'is sitting']);
  });

  it('clears a slot answer to empty', () => {
    const next = setSlotAnswer(TWO_ROW_DRAFT, 's1', []);
    expect(next.slots.find((s) => s.id === 's1')?.answer).toEqual([]);
  });

  it('leaves every other slot untouched', () => {
    const next = setSlotAnswer(TWO_ROW_DRAFT, 's1', ['new']);
    expect(next.slots.find((s) => s.id === 's2')).toEqual(TWO_ROW_DRAFT.slots[1]);
  });

  it('never mutates the input draft', () => {
    const before = JSON.parse(JSON.stringify(TWO_ROW_DRAFT));
    setSlotAnswer(TWO_ROW_DRAFT, 's1', ['new']);
    expect(TWO_ROW_DRAFT).toEqual(before);
  });
});

describe('setPool / addPoolItem / removePoolItem / setPoolItemText / setPoolItemMedia', () => {
  it('creates a new named pool', () => {
    const next = setPool(createEmptyDraft(), 'opts', [{ id: 'a', text: 'sit' }]);
    expect(next.pools.opts).toEqual([{ id: 'a', text: 'sit' }]);
  });

  it('appends an item to an existing pool', () => {
    const draft = setPool(createEmptyDraft(), 'opts', [{ id: 'a', text: 'sit' }]);
    const next = addPoolItem(draft, 'opts', { id: 'b', text: 'sits' });
    expect(next.pools.opts).toEqual([{ id: 'a', text: 'sit' }, { id: 'b', text: 'sits' }]);
  });

  it('creates the pool when adding to one that does not exist yet', () => {
    const next = addPoolItem(createEmptyDraft(), 'opts', { id: 'a', text: 'sit' });
    expect(next.pools.opts).toEqual([{ id: 'a', text: 'sit' }]);
  });

  it('removes a pool item by id', () => {
    const draft = setPool(createEmptyDraft(), 'opts', [
      { id: 'a', text: 'sit' },
      { id: 'b', text: 'sits' },
    ]);
    expect(removePoolItem(draft, 'opts', 'a').pools.opts).toEqual([{ id: 'b', text: 'sits' }]);
  });

  it('is a no-op removing from a pool that does not exist', () => {
    const draft = createEmptyDraft();
    expect(removePoolItem(draft, 'opts', 'a')).toEqual(draft);
  });

  it('replaces one pool item text', () => {
    const draft = setPool(createEmptyDraft(), 'opts', [{ id: 'a', text: 'sit' }]);
    expect(setPoolItemText(draft, 'opts', 'a', 'sitting').pools.opts).toEqual([
      { id: 'a', text: 'sitting' },
    ]);
  });

  it('sets and clears one pool item media', () => {
    const draft = setPool(createEmptyDraft(), 'opts', [{ id: 'a', text: 'sit' }]);
    const withMedia = setPoolItemMedia(draft, 'opts', 'a', 'https://cdn.sanity.io/a.png');
    expect(withMedia.pools.opts).toEqual([
      { id: 'a', text: 'sit', media: 'https://cdn.sanity.io/a.png' },
    ]);
    expect(setPoolItemMedia(withMedia, 'opts', 'a', undefined).pools.opts).toEqual([
      { id: 'a', text: 'sit' },
    ]);
  });
});
