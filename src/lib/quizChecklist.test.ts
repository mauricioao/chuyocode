import { describe, it, expect } from 'vitest';
import { addRowBlock, createEmptyDraft, setPool, setSlotAnswer, setSlotInput, setSlotPool } from './authoringDraft';
import { listIncompleteQuestions } from './quizChecklist';

describe('listIncompleteQuestions', () => {
  it('returns [] for an empty draft', () => {
    expect(listIncompleteQuestions(createEmptyDraft())).toEqual([]);
  });

  it('returns [] when every question already has an answer', () => {
    let draft = addRowBlock(createEmptyDraft(), 'row-1', 's1');
    draft = setSlotAnswer(draft, 's1', ['sits']);
    expect(listIncompleteQuestions(draft)).toEqual([]);
  });

  it('flags a question with no accepted answer yet, in card order with its 1-based index', () => {
    let draft = addRowBlock(createEmptyDraft(), 'row-1', 's1');
    draft = addRowBlock(draft, 'row-2', 's2');
    draft = setSlotAnswer(draft, 's1', ['sits']);
    // s2 left with answer: [] (addRowBlock's default)

    expect(listIncompleteQuestions(draft)).toEqual([{ slotId: 's2', index: 2, reason: 'quiz_no_answer' }]);
  });

  it('flags a pooled question with fewer than two options', () => {
    let draft = addRowBlock(createEmptyDraft(), 'row-1', 's1');
    draft = setSlotInput(draft, 's1', 'choice');
    draft = setSlotPool(draft, 's1', 'opts');
    draft = setPool(draft, 'opts', [{ id: 'a', text: 'cat' }]);
    draft = setSlotAnswer(draft, 's1', ['a']);

    expect(listIncompleteQuestions(draft)).toEqual([{ slotId: 's1', index: 1, reason: 'quiz_too_few_options' }]);
  });

  it('flags a pooled question whose marked answer names no pool item', () => {
    let draft = addRowBlock(createEmptyDraft(), 'row-1', 's1');
    draft = setSlotInput(draft, 's1', 'choice');
    draft = setSlotPool(draft, 's1', 'opts');
    draft = setPool(draft, 'opts', [
      { id: 'a', text: 'cat' },
      { id: 'b', text: 'dog' },
    ]);
    draft = setSlotAnswer(draft, 's1', ['missing']);

    expect(listIncompleteQuestions(draft)).toEqual([{ slotId: 's1', index: 1, reason: 'quiz_answer_not_in_pool' }]);
  });

  it('does not require >= 2 options for a non-pooled text question', () => {
    let draft = addRowBlock(createEmptyDraft(), 'row-1', 's1');
    draft = setSlotAnswer(draft, 's1', ['sits']);
    expect(listIncompleteQuestions(draft)).toEqual([]);
  });
});
