/**
 * chooseQuestion — pure reading of an "Elegir la respuesta" (`template:
 * 'choose'`) quiz block for its player (`QuizChoose.tsx`): which questions
 * are playable, how a sentence splits around its blanks, how the correct
 * answer fills them, and the per-play option shuffle.
 *
 * NO NEW PAYLOAD SHAPE (`blocks.ts`'s own `QuizTemplate` doc): a question is
 * exactly a Básico multiple-choice slot — `input: 'choice'`, its own pool of
 * options, `answer[0]` the correct pool item id, the optional `explanation`
 * ("¿Por qué?") — so grading, `findIncompleteBlock` and moderation already
 * understand it. Only the SENTENCE differs: it may carry one or two `___`
 * blanks, and an option written "wasn't paying / was speaking" fills them in
 * order once answered.
 *
 * Zero I/O, zero React — same posture as `gameModes.ts`.
 */
import { getSlotItems, splitLabelAtBlank, type Payload } from '@/lib/exercisePayload';

/** One option card's own content. */
export interface ChooseOption {
  id: string;
  text: string;
}

/** One playable question, derived from one choice slot. */
export interface ChooseQuestion {
  /** The slot id — also the key of this question's context image in `QuizBlock.promptImages`. */
  id: string;
  /** The slot's label, trimmed, still carrying its raw `___` blank markers. */
  sentence: string;
  /** Every option with text, in AUTHORED order (the author writes the correct one first; the player shuffles). */
  options: ChooseOption[];
  correctId: string;
  explanation?: string;
}

/** One run of a sentence: plain text, or a blank with its filled-in answer (`null` while unanswered). */
export type SentencePart =
  | { kind: 'text'; text: string }
  | {
      kind: 'blank';
      fill: string | null;
      /** The text right after this blank opens with punctuation, so the blank keeps tight to it. */
      tight: boolean;
    };

/** A run of whitespace, a slash, a run of whitespace — "wasn't paying / was speaking". */
const ANSWER_PART_SEPARATOR = /\s+\/\s+/;

/** Punctuation that sits right against the word before it. */
const LEADING_PUNCTUATION = /^[.,;:!?]/;

/**
 * Every playable question, in authored order. A choice slot is skipped until
 * it is playable: a non-blank sentence, at least two options with text, and
 * a correct answer that is one of them — the same bar `boardHasContent`
 * uses for the whole board. Any non-choice slot is ignored.
 */
export function deriveChooseQuestions(payload: Payload): ChooseQuestion[] {
  return payload.slots.flatMap((slot): ChooseQuestion[] => {
    if (slot.input !== 'choice') return [];
    const sentence = slot.label.trim();
    if (sentence.length === 0) return [];

    const options = getSlotItems(payload, slot).flatMap((item): ChooseOption[] => {
      const text = item.text?.trim() ?? '';
      return text.length > 0 ? [{ id: item.id, text }] : [];
    });
    if (options.length < 2) return [];

    const correctId = slot.answer[0];
    if (correctId === undefined || !options.some((option) => option.id === correctId)) return [];

    const question: ChooseQuestion = { id: slot.id, sentence, options, correctId };
    if (slot.explanation) question.explanation = slot.explanation;
    return [question];
  });
}

/** An answer's parts, one per blank: "wasn't paying / was speaking" -> ["wasn't paying", "was speaking"]. */
export function splitAnswer(answer: string): string[] {
  return answer
    .split(ANSWER_PART_SEPARATOR)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Split `sentence` into text and blanks, reusing `splitLabelAtBlank`'s own
 * blank rule (a run of three or more underscores) one blank at a time.
 *
 * With an `answer`, the blanks are filled: one part per blank in order when
 * {@link splitAnswer} yields exactly as many parts as there are blanks;
 * otherwise the WHOLE answer goes in the first blank and any other blank
 * stays empty — the counts disagree, so there is no honest way to share it
 * out.
 */
export function sentenceParts(sentence: string, answer?: string): SentencePart[] {
  const runs: Array<{ kind: 'text'; text: string } | { kind: 'blank' }> = [];
  let rest = sentence;
  for (let parts = splitLabelAtBlank(rest); parts; parts = splitLabelAtBlank(rest)) {
    if (parts.before) runs.push({ kind: 'text', text: parts.before });
    runs.push({ kind: 'blank' });
    rest = parts.after;
  }
  if (rest) runs.push({ kind: 'text', text: rest });

  const blankCount = runs.filter((run) => run.kind === 'blank').length;
  const pieces = answer === undefined ? [] : splitAnswer(answer);
  const fills =
    answer === undefined
      ? []
      : pieces.length === blankCount
        ? pieces
        : [answer.trim()];

  let blankIndex = 0;
  return runs.map((run, i): SentencePart => {
    if (run.kind === 'text') return run;
    const next = runs[i + 1];
    const tight = next !== undefined && next.kind === 'text' && LEADING_PUNCTUATION.test(next.text);
    const fill = fills[blankIndex] ?? null;
    blankIndex += 1;
    return { kind: 'blank', fill, tight };
  });
}

/**
 * A Fisher-Yates shuffle driven by `random` (`[0, 1)`, like `Math.random`),
 * so a test — or a seeded play — gets the same order every time. Keeps every
 * option, the correct one included, exactly once. Never mutates `items`.
 */
export function shuffleOptions<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
