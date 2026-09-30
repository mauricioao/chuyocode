import { describe, it, expect } from 'vitest';
import {
  deriveGameItems,
  availableGameModes,
  hasUniqueAnswers,
  shuffleWithSeed,
  seedFromString,
  type GameItem,
} from './gameModes';
import type { Payload } from '@/lib/exercisePayload';

function payloadWith(slots: Payload['slots'], pools: Payload['pools'] = {}): Payload {
  return { pools, slots };
}

describe('deriveGameItems', () => {
  it('derives a prompt/answer pair per slot, in authored order', () => {
    const payload = payloadWith([
      { id: 's1', label: 'The cat ___ on the mat.', input: 'text', answer: ['sits'] },
      { id: 's2', label: 'What color is the sky?', input: 'text', answer: ['blue'] },
    ]);

    expect(deriveGameItems(payload)).toEqual<GameItem[]>([
      { id: 's1', prompt: 'The cat ____ on the mat.', answer: 'sits' },
      { id: 's2', prompt: 'What color is the sky?', answer: 'blue' },
    ]);
  });

  it('renders the gap as a plain ____ regardless of how many underscores were authored', () => {
    const payload = payloadWith([
      { id: 's1', label: 'She _____ tired.', input: 'text', answer: ['is'] },
    ]);
    expect(deriveGameItems(payload)[0]?.prompt).toBe('She ____ tired.');
  });

  it('uses the label as-is when it has no gap', () => {
    const payload = payloadWith([
      { id: 's1', label: 'What did she say?', input: 'text', answer: ['Hello'] },
    ]);
    expect(deriveGameItems(payload)[0]?.prompt).toBe('What did she say?');
  });

  it('resolves a pool-backed answer id to its item text', () => {
    const payload = payloadWith(
      [{ id: 's1', label: 'Pick one: ___', input: 'choice', pool: 'p1', answer: ['i_cat'] }],
      { p1: [{ id: 'i_dog', text: 'dog' }, { id: 'i_cat', text: 'cat' }] },
    );
    expect(deriveGameItems(payload)[0]?.answer).toBe('cat');
  });

  it('falls back to the raw answer id when the pool item is missing (dangling reference)', () => {
    const payload = payloadWith(
      [{ id: 's1', label: 'Pick one: ___', input: 'choice', pool: 'p1', answer: ['i_missing'] }],
      { p1: [] },
    );
    expect(deriveGameItems(payload)[0]?.answer).toBe('i_missing');
  });

  it('falls back to a pool item media URL when it has no text', () => {
    const payload = payloadWith(
      [{ id: 's1', label: 'Pick one: ___', input: 'choice', pool: 'p1', answer: ['i_img'] }],
      { p1: [{ id: 'i_img', media: 'https://example.com/cat.png' }] },
    );
    expect(deriveGameItems(payload)[0]?.answer).toBe('https://example.com/cat.png');
  });

  it('uses only the FIRST accepted answer for a slot with several', () => {
    const payload = payloadWith([
      { id: 's1', label: 'The cat ___.', input: 'text', answer: ['sits', 'is sitting'] },
    ]);
    expect(deriveGameItems(payload)[0]?.answer).toBe('sits');
  });

  it('carries the explanation through when the slot has one', () => {
    const payload = payloadWith([
      { id: 's1', label: 'The cat ___.', input: 'text', answer: ['sits'], explanation: 'Present tense.' },
    ]);
    expect(deriveGameItems(payload)[0]?.explanation).toBe('Present tense.');
  });

  it('omits explanation when the slot has none', () => {
    const payload = payloadWith([{ id: 's1', label: 'x ___', input: 'text', answer: ['y'] }]);
    expect(deriveGameItems(payload)[0]).not.toHaveProperty('explanation');
  });

  it('skips a slot with no accepted answer yet (a mid-drafting payload)', () => {
    const payload = payloadWith([
      { id: 's1', label: 'x ___', input: 'text', answer: [] },
      { id: 's2', label: 'y ___', input: 'text', answer: ['z'] },
    ]);
    expect(deriveGameItems(payload)).toEqual([{ id: 's2', prompt: 'y ____', answer: 'z' }]);
  });

  it('returns an empty array for a payload with no slots', () => {
    expect(deriveGameItems(payloadWith([]))).toEqual([]);
  });
});

describe('hasUniqueAnswers', () => {
  it('is true when every answer differs', () => {
    const items: GameItem[] = [
      { id: '1', prompt: 'a', answer: 'cat' },
      { id: '2', prompt: 'b', answer: 'dog' },
    ];
    expect(hasUniqueAnswers(items)).toBe(true);
  });

  it('is false when two answers are identical', () => {
    const items: GameItem[] = [
      { id: '1', prompt: 'a', answer: 'cat' },
      { id: '2', prompt: 'b', answer: 'cat' },
    ];
    expect(hasUniqueAnswers(items)).toBe(false);
  });

  it('compares case-insensitively and trims whitespace', () => {
    const items: GameItem[] = [
      { id: '1', prompt: 'a', answer: 'Cat' },
      { id: '2', prompt: 'b', answer: '  cat  ' },
    ];
    expect(hasUniqueAnswers(items)).toBe(false);
  });

  it('is vacuously true for zero or one item', () => {
    expect(hasUniqueAnswers([])).toBe(true);
    expect(hasUniqueAnswers([{ id: '1', prompt: 'a', answer: 'cat' }])).toBe(true);
  });
});

describe('availableGameModes', () => {
  it('offers only quiz for zero items', () => {
    expect(availableGameModes([])).toEqual(['quiz']);
  });

  it('offers quiz + cards from one item, but not match', () => {
    const items: GameItem[] = [{ id: '1', prompt: 'a', answer: 'cat' }];
    expect(availableGameModes(items)).toEqual(['quiz', 'cards']);
  });

  it('offers quiz + cards for two items (still short of match)', () => {
    const items: GameItem[] = [
      { id: '1', prompt: 'a', answer: 'cat' },
      { id: '2', prompt: 'b', answer: 'dog' },
    ];
    expect(availableGameModes(items)).toEqual(['quiz', 'cards']);
  });

  it('offers all three modes from three items with unique answers', () => {
    const items: GameItem[] = [
      { id: '1', prompt: 'a', answer: 'cat' },
      { id: '2', prompt: 'b', answer: 'dog' },
      { id: '3', prompt: 'c', answer: 'bird' },
    ];
    expect(availableGameModes(items)).toEqual(['quiz', 'cards', 'match']);
  });

  it('withholds match from three items when two answers collide', () => {
    const items: GameItem[] = [
      { id: '1', prompt: 'a', answer: 'cat' },
      { id: '2', prompt: 'b', answer: 'cat' },
      { id: '3', prompt: 'c', answer: 'bird' },
    ];
    expect(availableGameModes(items)).toEqual(['quiz', 'cards']);
  });
});

describe('seedFromString', () => {
  it('is deterministic for the same input', () => {
    expect(seedFromString('block-1')).toBe(seedFromString('block-1'));
  });

  it('differs for different inputs (no collision for these cases)', () => {
    expect(seedFromString('block-1')).not.toBe(seedFromString('block-2'));
  });

  it('returns a non-negative integer', () => {
    const seed = seedFromString('anything');
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
  });
});

describe('shuffleWithSeed', () => {
  it('is deterministic: same items + same seed always produce the same order', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    expect(shuffleWithSeed(items, 42)).toEqual(shuffleWithSeed(items, 42));
  });

  it('produces a permutation — same elements, same length', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const shuffled = shuffleWithSeed(items, 7);
    expect(shuffled).toHaveLength(items.length);
    expect([...shuffled].sort()).toEqual([...items].sort());
  });

  it('different seeds tend to produce different orders', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    expect(shuffleWithSeed(items, 1)).not.toEqual(shuffleWithSeed(items, 2));
  });

  it('does not mutate the input array', () => {
    const items = ['a', 'b', 'c'];
    const copy = [...items];
    shuffleWithSeed(items, 5);
    expect(items).toEqual(copy);
  });

  it('returns the input unchanged for zero or one item', () => {
    expect(shuffleWithSeed([], 1)).toEqual([]);
    expect(shuffleWithSeed(['a'], 1)).toEqual(['a']);
  });
});
