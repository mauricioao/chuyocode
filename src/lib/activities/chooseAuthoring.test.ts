import { describe, it, expect } from 'vitest';
import { createEmptyDraft, draftToPayload, setRowLabel, type Draft } from '../authoringDraft';
import { deriveChooseQuestions } from './chooseQuestion';
import {
  addChooseOption,
  addChooseQuestion,
  deriveChooseRows,
  MAX_CHOOSE_OPTIONS,
  pasteChooseRows,
  removeChooseOption,
  removeChooseQuestion,
  setChooseOptionText,
} from './chooseAuthoring';

/** A deterministic id minter, same shape as `QuizBlockEditor`'s own `nextId`. */
function counter(): (prefix: string) => string {
  let n = 0;
  return (prefix) => {
    n += 1;
    return `${prefix}-${n}`;
  };
}

function optionIds(draft: Draft, slotId: string): string[] {
  return (draft.pools[`${slotId}-options`] ?? []).map((item) => item.id);
}

describe('addChooseQuestion', () => {
  it('creates a choice question with its own pool of two empty options, the first one marked correct', () => {
    const draft = addChooseQuestion(createEmptyDraft(), 'r1', 's1', counter());
    const payload = draftToPayload(draft);

    expect(payload.blocks).toEqual([{ kind: 'row', id: 'r1', slotId: 's1' }]);
    expect(payload.pools['s1-options']).toEqual([
      { id: 'item-1', text: '' },
      { id: 'item-2', text: '' },
    ]);
    expect(payload.slots).toEqual([{ id: 's1', label: '', input: 'choice', pool: 's1-options', answer: ['item-1'] }]);
  });

  it('starts from the given sentence and options, padded to two and capped at four', () => {
    const one = addChooseQuestion(createEmptyDraft(), 'r1', 's1', counter(), { sentence: 'She ___', options: ['goes'] });
    expect(one.slots[0]!.label).toBe('She ___');
    expect(one.pools['s1-options']!.map((item) => item.text)).toEqual(['goes', '']);

    const many = addChooseQuestion(createEmptyDraft(), 'r1', 's1', counter(), {
      sentence: 'S ___',
      options: ['a', 'b', 'c', 'd', 'e'],
    });
    expect(many.pools['s1-options']!.map((item) => item.text)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('the option commits', () => {
  function oneQuestion(): Draft {
    return addChooseQuestion(createEmptyDraft(), 'r1', 's1', counter(), { sentence: 'She ___', options: ['goes', 'go'] });
  }

  it('setChooseOptionText edits one option and keeps the first one as the answer', () => {
    const draft = setChooseOptionText(oneQuestion(), 's1', 'item-2', 'going');
    expect(draft.pools['s1-options']!.map((item) => item.text)).toEqual(['goes', 'going']);
    expect(draft.slots[0]!.answer).toEqual(['item-1']);
  });

  it(`addChooseOption appends an empty option, up to ${MAX_CHOOSE_OPTIONS}`, () => {
    const mint = counter();
    let draft = addChooseQuestion(createEmptyDraft(), 'r1', 's1', mint);
    draft = addChooseOption(draft, 's1', mint);
    draft = addChooseOption(draft, 's1', mint);
    expect(optionIds(draft, 's1')).toHaveLength(4);
    expect(addChooseOption(draft, 's1', mint)).toBe(draft);
  });

  it('removeChooseOption removes another option, but never the correct one and never below two', () => {
    const mint = counter();
    let draft = addChooseQuestion(createEmptyDraft(), 'r1', 's1', mint, { sentence: 'S', options: ['a', 'b', 'c'] });
    const [correct, second] = optionIds(draft, 's1');

    expect(removeChooseOption(draft, 's1', correct!)).toBe(draft);

    draft = removeChooseOption(draft, 's1', second!);
    expect(draft.pools['s1-options']!.map((item) => item.text)).toEqual(['a', 'c']);
    expect(draft.slots[0]!.answer).toEqual([correct]);

    const [, last] = optionIds(draft, 's1');
    expect(removeChooseOption(draft, 's1', last!)).toBe(draft);
  });
});

describe('removeChooseQuestion', () => {
  it('removes the row, its slot and its options pool', () => {
    const mint = counter();
    let draft = addChooseQuestion(createEmptyDraft(), 'r1', 's1', mint);
    draft = addChooseQuestion(draft, 'r2', 's2', mint);
    draft = removeChooseQuestion(draft, 'r1');

    expect(draft.blocks).toEqual([{ kind: 'row', id: 'r2', slotId: 's2' }]);
    expect(draft.slots.map((slot) => slot.id)).toEqual(['s2']);
    expect(Object.keys(draft.pools)).toEqual(['s2-options']);
  });
});

describe('deriveChooseRows', () => {
  it('lists every question in row order, with its options and explanation', () => {
    const mint = counter();
    let draft = addChooseQuestion(createEmptyDraft(), 'r1', 's1', mint, { sentence: 'A ___', options: ['x', 'y'] });
    draft = addChooseQuestion(draft, 'r2', 's2', mint, { sentence: 'B ___', options: ['z', 'w'] });
    draft = { ...draft, blocks: [...draft.blocks].reverse() };
    draft = { ...draft, slots: draft.slots.map((s) => (s.id === 's2' ? { ...s, explanation: 'Because.' } : s)) };

    expect(deriveChooseRows(draft)).toEqual([
      {
        rowId: 'r2',
        slotId: 's2',
        sentence: 'B ___',
        options: [
          { id: 'item-3', text: 'z' },
          { id: 'item-4', text: 'w' },
        ],
        explanation: 'Because.',
      },
      {
        rowId: 'r1',
        slotId: 's1',
        sentence: 'A ___',
        options: [
          { id: 'item-1', text: 'x' },
          { id: 'item-2', text: 'y' },
        ],
        explanation: '',
      },
    ]);
  });

  it('shows the correct option first even when the pool stores it later', () => {
    const draft: Draft = {
      pools: { p: [{ id: 'o1', text: 'go' }, { id: 'o2', text: 'goes' }] },
      slots: [{ id: 's1', label: 'She ___', input: 'choice', pool: 'p', answer: ['o2'] }],
      blocks: [{ kind: 'row', id: 'r1', slotId: 's1' }],
    };
    expect(deriveChooseRows(draft)[0]!.options.map((option) => option.id)).toEqual(['o2', 'o1']);
  });
});

describe('pasteChooseRows', () => {
  const ROWS = [
    { sentence: 'A ___', options: ['x', 'y'] },
    { sentence: 'B ___', options: ['z', 'w', 'v'] },
  ];

  it('fills the empty question the paste landed in, then inserts the rest right after it, in order', () => {
    const mint = counter();
    let draft = addChooseQuestion(createEmptyDraft(), 'r1', 's1', mint);
    draft = addChooseQuestion(draft, 'r2', 's2', mint, { sentence: 'Last ___', options: ['l', 'm'] });

    const next = pasteChooseRows(draft, 's1', ROWS, mint);
    const rows = deriveChooseRows(next);

    expect(rows.map((row) => row.sentence)).toEqual(['A ___', 'B ___', 'Last ___']);
    expect(rows[0]!.slotId).toBe('s1');
    expect(rows[1]!.options.map((option) => option.text)).toEqual(['z', 'w', 'v']);
  });

  it('appends every row when pasted into the empty-list example (no question yet)', () => {
    const next = pasteChooseRows(createEmptyDraft(), null, ROWS, counter());
    expect(deriveChooseRows(next).map((row) => row.sentence)).toEqual(['A ___', 'B ___']);
  });

  it('never overwrites a question that already has content', () => {
    const mint = counter();
    const draft = addChooseQuestion(createEmptyDraft(), 'r1', 's1', mint, { sentence: 'Mine ___', options: [] });
    const next = pasteChooseRows(draft, 's1', ROWS, mint);
    expect(deriveChooseRows(next).map((row) => row.sentence)).toEqual(['Mine ___', 'A ___', 'B ___']);
  });

  it('pasted questions are immediately playable: each answer is its first option', () => {
    const next = pasteChooseRows(createEmptyDraft(), null, ROWS, counter());
    const questions = deriveChooseQuestions(draftToPayload(next));
    expect(questions).toHaveLength(2);
    expect(questions.map((q) => q.options.find((o) => o.id === q.correctId)!.text)).toEqual(['x', 'z']);
  });

  it('a line with no options still becomes a question, with two empty option fields', () => {
    const next = pasteChooseRows(createEmptyDraft(), null, [{ sentence: 'Only a sentence', options: [] }], counter());
    expect(deriveChooseRows(next)[0]!.options.map((option) => option.text)).toEqual(['', '']);
  });
});

describe('a sentence edit', () => {
  it('is the plain setRowLabel — it leaves the options and the answer alone', () => {
    const draft = addChooseQuestion(createEmptyDraft(), 'r1', 's1', counter(), { sentence: 'S', options: ['a', 'b'] });
    const next = setRowLabel(draft, 's1', 'She ___ to school.');
    expect(next.slots[0]).toEqual({ ...draft.slots[0], label: 'She ___ to school.' });
    expect(next.pools).toBe(draft.pools);
  });
});
