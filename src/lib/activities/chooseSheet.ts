/**
 * chooseSheet — an "Elegir la respuesta" (`template: 'choose'`) block read
 * as a fixed SHEET: the print view (`imprimir.astro`) and the moderation
 * preview (`ModerationBlockPreview.tsx`) both show it this way.
 *
 * The player shuffles the options anew on every play; a sheet cannot. Each
 * question keeps ONE option order, from the player's own seeded shuffle
 * (`shuffleOptions` driven by `seededRandom(seedFromString(...))`) seeded by
 * the question id alone. So the same question always prints the same way
 * (a teacher can reprint the answer key and it still matches), wherever it
 * sits in the block, and the correct option — which the author always
 * stores FIRST — is not always "a)".
 *
 * Its own module rather than part of `chooseQuestion.ts`: the seeded random
 * lives in `gameModes.ts`, which already imports `chooseQuestion.ts`.
 *
 * Zero I/O, zero React.
 */
import type { Payload } from '@/lib/exercisePayload';
import { deriveChooseQuestions, sentenceParts, shuffleOptions, type SentencePart } from './chooseQuestion';
import { seededRandom, seedFromString } from './gameModes';

/** A blank's writing line on paper. */
export const SHEET_BLANK = '________';

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

/** One option, lettered in the sheet's own order. */
interface SheetOption {
  /** The pool item id. */
  id: string;
  /** `'a'`, `'b'`, … — printed as "a)". */
  letter: string;
  text: string;
  correct: boolean;
}

/** One question as a sheet shows it. */
export interface SheetQuestion {
  /** The slot id — also the key of its context image in `QuizBlock.promptImages`. */
  id: string;
  /** The sentence with every blank as {@link SHEET_BLANK}. */
  prompt: string;
  /**
   * The sentence with its blanks filled by the correct option (an "a / b"
   * option fills two blanks in order) — `null` when the sentence has no
   * blank, where the correct option alone is the answer.
   */
  filled: SentencePart[] | null;
  /** Every option, in this question's fixed shuffled order. */
  options: SheetOption[];
  /** The correct entry of {@link options}. */
  correct: SheetOption;
  explanation?: string;
}

/**
 * Every playable question of a choose block, in authored order — the same
 * questions the player plays (`deriveChooseQuestions`) — each with its
 * options lettered in its own fixed order.
 */
export function chooseSheetQuestions(payload: Payload): SheetQuestion[] {
  return deriveChooseQuestions(payload).map((question): SheetQuestion => {
    const order = shuffleOptions(question.options, seededRandom(seedFromString(question.id)));
    const options = order.map(
      (option, i): SheetOption => ({
        id: option.id,
        letter: LETTERS[i] ?? String(i + 1),
        text: option.text,
        correct: option.id === question.correctId,
      }),
    );
    // `deriveChooseQuestions` only keeps a question whose correct id is one of its options.
    const correct = options.find((option) => option.correct)!;

    const parts = sentenceParts(question.sentence);
    const hasBlank = parts.some((part) => part.kind === 'blank');
    const sheet: SheetQuestion = {
      id: question.id,
      prompt: parts.map((part) => (part.kind === 'text' ? part.text : SHEET_BLANK)).join(''),
      filled: hasBlank ? sentenceParts(question.sentence, correct.text) : null,
      options,
      correct,
    };
    if (question.explanation) sheet.explanation = question.explanation;
    return sheet;
  });
}
