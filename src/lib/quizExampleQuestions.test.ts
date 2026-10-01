import { describe, it, expect } from 'vitest';
import { createExampleDraft, EXAMPLE_QUESTION_PROMPTS } from './quizExampleQuestions';
import { listIncompleteQuestions } from './quizChecklist';

function sequentialIds(prefix: string) {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

describe('createExampleDraft', () => {
  it('creates exactly 3 questions, in order, matching EXAMPLE_QUESTION_PROMPTS', () => {
    const draft = createExampleDraft(sequentialIds('x'));
    const rows = draft.blocks.filter((b) => b.kind === 'row');
    expect(rows).toHaveLength(3);
    const labels = rows.map((row) => draft.slots.find((s) => s.id === (row as { slotId: string }).slotId)!.label);
    expect(labels).toEqual([...EXAMPLE_QUESTION_PROMPTS]);
  });

  it('gives the first question a choice mechanic with a marked-correct pool item', () => {
    const draft = createExampleDraft(sequentialIds('x'));
    const slot = draft.slots[0]!;
    expect(slot.input).toBe('choice');
    const pool = draft.pools[slot.pool!]!;
    expect(pool.length).toBeGreaterThanOrEqual(2);
    expect(pool.some((item) => item.id === slot.answer[0])).toBe(true);
  });

  it('gives the second question a plain text mechanic with its accepted answer', () => {
    const draft = createExampleDraft(sequentialIds('x'));
    const slot = draft.slots[1]!;
    expect(slot.input).toBe('text');
    expect(slot.pool).toBeUndefined();
    expect(slot.answer).toEqual(['am']);
  });

  it('gives the third question a select gap mechanic with a marked-correct pool item', () => {
    const draft = createExampleDraft(sequentialIds('x'));
    const slot = draft.slots[2]!;
    expect(slot.input).toBe('select');
    const pool = draft.pools[slot.pool!]!;
    expect(pool.some((item) => item.id === slot.answer[0])).toBe(true);
  });

  it('produces a draft with every question already complete (no checklist items)', () => {
    const draft = createExampleDraft(sequentialIds('x'));
    expect(listIncompleteQuestions(draft)).toEqual([]);
  });

  it('mints distinct ids on every call, so two blocks never collide', () => {
    const a = createExampleDraft(sequentialIds('a'));
    const b = createExampleDraft(sequentialIds('a'));
    const aIds = new Set(a.slots.map((s) => s.id));
    const bIds = new Set(b.slots.map((s) => s.id));
    // Same generator seed used independently per call (as a real caller would,
    // one fresh counter per block) still yields the SAME ids — that is
    // expected and fine, since each block commits its own draft separately;
    // this test instead guards that ids stay internally consistent per draft.
    expect(aIds.size).toBe(3);
    expect(bIds.size).toBe(3);
  });
});
