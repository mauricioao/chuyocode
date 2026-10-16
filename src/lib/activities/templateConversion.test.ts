import { describe, it, expect } from 'vitest';
import { parseBlocks } from './blocks';
import type { QuizBlock, QuizTemplate } from './blocks';
import type { Payload } from '../exercisePayload';
import { conversionOptions, convertBlock, MOLDS, type Mold } from './templateConversion';
import { payloadToDraft } from '../authoringDraft';
import { applyClozeSentenceText, applyDistractorsText, deriveClozeSentences } from './clozeSentences';
import { deriveGroupSortRows } from './groupSort';
import { createEmptyDraft, draftToPayload, type Draft } from '../authoringDraft';
import { uploadPath } from './paths';

function counter(prefix: string) {
  let n = 0;
  return (p: string) => {
    n += 1;
    return `${prefix}-${p}-${n}`;
  };
}

function quizBlock(template: QuizTemplate | undefined, payload: Payload, id = 'b1'): QuizBlock {
  const block: QuizBlock = { id, type: 'quiz', payload };
  if (template) block.template = template;
  return block;
}

const EMPTY_PAYLOAD: Payload = { pools: {}, slots: [] };

// --- Básico ("Varios juegos") fixtures ---------------------------------

/** Two plain text questions; the first has an extra accepted answer. */
const BASIC_TEXT_PAYLOAD: Payload = {
  pools: {},
  slots: [
    { id: 's1', label: 'Capital of France', input: 'text', answer: ['Paris', 'paris'] },
    { id: 's2', label: 'Capital of Spain', input: 'text', answer: ['Madrid'] },
  ],
  blocks: [
    { kind: 'row', id: 'row-s1', slotId: 's1' },
    { kind: 'row', id: 'row-s2', slotId: 's2' },
  ],
};

/** One choice question with 2 distractors beyond its own correct answer. */
const BASIC_CHOICE_PAYLOAD: Payload = {
  pools: { p1: [{ id: 'o1', text: 'Paris' }, { id: 'o2', text: 'Berlin' }, { id: 'o3', text: 'Rome' }] },
  slots: [{ id: 's1', label: 'Capital of France', input: 'choice', pool: 'p1', answer: ['o1'] }],
  blocks: [{ kind: 'row', id: 'row-s1', slotId: 's1' }],
};

// --- match fixtures -----------------------------------------------------

const MATCH_NO_REPEATS_PAYLOAD: Payload = {
  pools: {},
  slots: [
    { id: 's1', label: 'dog', input: 'text', answer: ['perro'] },
    { id: 's2', label: 'cat', input: 'text', answer: ['gato'] },
    { id: 's3', label: 'bird', input: 'text', answer: ['pájaro'] },
  ],
  blocks: [
    { kind: 'row', id: 'row-s1', slotId: 's1' },
    { kind: 'row', id: 'row-s2', slotId: 's2' },
    { kind: 'row', id: 'row-s3', slotId: 's3' },
  ],
};

const MATCH_WITH_REPEATS_PAYLOAD: Payload = {
  pools: {},
  slots: [
    { id: 's1', label: 'cat', input: 'text', answer: ['Animals'] },
    { id: 's2', label: 'dog', input: 'text', answer: ['Animals'] },
    { id: 's3', label: 'car', input: 'text', answer: ['Vehicles'] },
    { id: 's4', label: 'bike', input: 'text', answer: ['Vehicles'] },
    { id: 's5', label: 'apple', input: 'text', answer: ['Fruits'] },
  ],
  blocks: [
    { kind: 'row', id: 'row-s1', slotId: 's1' },
    { kind: 'row', id: 'row-s2', slotId: 's2' },
    { kind: 'row', id: 'row-s3', slotId: 's3' },
    { kind: 'row', id: 'row-s4', slotId: 's4' },
    { kind: 'row', id: 'row-s5', slotId: 's5' },
  ],
};

// --- reorder fixtures -----------------------------------------------------

const REORDER_PAYLOAD: Payload = {
  pools: {},
  slots: [
    { id: 's1', label: 'I like cats', input: 'text', answer: ['I like cats'] },
    { id: 's2', label: '   ', input: 'text', answer: [] }, // whitespace-only sentence
  ],
  blocks: [
    { kind: 'row', id: 'row-s1', slotId: 's1' },
    { kind: 'row', id: 'row-s2', slotId: 's2' },
  ],
};

// --- groupsort fixtures -----------------------------------------------------

const GROUPSORT_POOL = 'b1-groupsort-pool';

const GROUPSORT_PAYLOAD: Payload = {
  pools: {
    [GROUPSORT_POOL]: [
      { id: 'i1', text: 'cat' },
      { id: 'i2', text: 'dog' },
      { id: 'i3', text: 'red' },
    ],
  },
  slots: [
    { id: 'g1', label: 'Animals', input: 'group', pool: GROUPSORT_POOL, answer: ['i1', 'i2'] },
    { id: 'g2', label: 'Colors', input: 'group', pool: GROUPSORT_POOL, answer: ['i3'] },
  ],
  blocks: [
    { kind: 'row', id: 'row-g1', slotId: 'g1' },
    { kind: 'row', id: 'row-g2', slotId: 'g2' },
  ],
};

// --- cloze fixture, built through the real authoring helpers -----------

const CLOZE_POOL = 'b1-cloze-pool';

function buildClozePayload(): Payload {
  const mint = counter('cz');
  let draft: Draft = createEmptyDraft();
  draft = applyClozeSentenceText(draft, 0, 'I [was] travelling when I [received] a phone call.', CLOZE_POOL, mint);
  draft = applyClozeSentenceText(draft, 1, 'She [is] my teacher.', CLOZE_POOL, mint);
  draft = applyDistractorsText(draft, CLOZE_POOL, 'extra1, extra2', mint);
  return draftToPayload(draft);
}

const CLOZE_PAYLOAD = buildClozePayload();

describe('conversionOptions', () => {
  it('lists exactly the 5 molds, in gallery order', () => {
    const opts = conversionOptions(quizBlock(undefined, BASIC_TEXT_PAYLOAD));
    expect(opts.map((o) => o.template)).toEqual(MOLDS);
  });

  it('marks exactly one option "current", matching the block\'s own template', () => {
    for (const template of [undefined, 'match', 'reorder', 'cloze', 'groupsort'] as const) {
      const opts = conversionOptions(quizBlock(template, EMPTY_PAYLOAD));
      const current = opts.filter((o) => o.current);
      expect(current).toHaveLength(1);
      expect(current[0]!.template).toBe(template);
      expect(current[0]!.available).toBe(true);
    }
  });

  describe('empty block — every mold available, nothing to lose', () => {
    it.each([undefined, 'match', 'reorder', 'cloze', 'groupsort'] as const)('from %s', (template) => {
      const opts = conversionOptions(quizBlock(template, EMPTY_PAYLOAD));
      for (const opt of opts) {
        expect(opt.available).toBe(true);
        expect(opt.reason).toBeUndefined();
      }
    });
  });

  it('Varios juegos (undefined) <-> match: bidirectionally available', () => {
    const fromBasic = conversionOptions(quizBlock(undefined, BASIC_TEXT_PAYLOAD));
    expect(fromBasic.find((o) => o.template === 'match')).toMatchObject({ available: true, current: false });

    const fromMatch = conversionOptions(quizBlock('match', MATCH_NO_REPEATS_PAYLOAD));
    expect(fromMatch.find((o) => o.template === undefined)).toMatchObject({ available: true, current: false });
  });

  it('Varios juegos -> reorder/cloze: unavailable, "needs_sentences"', () => {
    const opts = conversionOptions(quizBlock(undefined, BASIC_TEXT_PAYLOAD));
    expect(opts.find((o) => o.template === 'reorder')).toMatchObject({ available: false, reason: 'needs_sentences' });
    expect(opts.find((o) => o.template === 'cloze')).toMatchObject({ available: false, reason: 'needs_sentences' });
  });

  it('Varios juegos -> groupsort: unavailable, "not_supported"', () => {
    const opts = conversionOptions(quizBlock(undefined, BASIC_TEXT_PAYLOAD));
    expect(opts.find((o) => o.template === 'groupsort')).toMatchObject({ available: false, reason: 'not_supported' });
  });

  it('reorder <-> cloze: bidirectionally available', () => {
    const fromReorder = conversionOptions(quizBlock('reorder', REORDER_PAYLOAD));
    expect(fromReorder.find((o) => o.template === 'cloze')).toMatchObject({ available: true, current: false });

    const fromCloze = conversionOptions(quizBlock('cloze', CLOZE_PAYLOAD));
    expect(fromCloze.find((o) => o.template === 'reorder')).toMatchObject({ available: true, current: false });
  });

  it('reorder/cloze -> match or Varios juegos: unavailable, "not_supported"', () => {
    const fromReorder = conversionOptions(quizBlock('reorder', REORDER_PAYLOAD));
    expect(fromReorder.find((o) => o.template === 'match')).toMatchObject({ available: false, reason: 'not_supported' });
    expect(fromReorder.find((o) => o.template === undefined)).toMatchObject({ available: false, reason: 'not_supported' });

    const fromCloze = conversionOptions(quizBlock('cloze', CLOZE_PAYLOAD));
    expect(fromCloze.find((o) => o.template === 'match')).toMatchObject({ available: false, reason: 'not_supported' });
    expect(fromCloze.find((o) => o.template === undefined)).toMatchObject({ available: false, reason: 'not_supported' });
  });

  it('groupsort -> match: unconditionally available', () => {
    const opts = conversionOptions(quizBlock('groupsort', GROUPSORT_PAYLOAD));
    expect(opts.find((o) => o.template === 'match')).toMatchObject({ available: true, current: false });
  });

  it('groupsort -> reorder/cloze/Varios juegos: unavailable', () => {
    const opts = conversionOptions(quizBlock('groupsort', GROUPSORT_PAYLOAD));
    expect(opts.find((o) => o.template === 'reorder')).toMatchObject({ available: false, reason: 'needs_sentences' });
    expect(opts.find((o) => o.template === 'cloze')).toMatchObject({ available: false, reason: 'needs_sentences' });
    expect(opts.find((o) => o.template === undefined)).toMatchObject({ available: false, reason: 'not_supported' });
  });

  it('match -> groupsort: unavailable ("needs_repeated_answers") without repeats, available with them', () => {
    const noRepeats = conversionOptions(quizBlock('match', MATCH_NO_REPEATS_PAYLOAD));
    expect(noRepeats.find((o) => o.template === 'groupsort')).toMatchObject({
      available: false,
      reason: 'needs_repeated_answers',
    });

    const withRepeats = conversionOptions(quizBlock('match', MATCH_WITH_REPEATS_PAYLOAD));
    expect(withRepeats.find((o) => o.template === 'groupsort')).toMatchObject({ available: true, current: false });
  });
});

describe('convertBlock — no-op', () => {
  it('converting to the same mold returns the identical block, nothing dropped', () => {
    const block = quizBlock('match', MATCH_NO_REPEATS_PAYLOAD);
    const result = convertBlock(block, 'match');
    expect(result.block).toBe(block);
    expect(result.dropped).toEqual([]);
  });
});

describe('convertBlock — empty block converts losslessly to any mold', () => {
  it.each([undefined, 'match', 'reorder', 'cloze', 'groupsort'] as const)('from %s', (from) => {
    for (const to of MOLDS) {
      if (to === from) continue;
      const result = convertBlock(quizBlock(from, EMPTY_PAYLOAD), to);
      expect(result.dropped).toEqual([]);
      expect(result.block.template).toBe(to);
      expect(payloadToDraft(result.block.payload).blocks).toEqual([]);
    }
  });
});

describe('convertBlock — Varios juegos -> match', () => {
  it('keeps one answer per question; extra accepted answers are dropped', () => {
    const { block, dropped } = convertBlock(quizBlock(undefined, BASIC_TEXT_PAYLOAD), 'match');
    expect(block.template).toBe('match');
    const draft = payloadToDraft(block.payload);
    const rows = draft.blocks.filter((b) => b.kind === 'row');
    expect(rows).toHaveLength(2);
    const slots = draft.slots;
    expect(slots[0]).toMatchObject({ label: 'Capital of France', answer: ['Paris'] });
    expect(slots[1]).toMatchObject({ label: 'Capital of Spain', answer: ['Madrid'] });
    expect(dropped).toEqual([{ kind: 'answers', count: 1 }]);
  });

  it('resolves a choice question to its correct option text; distractors are dropped as options', () => {
    const { block, dropped } = convertBlock(quizBlock(undefined, BASIC_CHOICE_PAYLOAD), 'match');
    const draft = payloadToDraft(block.payload);
    expect(draft.slots[0]).toMatchObject({ label: 'Capital of France', answer: ['Paris'], input: 'text' });
    expect(draft.slots[0]!.pool).toBeUndefined();
    expect(dropped).toEqual([{ kind: 'options', count: 2 }]);
  });
});

describe('convertBlock — match -> Varios juegos', () => {
  it('is a pure reshape: nothing dropped, same content', () => {
    const { block, dropped } = convertBlock(quizBlock('match', MATCH_NO_REPEATS_PAYLOAD), undefined);
    expect(block.template).toBeUndefined();
    expect(dropped).toEqual([]);
    const draft = payloadToDraft(block.payload);
    expect(draft.slots.map((s) => [s.label, s.answer[0]])).toEqual([
      ['dog', 'perro'],
      ['cat', 'gato'],
      ['bird', 'pájaro'],
    ]);
  });
});

describe('convertBlock — promptImages (question context images, owner decision 2026-10-16)', () => {
  const USER = 'a1a1a1a1-0000-4000-8000-000000000001';
  const QUESTION_PATH = uploadPath(USER, 'b2b2b2b2-0000-4000-8000-000000000002', 'question');

  it('a no-op (same mold) carries promptImages over unchanged, nothing dropped', () => {
    const block: QuizBlock = {
      ...quizBlock('match', MATCH_NO_REPEATS_PAYLOAD),
      promptImages: { s1: { path: QUESTION_PATH, width: 400, height: 300 } },
    };
    const result = convertBlock(block, 'match');
    expect(result.block).toBe(block);
    expect(result.block.promptImages).toEqual({ s1: { path: QUESTION_PATH, width: 400, height: 300 } });
    expect(result.dropped).toEqual([]);
  });

  it('match -> Varios juegos preserves promptImages keyed by a slot id that survives the reshape (ids are reused verbatim, never minted)', () => {
    const block: QuizBlock = {
      ...quizBlock('match', MATCH_NO_REPEATS_PAYLOAD),
      promptImages: { s1: { path: QUESTION_PATH, width: 400, height: 300 } },
    };
    const { block: result, dropped } = convertBlock(block, undefined);
    expect(result.promptImages).toEqual({ s1: { path: QUESTION_PATH, width: 400, height: 300 } });
    expect(dropped).toEqual([]);
  });

  it('match -> Varios juegos drops (and reports) a promptImages key naming a slot id that no longer exists', () => {
    const block: QuizBlock = {
      ...quizBlock('match', MATCH_NO_REPEATS_PAYLOAD),
      promptImages: { 'stale-slot': { path: QUESTION_PATH, width: 400, height: 300 } },
    };
    const { block: result, dropped } = convertBlock(block, undefined);
    expect(result.promptImages).toBeUndefined();
    expect(dropped).toEqual([{ kind: 'images', count: 1 }]);
  });

  it('Varios juegos -> match drops promptImages (ids are minted fresh; match has no "Agregar imagen" affordance anyway), reported losslessly', () => {
    const block: QuizBlock = {
      ...quizBlock(undefined, BASIC_TEXT_PAYLOAD),
      promptImages: { s1: { path: QUESTION_PATH, width: 400, height: 300 } },
    };
    const { block: result, dropped } = convertBlock(block, 'match');
    expect(result.promptImages).toBeUndefined();
    expect(dropped).toContainEqual({ kind: 'images', count: 1 });
  });

  it('Varios juegos -> cloze (no real mapping, dropAllFallback) also drops promptImages, reported alongside the questions it drops', () => {
    const block: QuizBlock = {
      ...quizBlock(undefined, BASIC_TEXT_PAYLOAD),
      promptImages: { s1: { path: QUESTION_PATH, width: 400, height: 300 }, s2: { path: QUESTION_PATH, width: 400, height: 300 } },
    };
    const { block: result, dropped } = convertBlock(block, 'cloze');
    expect(result.promptImages).toBeUndefined();
    expect(dropped).toContainEqual({ kind: 'images', count: 2 });
  });

  it('a block with no promptImages at all is unaffected (absent stays absent, nothing reported)', () => {
    const { block, dropped } = convertBlock(quizBlock(undefined, BASIC_TEXT_PAYLOAD), 'match');
    expect(block.promptImages).toBeUndefined();
    expect(dropped.some((d) => d.kind === 'images')).toBe(false);
  });
});

describe('convertBlock — groupsort -> match', () => {
  it('pairs every item with its own group name, in group then item order', () => {
    const { block, dropped } = convertBlock(quizBlock('groupsort', GROUPSORT_PAYLOAD), 'match');
    expect(block.template).toBe('match');
    const draft = payloadToDraft(block.payload);
    expect(draft.slots.map((s) => [s.label, s.answer[0]])).toEqual([
      ['cat', 'Animals'],
      ['dog', 'Animals'],
      ['red', 'Colors'],
    ]);
    expect(dropped).toEqual([]);
  });
});

describe('convertBlock — match -> groupsort', () => {
  it('groups pairs sharing an answer; a pair with a unique answer is dropped', () => {
    const { block, dropped } = convertBlock(quizBlock('match', MATCH_WITH_REPEATS_PAYLOAD), 'groupsort');
    expect(block.template).toBe('groupsort');
    const draft = payloadToDraft(block.payload);
    const groups = deriveGroupSortRows(draft, GROUPSORT_POOL);
    expect(groups.map((g) => [g.label, g.items.map((i) => i.text)])).toEqual([
      ['Animals', ['cat', 'dog']],
      ['Vehicles', ['car', 'bike']],
    ]);
    expect(dropped).toEqual([{ kind: 'pairs', count: 1 }]);
  });

  it('with no repeated answers at all, every pair is dropped and the result is empty', () => {
    const { block, dropped } = convertBlock(quizBlock('match', MATCH_NO_REPEATS_PAYLOAD), 'groupsort');
    const draft = payloadToDraft(block.payload);
    expect(deriveGroupSortRows(draft, GROUPSORT_POOL)).toEqual([]);
    expect(dropped).toEqual([{ kind: 'pairs', count: 3 }]);
  });
});

describe('convertBlock — reorder -> cloze', () => {
  it('keeps every sentence as a still-bracket-less (0-blank) placeholder, whitespace included', () => {
    const { block, dropped } = convertBlock(quizBlock('reorder', REORDER_PAYLOAD), 'cloze');
    expect(block.template).toBe('cloze');
    const draft = payloadToDraft(block.payload);
    const sentences = deriveClozeSentences(draft);
    expect(sentences.map((s) => [s.text, s.blankCount])).toEqual([
      ['I like cats', 0],
      ['   ', 0],
    ]);
    expect(dropped).toEqual([]);
  });

  it('mints ids that still follow the cloze blank-id convention', () => {
    const { block } = convertBlock(quizBlock('reorder', REORDER_PAYLOAD), 'cloze');
    const draft = payloadToDraft(block.payload);
    for (const b of draft.blocks) {
      expect(b.id).toMatch(/-cz-s\d+-b\d+-/);
    }
  });
});

describe('convertBlock — cloze -> reorder', () => {
  it('strips brackets back to plain, filled-in sentences; extra words are dropped', () => {
    const { block, dropped } = convertBlock(quizBlock('cloze', CLOZE_PAYLOAD), 'reorder');
    expect(block.template).toBe('reorder');
    const draft = payloadToDraft(block.payload);
    expect(draft.slots.map((s) => s.label)).toEqual([
      'I was travelling when I received a phone call.',
      'She is my teacher.',
    ]);
    expect(draft.slots.map((s) => s.answer)).toEqual([
      ['I was travelling when I received a phone call.'],
      ['She is my teacher.'],
    ]);
    expect(dropped).toEqual([{ kind: 'words', count: 2 }]);
  });
});

describe('convertBlock — combinations with no mapping drop everything, losslessly reported', () => {
  const cases: Array<{ from: Mold; to: Mold; payload: Payload; kind: string; count: number }> = [
    { from: undefined, to: 'reorder', payload: BASIC_TEXT_PAYLOAD, kind: 'questions', count: 2 },
    { from: undefined, to: 'cloze', payload: BASIC_TEXT_PAYLOAD, kind: 'questions', count: 2 },
    { from: undefined, to: 'groupsort', payload: BASIC_TEXT_PAYLOAD, kind: 'questions', count: 2 },
    { from: 'match', to: 'reorder', payload: MATCH_NO_REPEATS_PAYLOAD, kind: 'pairs', count: 3 },
    { from: 'match', to: 'cloze', payload: MATCH_NO_REPEATS_PAYLOAD, kind: 'pairs', count: 3 },
    { from: 'reorder', to: undefined, payload: REORDER_PAYLOAD, kind: 'sentences', count: 2 },
    { from: 'reorder', to: 'match', payload: REORDER_PAYLOAD, kind: 'sentences', count: 2 },
    { from: 'reorder', to: 'groupsort', payload: REORDER_PAYLOAD, kind: 'sentences', count: 2 },
    { from: 'cloze', to: undefined, payload: CLOZE_PAYLOAD, kind: 'sentences', count: 2 },
    { from: 'cloze', to: 'match', payload: CLOZE_PAYLOAD, kind: 'sentences', count: 2 },
    { from: 'cloze', to: 'groupsort', payload: CLOZE_PAYLOAD, kind: 'sentences', count: 2 },
    { from: 'groupsort', to: undefined, payload: GROUPSORT_PAYLOAD, kind: 'groups', count: 2 },
    { from: 'groupsort', to: 'reorder', payload: GROUPSORT_PAYLOAD, kind: 'groups', count: 2 },
    { from: 'groupsort', to: 'cloze', payload: GROUPSORT_PAYLOAD, kind: 'groups', count: 2 },
  ];

  it.each(cases)('$from -> $to', ({ from, to, payload, kind, count }) => {
    const { block, dropped } = convertBlock(quizBlock(from, payload), to);
    expect(block.template).toBe(to);
    expect(dropped).toEqual([{ kind, count }]);
    const draft = payloadToDraft(block.payload);
    expect(draft.blocks).toEqual([]);
  });
});

describe('convertBlock — exhaustive: every pair, for every source mold, is total and structurally valid', () => {
  const fixtures: Array<{ from: Mold; payload: Payload }> = [
    { from: undefined, payload: BASIC_TEXT_PAYLOAD },
    { from: 'match', payload: MATCH_WITH_REPEATS_PAYLOAD },
    { from: 'reorder', payload: REORDER_PAYLOAD },
    { from: 'cloze', payload: CLOZE_PAYLOAD },
    { from: 'groupsort', payload: GROUPSORT_PAYLOAD },
  ];

  for (const { from, payload } of fixtures) {
    for (const to of MOLDS) {
      it(`${from ?? 'undefined'} -> ${to ?? 'undefined'}`, () => {
        const block = quizBlock(from, payload);
        const result = convertBlock(block, to);
        expect(result.block.template).toBe(to);
        for (const item of result.dropped) {
          expect(item.count).toBeGreaterThan(0);
        }
        // Structurally valid in 'draft' mode — the production validator
        // itself accepts the converted payload (never a malformed shape).
        expect(parseBlocks([result.block], 'draft')).not.toBeNull();
      });
    }
  }
});
