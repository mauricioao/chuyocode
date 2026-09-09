/**
 * `drop` state tests — the behaviour a browser would show, proved without one.
 *
 * These cover the rules jsdom cannot: which tiles remain in the pool, what
 * happens when a box is already full, and that clearing a box gives its tile
 * back. Drag PHYSICS is deliberately not modelled here — see DropRenderer.test.
 */
import { describe, expect, it } from 'vitest';
import {
  availableTiles,
  claimedTileIds,
  clearTile,
  placeTile,
  placedTile,
} from './exerciseDrop';
import type { Payload, PoolItem, Slot } from './exercisePayload';

const items: PoolItem[] = [
  { id: 'i_olives', media: 'https://cdn/olives.jpg' },
  { id: 'i_honey', media: 'https://cdn/honey.jpg' },
  { id: 'i_bread', media: 'https://cdn/bread.jpg' },
];

const dropA: Slot = {
  id: 'olives_img',
  label: 'olives',
  input: 'drop',
  pool: 'food',
  answer: ['i_olives'],
};
const dropB: Slot = {
  id: 'honey_img',
  label: 'honey',
  input: 'drop',
  pool: 'food',
  answer: ['i_honey'],
};
/** Shares the SAME pool as the drop slots, on purpose — see the scoping test. */
const selectC: Slot = {
  id: 'olives_qty',
  label: 'olives',
  input: 'select',
  pool: 'food',
  answer: ['i_bread'],
};

const payload: Payload = {
  pools: { food: items },
  slots: [dropA, dropB, selectC],
};

describe('claimedTileIds', () => {
  it('reports tiles held by other drop slots', () => {
    expect(claimedTileIds(payload, { honey_img: ['i_honey'] }, 'olives_img')).toEqual([
      'i_honey',
    ]);
  });

  it('excludes the asking slot, so its own tile is not claimed against itself', () => {
    expect(
      claimedTileIds(payload, { olives_img: ['i_olives'] }, 'olives_img'),
    ).toEqual([]);
  });

  // A pool is SHARED and may back two mechanics. Counting a dropdown answer as a
  // consumed tile would delete a draggable from an unrelated question.
  it('ignores answers from non-drop slots sharing the same pool', () => {
    expect(claimedTileIds(payload, { olives_qty: ['i_bread'] }, 'olives_img')).toEqual(
      [],
    );
  });

  it('reports nothing when no slot has been answered', () => {
    expect(claimedTileIds(payload, {}, 'olives_img')).toEqual([]);
  });
});

describe('availableTiles', () => {
  it('offers the whole pool before anything is placed', () => {
    expect(availableTiles(items, [], []).map((i) => i.id)).toEqual([
      'i_olives',
      'i_honey',
      'i_bread',
    ]);
  });

  // THE CORE RULE: placing consumes. Without this a tile sits in the box and in
  // the pool at once and the learner can answer with it twice.
  it('removes a tile this slot holds, so it cannot be placed twice', () => {
    expect(availableTiles(items, ['i_olives'], []).map((i) => i.id)).toEqual([
      'i_honey',
      'i_bread',
    ]);
  });

  it('removes a tile another slot holds', () => {
    expect(availableTiles(items, [], ['i_honey']).map((i) => i.id)).toEqual([
      'i_olives',
      'i_bread',
    ]);
  });

  it('preserves the authored pool order, so tiles never move under the learner', () => {
    expect(availableTiles(items, ['i_honey'], []).map((i) => i.id)).toEqual([
      'i_olives',
      'i_bread',
    ]);
  });
});

describe('placedTile', () => {
  it('resolves the id in the box to its pool item', () => {
    expect(placedTile(items, ['i_honey'])?.id).toBe('i_honey');
  });

  it('is null for an empty box', () => {
    expect(placedTile(items, [])).toBeNull();
  });

  // Degrades like `getSlotItems` does for a missing pool: empty, never a throw.
  it('is null for an id that is in no pool', () => {
    expect(placedTile(items, ['i_ghost'])).toBeNull();
  });
});

describe('placeTile', () => {
  it('fills an empty box and displaces nothing', () => {
    expect(placeTile([], 'i_olives')).toEqual({
      value: ['i_olives'],
      displaced: null,
    });
  });

  // OCCUPIED-BOX RULE: the incoming tile wins, the resident returns to the pool.
  it('replaces the resident tile and reports it as displaced', () => {
    expect(placeTile(['i_olives'], 'i_honey')).toEqual({
      value: ['i_honey'],
      displaced: 'i_olives',
    });
  });

  // The displaced tile is back in the pool by ARITHMETIC, not by a second step:
  // it is no longer named by the slot, so nothing claims it.
  it('returns the displaced tile to the pool on the next derivation', () => {
    const next = placeTile(['i_olives'], 'i_honey');
    expect(availableTiles(items, next.value, []).map((i) => i.id)).toContain(
      'i_olives',
    );
  });

  it('treats re-placing the resident tile as a no-op with nothing displaced', () => {
    expect(placeTile(['i_olives'], 'i_olives')).toEqual({
      value: ['i_olives'],
      displaced: null,
    });
  });
});

describe('clearTile', () => {
  // `[]`, never `['']`: an empty-string id grades WRONG rather than unanswered.
  it('empties the box', () => {
    expect(clearTile()).toEqual([]);
  });

  it('gives the tile back to the pool', () => {
    expect(availableTiles(items, clearTile(), []).map((i) => i.id)).toEqual([
      'i_olives',
      'i_honey',
      'i_bread',
    ]);
  });
});
