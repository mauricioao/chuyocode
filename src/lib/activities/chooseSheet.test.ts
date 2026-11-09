import { describe, it, expect } from 'vitest';
import type { Payload } from '@/lib/exercisePayload';
import type { SentencePart } from './chooseQuestion';
import { chooseSheetQuestions, SHEET_BLANK } from './chooseSheet';

/** One choose question as the editor stores it: the correct option FIRST, `answer[0]` its id. */
function question(id: string, label: string, options: string[], explanation?: string) {
  const pool = options.map((text, i) => ({ id: `${id}-o${i}`, text }));
  const slot: Payload['slots'][number] = { id, label, input: 'choice', pool: `${id}-options`, answer: [pool[0]!.id] };
  if (explanation) slot.explanation = explanation;
  return { slot, pool };
}

function payloadOf(questions: ReturnType<typeof question>[]): Payload {
  return {
    slots: questions.map((q) => q.slot),
    pools: Object.fromEntries(questions.map((q) => [q.slot.pool!, q.pool])),
  };
}

/** A sentence's parts as plain text, each filled blank in [brackets]. */
function asText(parts: SentencePart[]): string {
  return parts.map((part) => (part.kind === 'text' ? part.text : `[${part.fill ?? ''}]`)).join('');
}

const PAYLOAD = payloadOf([
  question('q1', 'She ___ to school every day.', ['goes', 'go', 'going'], 'With "she", the present simple adds -s.'),
  question('q2', 'They ___ football when it ___ to rain.', ['were playing / started', 'played / was starting', 'are playing / starts']),
  question('q3', 'Which one is a fruit?', ['apple', 'chair']),
]);

describe('chooseSheetQuestions', () => {
  it('reads every playable question, in authored order, skipping one the player would skip', () => {
    const payload = payloadOf([
      question('q1', 'She ___ to school.', ['goes', 'go']),
      question('q2', 'Only one option ___.', ['here']),
      question('q3', 'We ___ happy.', ['are', 'is']),
    ]);
    expect(chooseSheetQuestions(payload).map((q) => q.id)).toEqual(['q1', 'q3']);
  });

  it('prints every blank of the sentence as a writing line', () => {
    const [q1, q2, q3] = chooseSheetQuestions(PAYLOAD);
    expect(q1!.prompt).toBe(`She ${SHEET_BLANK} to school every day.`);
    expect(q2!.prompt).toBe(`They ${SHEET_BLANK} football when it ${SHEET_BLANK} to rain.`);
    expect(q3!.prompt).toBe('Which one is a fruit?');
  });

  it('letters every option a) b) c) exactly once, with the correct one flagged', () => {
    const [q1] = chooseSheetQuestions(PAYLOAD);
    expect(q1!.options.map((o) => o.letter)).toEqual(['a', 'b', 'c']);
    expect(q1!.options.map((o) => o.text).sort()).toEqual(['go', 'goes', 'going']);
    expect(q1!.options.filter((o) => o.correct)).toEqual([q1!.correct]);
    expect(q1!.correct.text).toBe('goes');
    expect(q1!.options[q1!.options.indexOf(q1!.correct)]!.letter).toBe(q1!.correct.letter);
  });

  it('keeps one fixed order per question id, wherever the question sits and however often it is read', () => {
    const first = chooseSheetQuestions(PAYLOAD);
    const again = chooseSheetQuestions(PAYLOAD);
    expect(again).toEqual(first);

    // The same question, now second in another block: same letters.
    const moved = chooseSheetQuestions(
      payloadOf([
        question('other', 'We ___ happy.', ['are', 'is']),
        question('q1', 'She ___ to school every day.', ['goes', 'go', 'going']),
      ]),
    );
    expect(moved[1]!.options).toEqual(first[0]!.options);
  });

  it('shuffles, so the correct option (always stored first) is not always "a)"', () => {
    const many = payloadOf(
      Array.from({ length: 12 }, (_, i) => question(`question-${i}`, 'She ___ to school.', ['goes', 'go', 'going', 'gone'])),
    );
    const letters = chooseSheetQuestions(many).map((q) => q.correct.letter);
    expect(letters).toHaveLength(12);
    expect(letters.some((letter) => letter !== 'a')).toBe(true);
  });

  it('fills the blanks with the correct option, split across two blanks by "a / b"', () => {
    const [q1, q2] = chooseSheetQuestions(PAYLOAD);
    expect(asText(q1!.filled!)).toBe('She [goes] to school every day.');
    expect(asText(q2!.filled!)).toBe('They [were playing] football when it [started] to rain.');
  });

  it('has no filled sentence for a question without a blank — its correct option alone answers it', () => {
    const [, , q3] = chooseSheetQuestions(PAYLOAD);
    expect(q3!.filled).toBeNull();
    expect(q3!.correct.text).toBe('apple');
  });

  it('carries the "¿Por qué?" explanation when there is one', () => {
    const [q1, q2] = chooseSheetQuestions(PAYLOAD);
    expect(q1!.explanation).toBe('With "she", the present simple adds -s.');
    expect(q2!.explanation).toBeUndefined();
  });
});
