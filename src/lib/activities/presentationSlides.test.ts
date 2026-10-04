import { describe, it, expect } from 'vitest';
import {
  collectPresentationQuestions,
  hasPresentableQuiz,
  promptFontSize,
  PROMPT_FONT_MAX_PX,
  PROMPT_FONT_MIN_PX,
} from './presentationSlides';
import type { Block } from './blocks';

const WORKSHEET: Block = {
  id: 'w1',
  type: 'worksheet',
  rotation: 0,
  image: { path: 'activity-images/abc/img-1.webp', width: 800, height: 400 },
  zones: [{ id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: ['cat'] }],
};

function quizBlock(id: string, slotIds: string[]): Block {
  return {
    id,
    type: 'quiz',
    payload: {
      pools: {},
      slots: slotIds.map((slotId) => ({ id: slotId, label: `${slotId} label`, input: 'text', answer: ['x'] })),
    },
  };
}

describe('collectPresentationQuestions', () => {
  it('returns nothing for an empty block list', () => {
    expect(collectPresentationQuestions([])).toEqual([]);
  });

  it('ignores worksheet blocks entirely', () => {
    expect(collectPresentationQuestions([WORKSHEET])).toEqual([]);
  });

  it("flattens one quiz block's own slots, in their authored order", () => {
    const block = quizBlock('q1', ['s1', 's2']);
    const questions = collectPresentationQuestions([block]);
    expect(questions.map((q) => q.slot.id)).toEqual(['s1', 's2']);
    expect(questions.every((q) => q.blockId === 'q1')).toBe(true);
    expect(questions[0]!.payload).toBe((block as { payload: unknown }).payload);
  });

  it('flattens several quiz blocks, interleaved with worksheets, in document order', () => {
    const blocks = [WORKSHEET, quizBlock('q1', ['s1']), WORKSHEET, quizBlock('q2', ['s2', 's3'])];
    const questions = collectPresentationQuestions(blocks);
    expect(questions.map((q) => [q.blockId, q.slot.id])).toEqual([
      ['q1', 's1'],
      ['q2', 's2'],
      ['q2', 's3'],
    ]);
  });
});

describe('hasPresentableQuiz', () => {
  it('is false with no blocks at all', () => {
    expect(hasPresentableQuiz([])).toBe(false);
  });

  it('is false with only worksheet blocks', () => {
    expect(hasPresentableQuiz([WORKSHEET])).toBe(false);
  });

  it('is false for a quiz block with zero questions (a draft-parsed empty block)', () => {
    expect(hasPresentableQuiz([quizBlock('q1', [])])).toBe(false);
  });

  it('is true once at least one quiz question exists, worksheets alongside or not', () => {
    expect(hasPresentableQuiz([quizBlock('q1', ['s1'])])).toBe(true);
    expect(hasPresentableQuiz([WORKSHEET, quizBlock('q1', ['s1'])])).toBe(true);
  });
});

describe('promptFontSize', () => {
  it('gives a short prompt the maximum size', () => {
    expect(promptFontSize('Cats?')).toBe(PROMPT_FONT_MAX_PX);
  });

  it('floors a very long prompt at the minimum size', () => {
    const long = 'A'.repeat(200);
    expect(promptFontSize(long)).toBe(PROMPT_FONT_MIN_PX);
  });

  it('shrinks a medium-length prompt strictly between the two bounds', () => {
    const medium = 'A'.repeat(60);
    const size = promptFontSize(medium);
    expect(size).toBeLessThan(PROMPT_FONT_MAX_PX);
    expect(size).toBeGreaterThan(PROMPT_FONT_MIN_PX);
  });

  it('is monotonically non-increasing as the prompt gets longer', () => {
    const lengths = [5, 20, 30, 45, 60, 75, 90, 120];
    const sizes = lengths.map((n) => promptFontSize('A'.repeat(n)));
    for (let i = 1; i < sizes.length; i += 1) {
      expect(sizes[i]).toBeLessThanOrEqual(sizes[i - 1]!);
    }
  });

  it('measures the trimmed length, ignoring surrounding whitespace', () => {
    expect(promptFontSize('Cats?')).toBe(promptFontSize('   Cats?   '));
  });
});
