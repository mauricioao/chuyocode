import { describe, expect, it } from 'vitest';
import type { Payload } from '@/lib/exercisePayload';
import {
  deriveChooseQuestions,
  sentenceParts,
  shuffleOptions,
  splitAnswer,
  type ChooseQuestion,
  type SentencePart,
} from './chooseQuestion';

/** One "Elegir la respuesta" question, stored exactly like a Básico multiple-choice slot. */
function choiceSlot(
  id: string,
  label: string,
  options: string[],
  extra: Partial<Payload['slots'][number]> = {},
): { slot: Payload['slots'][number]; pool: Payload['pools'][string] } {
  const pool = options.map((text, i) => ({ id: `${id}-o${i}`, text }));
  return {
    slot: { id, label, input: 'choice', pool: `${id}-options`, answer: pool[0] ? [pool[0].id] : [], ...extra },
    pool,
  };
}

function payloadOf(...entries: ReturnType<typeof choiceSlot>[]): Payload {
  return {
    slots: entries.map((e) => e.slot),
    pools: Object.fromEntries(entries.map((e) => [e.slot.pool!, e.pool])),
  };
}

describe('deriveChooseQuestions', () => {
  it('derives one question per choice slot, options in authored order, the marked answer as the correct id', () => {
    const payload = payloadOf(
      choiceSlot('q1', 'She ___ to school every day.', ['goes', 'go', 'going']),
      choiceSlot('q2', 'I ___ attention while the teacher ___.', ["wasn't paying / was speaking", 'payed / spoke'], {
        explanation: 'Both actions were in progress.',
      }),
    );

    expect(deriveChooseQuestions(payload)).toEqual<ChooseQuestion[]>([
      {
        id: 'q1',
        sentence: 'She ___ to school every day.',
        options: [
          { id: 'q1-o0', text: 'goes' },
          { id: 'q1-o1', text: 'go' },
          { id: 'q1-o2', text: 'going' },
        ],
        correctId: 'q1-o0',
      },
      {
        id: 'q2',
        sentence: 'I ___ attention while the teacher ___.',
        options: [
          { id: 'q2-o0', text: "wasn't paying / was speaking" },
          { id: 'q2-o1', text: 'payed / spoke' },
        ],
        correctId: 'q2-o0',
        explanation: 'Both actions were in progress.',
      },
    ]);
  });

  it('skips a question that is not playable yet: empty sentence, fewer than 2 options, or no correct answer among them', () => {
    const blankSentence = choiceSlot('a', '   ', ['x', 'y']);
    const oneOption = choiceSlot('b', 'Pick ___.', ['only']);
    const noAnswer = choiceSlot('c', 'Pick ___.', ['x', 'y'], { answer: [] });
    const danglingAnswer = choiceSlot('d', 'Pick ___.', ['x', 'y'], { answer: ['ghost'] });
    const playable = choiceSlot('e', 'Pick ___.', ['x', 'y']);

    expect(deriveChooseQuestions(payloadOf(blankSentence, oneOption, noAnswer, danglingAnswer, playable)).map((q) => q.id)).toEqual(['e']);
  });

  it('ignores options with no text, and any slot that is not a choice question', () => {
    const withBlankOption = choiceSlot('a', 'Pick ___.', ['x', '  ', 'y']);
    const payload = payloadOf(withBlankOption);
    payload.slots.push({ id: 't', label: 'Type ___.', input: 'text', answer: ['cat'] });

    const [question, ...rest] = deriveChooseQuestions(payload);
    expect(rest).toEqual([]);
    expect(question!.options.map((o) => o.text)).toEqual(['x', 'y']);
  });

  it('is empty for a payload with no slots', () => {
    expect(deriveChooseQuestions({ pools: {}, slots: [] })).toEqual([]);
  });
});

describe('splitAnswer', () => {
  it('splits an answer on " / " into one part per blank', () => {
    expect(splitAnswer("wasn't paying / was speaking")).toEqual(["wasn't paying", 'was speaking']);
  });

  it('tolerates extra spaces around the separator', () => {
    expect(splitAnswer('a  /   b')).toEqual(['a', 'b']);
  });

  it('never splits a slash with no space around it', () => {
    expect(splitAnswer('and/or')).toEqual(['and/or']);
  });
});

describe('sentenceParts', () => {
  it('splits a sentence into text and blanks, unfilled while there is no answer', () => {
    expect(sentenceParts('I ___ attention while the teacher ___.')).toEqual<SentencePart[]>([
      { kind: 'text', text: 'I ' },
      { kind: 'blank', fill: null, tight: false },
      { kind: 'text', text: ' attention while the teacher ' },
      { kind: 'blank', fill: null, tight: true },
      { kind: 'text', text: '.' },
    ]);
  });

  it('counts a longer underscore run as one blank, and leaves fewer than three underscores as text', () => {
    expect(sentenceParts('a_b _____ c')).toEqual<SentencePart[]>([
      { kind: 'text', text: 'a_b ' },
      { kind: 'blank', fill: null, tight: false },
      { kind: 'text', text: ' c' },
    ]);
  });

  it('fills each blank in order when the answer has one part per blank', () => {
    const parts = sentenceParts('I ___ attention while the teacher ___.', "wasn't paying / was speaking");
    expect(parts.filter((p) => p.kind === 'blank')).toEqual([
      { kind: 'blank', fill: "wasn't paying", tight: false },
      { kind: 'blank', fill: 'was speaking', tight: true },
    ]);
  });

  it('puts the whole answer in the first blank when the part count does not match the blank count', () => {
    expect(sentenceParts('She ___ to school.', 'goes / went').filter((p) => p.kind === 'blank')).toEqual([
      { kind: 'blank', fill: 'goes / went', tight: false },
    ]);
    expect(sentenceParts('I ___ while you ___.', 'goes').filter((p) => p.kind === 'blank')).toEqual([
      { kind: 'blank', fill: 'goes', tight: false },
      { kind: 'blank', fill: null, tight: true },
    ]);
  });

  it('returns the sentence as one text part when it has no blank', () => {
    expect(sentenceParts('What did she say?', 'hello')).toEqual<SentencePart[]>([
      { kind: 'text', text: 'What did she say?' },
    ]);
  });
});

describe('shuffleOptions', () => {
  /** A scripted random source: returns each value in turn. */
  function scripted(...values: number[]): () => number {
    let i = 0;
    return () => values[i++ % values.length]!;
  }

  const options = [
    { id: 'correct', text: 'goes' },
    { id: 'b', text: 'go' },
    { id: 'c', text: 'going' },
    { id: 'd', text: 'gone' },
  ];

  it('keeps every option, including the correct one, exactly once', () => {
    const shuffled = shuffleOptions(options, Math.random);
    expect(shuffled).toHaveLength(4);
    expect(shuffled.map((o) => o.id).sort()).toEqual(['b', 'c', 'correct', 'd']);
  });

  it('is deterministic for the same random source', () => {
    expect(shuffleOptions(options, scripted(0.1, 0.7, 0.4))).toEqual(shuffleOptions(options, scripted(0.1, 0.7, 0.4)));
  });

  it('can move the correct option away from the first position', () => {
    // Fisher-Yates from the end: 0 picks index 0 for each swap, so the first
    // item travels to the end.
    expect(shuffleOptions(options, scripted(0)).map((o) => o.id)).toEqual(['b', 'c', 'd', 'correct']);
  });

  it('never mutates its input', () => {
    const copy = options.map((o) => ({ ...o }));
    shuffleOptions(options, scripted(0.3));
    expect(options).toEqual(copy);
  });
});
