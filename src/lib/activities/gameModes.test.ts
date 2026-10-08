import { describe, it, expect } from 'vitest';
import {
  deriveGameItems,
  availableGameModes,
  hasUniqueAnswers,
  shuffleWithSeed,
  seedFromString,
  isSingleWord,
  anagramEligible,
  hangmanEligible,
  reorderEligible,
  trueFalseEligibleCount,
  deriveTrueFalseItems,
  initialGameMode,
  deriveGroupSortGroups,
  groupSortPoolName,
  modesForBlock,
  TEMPLATE_GAME_SWITCHING_ENABLED,
  type GameItem,
  type GameMode,
  type TrueFalseItem,
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

// Multi-word answers throughout this describe block, deliberately: they are
// never eligible for anagram/hangman (`isSingleWord` requires one letters-only
// word), which keeps these assertions about cards/match/speak/wheel/openbox
// from also having to account for the two single-word-only modes. Those two
// get their own dedicated tests below. Being multi-word also makes every one
// of them `reorder`-eligible (>= 2 words) — so `reorder` shows up in each
// non-empty expectation below, right alongside the others.
describe('availableGameModes', () => {
  it('offers only quiz for zero items', () => {
    expect(availableGameModes([])).toEqual(['quiz']);
  });

  it('offers quiz + cards + reorder + speak from one item, but not match/wheel/openbox', () => {
    const items: GameItem[] = [{ id: '1', prompt: 'a', answer: 'a red cat' }];
    expect(availableGameModes(items)).toEqual(['quiz', 'cards', 'reorder', 'speak']);
  });

  it('offers quiz + cards + reorder + speak + wheel + openbox for two items (still short of match)', () => {
    const items: GameItem[] = [
      { id: '1', prompt: 'a', answer: 'a red cat' },
      { id: '2', prompt: 'b', answer: 'a brown dog' },
    ];
    expect(availableGameModes(items)).toEqual(['quiz', 'cards', 'reorder', 'speak', 'wheel', 'openbox']);
  });

  it('offers match too from three items with unique answers', () => {
    const items: GameItem[] = [
      { id: '1', prompt: 'a', answer: 'a red cat' },
      { id: '2', prompt: 'b', answer: 'a brown dog' },
      { id: '3', prompt: 'c', answer: 'a blue bird' },
    ];
    expect(availableGameModes(items)).toEqual(['quiz', 'cards', 'match', 'reorder', 'speak', 'wheel', 'openbox']);
  });

  it('withholds match from three items when two answers collide', () => {
    const items: GameItem[] = [
      { id: '1', prompt: 'a', answer: 'a red cat' },
      { id: '2', prompt: 'b', answer: 'a red cat' },
      { id: '3', prompt: 'c', answer: 'a blue bird' },
    ];
    expect(availableGameModes(items)).toEqual(['quiz', 'cards', 'reorder', 'speak', 'wheel', 'openbox']);
  });

  it('withholds reorder when every answer is a single word', () => {
    const items: GameItem[] = [
      { id: '1', prompt: 'a', answer: 'cat' },
      { id: '2', prompt: 'b', answer: 'dog' },
    ];
    expect(availableGameModes(items)).not.toContain('reorder');
  });
});

describe('initialGameMode (template plumbing, build item 2)', () => {
  const eligibleForMatch: GameItem[] = [
    { id: '1', prompt: 'a', answer: 'a red cat' },
    { id: '2', prompt: 'b', answer: 'a brown dog' },
    { id: '3', prompt: 'c', answer: 'a blue bird' },
  ];
  const tooFewForMatch: GameItem[] = [
    { id: '1', prompt: 'a', answer: 'a red cat' },
    { id: '2', prompt: 'b', answer: 'a brown dog' },
  ];

  it('starts in quiz with no template ("Básico")', () => {
    expect(initialGameMode(undefined, eligibleForMatch)).toBe('quiz');
  });

  it('starts in match for the match template, when eligible', () => {
    expect(initialGameMode('match', eligibleForMatch)).toBe('match');
  });

  it('falls back to quiz for the match template when not (yet) eligible', () => {
    expect(initialGameMode('match', tooFewForMatch)).toBe('quiz');
  });

  it('falls back to quiz for the groupsort template without a payload (no groups to check)', () => {
    expect(initialGameMode('groupsort', eligibleForMatch)).toBe('quiz');
  });

  it('starts in groupsort for the groupsort template, when the payload has 2+ eligible groups', () => {
    const payload = payloadWith(
      [
        { id: 'g1', label: 'Animals', input: 'group', pool: 'p1', answer: ['dog', 'cat'] },
        { id: 'g2', label: 'Food', input: 'group', pool: 'p1', answer: ['bread', 'rice'] },
      ],
      { p1: [{ id: 'dog', text: 'dog' }, { id: 'cat', text: 'cat' }, { id: 'bread', text: 'bread' }, { id: 'rice', text: 'rice' }] },
    );
    expect(initialGameMode('groupsort', eligibleForMatch, payload)).toBe('groupsort');
  });

  it('falls back to quiz for the cloze template without a payload (no drop-gap slots to check)', () => {
    expect(initialGameMode('cloze', eligibleForMatch)).toBe('quiz');
  });

  it('starts in cloze for the cloze template, when the payload has a drop-gap slot', () => {
    const payload = payloadWith([
      { id: 's1', label: 'She ___ to school.', input: 'drop', pool: 'p1', answer: ['goes'] },
    ], { p1: [{ id: 'goes', text: 'goes' }] });
    expect(initialGameMode('cloze', eligibleForMatch, payload)).toBe('cloze');
  });

  it('starts in reorder for the reorder template, when eligible', () => {
    // `eligibleForMatch`'s own answers are all multi-word, so they are
    // `reorder`-eligible too (>= 2 words) — reused here rather than a
    // separate fixture.
    expect(initialGameMode('reorder', eligibleForMatch)).toBe('reorder');
  });

  it('falls back to quiz for the reorder template when not (yet) eligible', () => {
    const singleWordItems: GameItem[] = [{ id: '1', prompt: 'a', answer: 'cat' }];
    expect(initialGameMode('reorder', singleWordItems)).toBe('quiz');
  });

  it('offers anagram/hangman only once an eligible single-word answer exists', () => {
    const items: GameItem[] = [
      { id: '1', prompt: 'a', answer: 'cat' },
      { id: '2', prompt: 'b', answer: 'a long phrase' },
    ];
    expect(availableGameModes(items)).toContain('anagram');
    expect(availableGameModes(items)).toContain('hangman');
  });

  it('withholds anagram/hangman when no answer is a single eligible word', () => {
    const items: GameItem[] = [
      { id: '1', prompt: 'a', answer: 'two words' },
      { id: '2', prompt: 'b', answer: 'ok' }, // too short
    ];
    const modes = availableGameModes(items);
    expect(modes).not.toContain('anagram');
    expect(modes).not.toContain('hangman');
  });

  it('withholds truefalse without a payload, even with enough items', () => {
    const items: GameItem[] = [
      { id: '1', prompt: 'a', answer: 'cat' },
      { id: '2', prompt: 'b', answer: 'dog' },
    ];
    expect(availableGameModes(items)).not.toContain('truefalse');
  });

  it('offers truefalse once the payload has 2+ eligible slots', () => {
    const payload = payloadWith(
      [
        { id: 's1', label: 'Pick: ___', input: 'choice', pool: 'p1', answer: ['cat'] },
        { id: 's2', label: 'Pick: ___', input: 'choice', pool: 'p1', answer: ['dog'] },
      ],
      { p1: [{ id: 'cat', text: 'cat' }, { id: 'dog', text: 'dog' }, { id: 'bird', text: 'bird' }] },
    );
    const items = deriveGameItems(payload);
    expect(availableGameModes(items, payload)).toContain('truefalse');
  });

  it('withholds cloze without a payload, even with drop-eligible-looking items', () => {
    const items: GameItem[] = [{ id: '1', prompt: 'a', answer: 'cat' }];
    expect(availableGameModes(items)).not.toContain('cloze');
  });

  it('withholds cloze when the payload has no drop-gap slot', () => {
    const payload = payloadWith([{ id: 's1', label: 'What color?', input: 'text', answer: ['blue'] }]);
    expect(availableGameModes([], payload)).not.toContain('cloze');
  });

  it('offers cloze once the payload has >= 1 drop-gap slot', () => {
    const payload = payloadWith(
      [{ id: 's1', label: 'She ___ to school.', input: 'drop', pool: 'p1', answer: ['goes'] }],
      { p1: [{ id: 'goes', text: 'goes' }] },
    );
    expect(availableGameModes([], payload)).toContain('cloze');
  });

  it('withholds groupsort without a payload', () => {
    expect(availableGameModes([])).not.toContain('groupsort');
  });

  it('withholds groupsort with fewer than 2 groups', () => {
    const payload = payloadWith(
      [{ id: 'g1', label: 'Animals', input: 'group', pool: 'p1', answer: ['dog', 'cat'] }],
      { p1: [{ id: 'dog', text: 'dog' }, { id: 'cat', text: 'cat' }] },
    );
    expect(availableGameModes([], payload)).not.toContain('groupsort');
  });

  it('withholds groupsort when any group has fewer than 2 items', () => {
    const payload = payloadWith(
      [
        { id: 'g1', label: 'Animals', input: 'group', pool: 'p1', answer: ['dog', 'cat'] },
        { id: 'g2', label: 'Food', input: 'group', pool: 'p1', answer: ['bread'] },
      ],
      { p1: [{ id: 'dog', text: 'dog' }, { id: 'cat', text: 'cat' }, { id: 'bread', text: 'bread' }] },
    );
    expect(availableGameModes([], payload)).not.toContain('groupsort');
  });

  it('offers groupsort once every group has >= 2 items and there are >= 2 groups', () => {
    const payload = payloadWith(
      [
        { id: 'g1', label: 'Animals', input: 'group', pool: 'p1', answer: ['dog', 'cat'] },
        { id: 'g2', label: 'Food', input: 'group', pool: 'p1', answer: ['bread', 'rice'] },
      ],
      { p1: [{ id: 'dog', text: 'dog' }, { id: 'cat', text: 'cat' }, { id: 'bread', text: 'bread' }, { id: 'rice', text: 'rice' }] },
    );
    expect(availableGameModes([], payload)).toContain('groupsort');
  });
});

describe('deriveGroupSortGroups / groupSortPoolName', () => {
  it('derives one group per "group"-mechanic slot, in authored order, ignoring any other slot', () => {
    const payload = payloadWith([
      { id: 'q1', label: 'Básico question', input: 'text', answer: ['x'] },
      { id: 'g1', label: 'Animals', input: 'group', pool: 'p1', answer: ['dog', 'cat'] },
      { id: 'g2', label: 'Food', input: 'group', pool: 'p1', answer: ['bread'] },
    ]);
    expect(deriveGroupSortGroups(payload)).toEqual([
      { id: 'g1', label: 'Animals', itemIds: ['dog', 'cat'] },
      { id: 'g2', label: 'Food', itemIds: ['bread'] },
    ]);
  });

  it('resolves the shared pool name from the first group slot', () => {
    const payload = payloadWith([
      { id: 'g1', label: 'Animals', input: 'group', pool: 'p1', answer: ['dog'] },
    ]);
    expect(groupSortPoolName(payload)).toBe('p1');
  });

  it('is undefined for a payload with no group slot yet', () => {
    expect(groupSortPoolName(payloadWith([]))).toBeUndefined();
  });
});

describe('modesForBlock', () => {
  const allModes: GameMode[] = [
    'quiz',
    'cards',
    'match',
    'speak',
    'wheel',
    'anagram',
    'hangman',
    'openbox',
    'groupsort',
  ];

  it('TEMPLATE_GAME_SWITCHING_ENABLED is off (owner spec, "no combinemos") — one template, one game', () => {
    expect(TEMPLATE_GAME_SWITCHING_ENABLED).toBe(false);
  });

  it('ONE TEMPLATE, ONE GAME: collapses a templated block to its own single game when eligible', () => {
    expect(modesForBlock(allModes, 'match')).toEqual(['match']);
    expect(modesForBlock(allModes, 'groupsort')).toEqual(['groupsort']);
    // 'reorder'/'cloze' are not themselves in `allModes` above ('reorder' is
    // derived separately via `reorderEligible`, 'cloze' via `payload`-aware
    // `clozeEligibleCount`) — exercised on their own lists.
    expect(modesForBlock(['quiz', 'reorder'], 'reorder')).toEqual(['reorder']);
    expect(modesForBlock(['quiz', 'cloze'], 'cloze')).toEqual(['cloze']);
  });

  it('falls back to quiz alone when the template\'s own game is not yet eligible for the content', () => {
    const noMatch: GameMode[] = ['quiz', 'cards', 'speak'];
    expect(modesForBlock(noMatch, 'match')).toEqual(['quiz']);
  });

  it('leaves Básico (undefined) completely unrestricted', () => {
    expect(modesForBlock(allModes, undefined)).toEqual(allModes);
  });
});

describe('isSingleWord', () => {
  it('accepts a plain letters-only word within range', () => {
    expect(isSingleWord('cat', 3, 12)).toBe(true);
  });

  it('rejects a phrase with a space', () => {
    expect(isSingleWord('a cat', 3, 12)).toBe(false);
  });

  it('rejects words outside the length range', () => {
    expect(isSingleWord('ok', 3, 12)).toBe(false);
    expect(isSingleWord('a'.repeat(13), 3, 12)).toBe(false);
  });

  it('rejects non-letter characters', () => {
    expect(isSingleWord('cat9', 3, 12)).toBe(false);
    expect(isSingleWord("can't", 3, 12)).toBe(false);
  });

  it('trims surrounding whitespace before checking', () => {
    expect(isSingleWord('  cat  ', 3, 12)).toBe(true);
  });
});

describe('anagramEligible / hangmanEligible', () => {
  const items: GameItem[] = [
    { id: '1', prompt: 'a', answer: 'cat' },
    { id: '2', prompt: 'b', answer: 'a long phrase' },
    { id: '3', prompt: 'c', answer: 'butterfly' }, // 9 letters: eligible for both
  ];

  it('keeps only single-word answers within the anagram length range', () => {
    expect(anagramEligible(items).map((i) => i.id)).toEqual(['1', '3']);
  });

  it('keeps only single-word answers within the (longer) hangman length range', () => {
    expect(hangmanEligible(items).map((i) => i.id)).toEqual(['1', '3']);
  });
});

describe('reorderEligible', () => {
  it('keeps only answers of 2 or more words', () => {
    const items: GameItem[] = [
      { id: '1', prompt: 'a', answer: 'cat' },
      { id: '2', prompt: 'b', answer: 'a long phrase' },
      { id: '3', prompt: 'c', answer: 'two words' },
    ];
    expect(reorderEligible(items).map((i) => i.id)).toEqual(['2', '3']);
  });

  it('ignores extra whitespace when counting words', () => {
    const items: GameItem[] = [{ id: '1', prompt: 'a', answer: '  two   words  ' }];
    expect(reorderEligible(items)).toHaveLength(1);
  });

  it('keeps zero for an empty list', () => {
    expect(reorderEligible([])).toEqual([]);
  });
});

describe('trueFalseEligibleCount / deriveTrueFalseItems', () => {
  it('counts zero for a payload with no pool-backed slots', () => {
    const payload = payloadWith([{ id: 's1', label: 'The cat ___.', input: 'text', answer: ['sits'] }]);
    expect(trueFalseEligibleCount(payload)).toBe(0);
    expect(deriveTrueFalseItems(payload, 1)).toEqual([]);
  });

  it('excludes a slot whose label has no gap to fill', () => {
    const payload = payloadWith(
      [{ id: 's1', label: 'Pick one', input: 'choice', pool: 'p1', answer: ['cat'] }],
      { p1: [{ id: 'cat', text: 'cat' }, { id: 'dog', text: 'dog' }] },
    );
    expect(trueFalseEligibleCount(payload)).toBe(0);
  });

  it('excludes a slot whose pool has no other option to use as a wrong filler', () => {
    const payload = payloadWith(
      [{ id: 's1', label: 'Pick: ___', input: 'choice', pool: 'p1', answer: ['cat'] }],
      { p1: [{ id: 'cat', text: 'cat' }] },
    );
    expect(trueFalseEligibleCount(payload)).toBe(0);
  });

  it('counts every slot with a gap and a wrong option', () => {
    const payload = payloadWith(
      [
        { id: 's1', label: 'Pick: ___', input: 'choice', pool: 'p1', answer: ['cat'] },
        { id: 's2', label: 'Pick: ___', input: 'choice', pool: 'p1', answer: ['dog'] },
      ],
      { p1: [{ id: 'cat', text: 'cat' }, { id: 'dog', text: 'dog' }] },
    );
    expect(trueFalseEligibleCount(payload)).toBe(2);
  });

  it('fills the gap with the correct answer when seeded true, marking isTrue', () => {
    const payload = payloadWith(
      [{ id: 's1', label: 'The animal is a ___.', input: 'choice', pool: 'p1', answer: ['cat'] }],
      { p1: [{ id: 'cat', text: 'cat' }, { id: 'dog', text: 'dog' }] },
    );
    // Find a seed that lands on isTrue: true (deterministic once found).
    const trueSeed = [...Array(50).keys()].find((s) => deriveTrueFalseItems(payload, s)[0]?.isTrue === true)!;
    const item = deriveTrueFalseItems(payload, trueSeed)[0]!;
    expect(item.isTrue).toBe(true);
    expect(item.statement).toBe('The animal is a cat.');
  });

  it('fills the gap with a wrong pool option when seeded false, marking isTrue false', () => {
    const payload = payloadWith(
      [{ id: 's1', label: 'The animal is a ___.', input: 'choice', pool: 'p1', answer: ['cat'] }],
      { p1: [{ id: 'cat', text: 'cat' }, { id: 'dog', text: 'dog' }] },
    );
    const falseSeed = [...Array(50).keys()].find((s) => deriveTrueFalseItems(payload, s)[0]?.isTrue === false)!;
    const item = deriveTrueFalseItems(payload, falseSeed)[0]!;
    expect(item.isTrue).toBe(false);
    expect(item.statement).toBe('The animal is a dog.');
  });

  it('is deterministic for the same payload and seed', () => {
    const payload = payloadWith(
      [{ id: 's1', label: 'Pick: ___', input: 'choice', pool: 'p1', answer: ['cat'] }],
      { p1: [{ id: 'cat', text: 'cat' }, { id: 'dog', text: 'dog' }] },
    );
    expect(deriveTrueFalseItems(payload, 7)).toEqual<TrueFalseItem[]>(deriveTrueFalseItems(payload, 7));
  });

  it('skips ineligible slots but still derives eligible ones, in authored order', () => {
    const payload = payloadWith(
      [
        { id: 's1', label: 'No gap here', input: 'text', answer: ['x'] },
        { id: 's2', label: 'Pick: ___', input: 'choice', pool: 'p1', answer: ['cat'] },
      ],
      { p1: [{ id: 'cat', text: 'cat' }, { id: 'dog', text: 'dog' }] },
    );
    expect(deriveTrueFalseItems(payload, 1).map((i) => i.id)).toEqual(['s2']);
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
