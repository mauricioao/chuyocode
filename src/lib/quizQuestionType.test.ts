import { describe, it, expect } from 'vitest';
import { createEmptyDraft, setPool, setSlotAnswer, setSlotInput, setSlotPool, type Draft } from './authoringDraft';
import { addRowBlock } from './authoringDraft';
import { changeQuestionSegment, isDropGap, segmentForInput } from './quizQuestionType';

function draftWithOneQuestion(input: string): Draft {
  const draft = addRowBlock(createEmptyDraft(), 'row-1', 's1');
  return setSlotInput(draft, 's1', input);
}

function sequentialIds(prefix: string) {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

describe('segmentForInput', () => {
  it('maps text -> text', () => {
    expect(segmentForInput('text')).toBe('text');
  });
  it('maps select and drop -> gap', () => {
    expect(segmentForInput('select')).toBe('gap');
    expect(segmentForInput('drop')).toBe('gap');
  });
  it('maps choice, and any unrecognized mechanic, -> choice', () => {
    expect(segmentForInput('choice')).toBe('choice');
    expect(segmentForInput('mystery')).toBe('choice');
  });
});

describe('isDropGap', () => {
  it('is true only for drop', () => {
    expect(isDropGap('drop')).toBe(true);
    expect(isDropGap('select')).toBe(false);
    expect(isDropGap('choice')).toBe(false);
    expect(isDropGap('text')).toBe(false);
  });
});

describe('changeQuestionSegment — no-op cases', () => {
  it('returns the same draft reference when the slot already has the target shape', () => {
    const draft = draftWithOneQuestion('choice');
    const result = changeQuestionSegment(draft, 's1', 'choice', false, sequentialIds('x'));
    expect(result).toBe(draft);
  });

  it('returns the same draft reference for an unknown slot id', () => {
    const draft = draftWithOneQuestion('text');
    const result = changeQuestionSegment(draft, 'missing', 'choice', false, sequentialIds('x'));
    expect(result).toBe(draft);
  });
});

describe('changeQuestionSegment — pooled <-> pooled preserves pool and answer', () => {
  it('choice -> gap (select) keeps the pool and the marked-correct answer', () => {
    let draft = draftWithOneQuestion('choice');
    draft = setSlotPool(draft, 's1', 'opts');
    draft = setPool(draft, 'opts', [
      { id: 'a', text: 'cat' },
      { id: 'b', text: 'dog' },
    ]);
    draft = setSlotAnswer(draft, 's1', ['b']);

    const result = changeQuestionSegment(draft, 's1', 'gap', false, sequentialIds('x'));

    const slot = result.slots.find((s) => s.id === 's1')!;
    expect(slot.input).toBe('select');
    expect(slot.pool).toBe('opts');
    expect(slot.answer).toEqual(['b']);
    expect(result.pools.opts).toEqual([
      { id: 'a', text: 'cat' },
      { id: 'b', text: 'dog' },
    ]);
  });

  it('toggling asDrop inside gap switches select <-> drop, preserving pool and answer', () => {
    let draft = draftWithOneQuestion('select');
    draft = setSlotPool(draft, 's1', 'opts');
    draft = setPool(draft, 'opts', [{ id: 'a', text: 'cat' }]);
    draft = setSlotAnswer(draft, 's1', ['a']);

    const result = changeQuestionSegment(draft, 's1', 'gap', true, sequentialIds('x'));
    const slot = result.slots.find((s) => s.id === 's1')!;
    expect(slot.input).toBe('drop');
    expect(slot.pool).toBe('opts');
    expect(slot.answer).toEqual(['a']);
  });
});

describe('changeQuestionSegment — pooled -> text carries the correct option text forward', () => {
  it('uses the correct option\'s text as the sole accepted answer', () => {
    let draft = draftWithOneQuestion('choice');
    draft = setSlotPool(draft, 's1', 'opts');
    draft = setPool(draft, 'opts', [
      { id: 'a', text: 'cat' },
      { id: 'b', text: 'dog' },
    ]);
    draft = setSlotAnswer(draft, 's1', ['b']);

    const result = changeQuestionSegment(draft, 's1', 'text', false, sequentialIds('x'));
    const slot = result.slots.find((s) => s.id === 's1')!;
    expect(slot.input).toBe('text');
    expect(slot.pool).toBeUndefined();
    expect(slot.answer).toEqual(['dog']);
  });

  it('yields no accepted answer when the correct option has no text (e.g. media-only)', () => {
    let draft = draftWithOneQuestion('choice');
    draft = setSlotPool(draft, 's1', 'opts');
    draft = setPool(draft, 'opts', [{ id: 'a', media: 'https://example.com/cat.png' }]);
    draft = setSlotAnswer(draft, 's1', ['a']);

    const result = changeQuestionSegment(draft, 's1', 'text', false, sequentialIds('x'));
    const slot = result.slots.find((s) => s.id === 's1')!;
    expect(slot.answer).toEqual([]);
  });

  it('yields no accepted answer when nothing is marked correct yet', () => {
    let draft = draftWithOneQuestion('choice');
    draft = setSlotPool(draft, 's1', 'opts');
    draft = setPool(draft, 'opts', [{ id: 'a', text: 'cat' }]);

    const result = changeQuestionSegment(draft, 's1', 'text', false, sequentialIds('x'));
    const slot = result.slots.find((s) => s.id === 's1')!;
    expect(slot.answer).toEqual([]);
  });
});

describe('changeQuestionSegment — text -> pooled turns accepted answers into options', () => {
  it('creates one option per non-blank accepted answer, marking the first correct', () => {
    let draft = draftWithOneQuestion('text');
    draft = setSlotAnswer(draft, 's1', ['sits', '  ', 'sit']);

    const result = changeQuestionSegment(draft, 's1', 'choice', false, sequentialIds('item'));
    const slot = result.slots.find((s) => s.id === 's1')!;
    expect(slot.input).toBe('choice');
    expect(slot.pool).toBe('s1-options');
    const pool = result.pools['s1-options']!;
    expect(pool.map((item) => item.text)).toEqual(['sits', 'sit']);
    expect(slot.answer).toEqual([pool[0]!.id]);
  });

  it('switching text -> gap names the new pool after the slot and selects select by default', () => {
    let draft = draftWithOneQuestion('text');
    draft = setSlotAnswer(draft, 's1', ['sits']);

    const result = changeQuestionSegment(draft, 's1', 'gap', false, sequentialIds('item'));
    const slot = result.slots.find((s) => s.id === 's1')!;
    expect(slot.input).toBe('select');
    expect(slot.pool).toBe('s1-options');
  });

  it('switching text -> gap with asDrop picks drop directly', () => {
    let draft = draftWithOneQuestion('text');
    draft = setSlotAnswer(draft, 's1', ['sits']);

    const result = changeQuestionSegment(draft, 's1', 'gap', true, sequentialIds('item'));
    const slot = result.slots.find((s) => s.id === 's1')!;
    expect(slot.input).toBe('drop');
  });

  it('yields an empty pool and no answer when there were no non-blank accepted answers', () => {
    const draft = draftWithOneQuestion('text');
    const result = changeQuestionSegment(draft, 's1', 'choice', false, sequentialIds('item'));
    const slot = result.slots.find((s) => s.id === 's1')!;
    expect(result.pools['s1-options']).toEqual([]);
    expect(slot.answer).toEqual([]);
  });

  it('reuses an already-named pool instead of renaming it', () => {
    let draft = draftWithOneQuestion('text');
    draft = setSlotPool(draft, 's1', 'kept-name');
    draft = setSlotAnswer(draft, 's1', ['sits']);

    const result = changeQuestionSegment(draft, 's1', 'choice', false, sequentialIds('item'));
    const slot = result.slots.find((s) => s.id === 's1')!;
    expect(slot.pool).toBe('kept-name');
  });
});
