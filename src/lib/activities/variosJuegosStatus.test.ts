import { describe, it, expect } from 'vitest';
import { addRowBlock, createEmptyDraft, setRowLabel, setSlotAnswer, type Draft } from '@/lib/authoringDraft';
import { variosJuegosStatus } from './variosJuegosStatus';

/** One question row, labeled and answered — the common case every test builds from. */
function withQuestion(draft: Draft, id: string, label: string, answer: string[]): Draft {
  let next = addRowBlock(draft, `row-${id}`, id);
  next = setRowLabel(next, id, label);
  next = setSlotAnswer(next, id, answer);
  return next;
}

describe('variosJuegosStatus', () => {
  it('is not ready with zero questions, and unlocks nothing', () => {
    const status = variosJuegosStatus(createEmptyDraft());
    expect(status.questionCount).toBe(0);
    expect(status.ready).toBe(false);
    expect(status.unlockedModes).toEqual([]);
    expect(status.nearestLocked).toBeNull();
  });

  it('is not ready while a question still has no accepted answer, even with others complete', () => {
    let draft = withQuestion(createEmptyDraft(), 's1', 'First', ['a']);
    draft = addRowBlock(draft, 'row-s2', 's2'); // no answer yet
    const status = variosJuegosStatus(draft);
    expect(status.questionCount).toBe(2);
    expect(status.ready).toBe(false);
    expect(status.nearestLocked).toBeNull();
  });

  it('is ready with one complete question, and unlocks cards/reorder/speak from a multi-word answer', () => {
    const draft = withQuestion(createEmptyDraft(), 's1', 'Capital of France', ['a red cat']);
    const status = variosJuegosStatus(draft);
    expect(status.questionCount).toBe(1);
    expect(status.ready).toBe(true);
    expect(status.unlockedModes).toEqual(['cards', 'reorder', 'speak']);
  });

  it('unlocks match too once 3 questions have unique, multi-word-or-single-word-mixed answers', () => {
    let draft = withQuestion(createEmptyDraft(), 's1', 'a', ['cat']);
    draft = withQuestion(draft, 's2', 'b', ['a red dog']);
    draft = withQuestion(draft, 's3', 'c', ['blue bird']);
    const status = variosJuegosStatus(draft);
    expect(status.unlockedModes).toEqual(
      expect.arrayContaining(['cards', 'match', 'reorder', 'speak', 'wheel', 'anagram', 'hangman', 'openbox']),
    );
    // Every mode a plain row can unlock is unlocked — only `cloze` (needs a
    // drag-and-drop gap, never authored here) is still locked, one "question" away.
    expect(status.nearestLocked).toEqual({ mode: 'cloze', gap: 1 });
  });

  it('reports the nearest locked mode once ready, mirroring gameModes.ts\'s own rules', () => {
    const draft = withQuestion(createEmptyDraft(), 's1', 'a', ['cat']);
    const status = variosJuegosStatus(draft);
    expect(status.ready).toBe(true);
    // One single-word item: reorder/wheel/openbox are each exactly 1 short.
    expect(status.nearestLocked).toEqual({ mode: 'reorder', gap: 1 });
  });
});
