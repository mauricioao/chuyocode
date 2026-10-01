/**
 * quizExampleQuestions — the 3 ready-made A1 English sample questions a
 * brand-new, empty quiz block offers (owner build item 4, "example-first
 * empty state"): one `choice`, one `text`, one `select` gap, so "Usar este
 * ejemplo" demonstrates every pooled/non-pooled shape the redesigned card
 * editor supports, not just one of them.
 *
 * Pure, zero I/O — reuses `authoringDraft.ts`'s own setters, same as
 * `quizQuestionType.ts`, so this stays a thin recombination of already-proven
 * mutations. ID generation is the CALLER'S job (`authoringDraft.ts`'s own
 * rule): `nextId` mints every row/slot/pool/item id, so two calls (or two
 * quiz blocks) never collide and the result stays assertable with `toEqual`.
 */
import {
  addRowBlock,
  createEmptyDraft,
  setPool,
  setRowLabel,
  setSlotAnswer,
  setSlotInput,
  setSlotPool,
  type Draft,
} from './authoringDraft';

/** The 3 example questions' prompts, in order — used for both the actual draft and the empty state's own read-only preview list (`QuizBlockEditor.tsx`). */
export const EXAMPLE_QUESTION_PROMPTS: readonly string[] = [
  'What color is the sky?',
  'I ___ a student.',
  'She ___ to school every day.',
];

/**
 * Build a 3-question example `Draft`: a `choice` question, a `text`
 * question, and a `select` gap question — every one already has a correct
 * answer marked, so "Usar este ejemplo" hands back a submit-ready block, not
 * another empty one.
 */
export function createExampleDraft(nextId: () => string): Draft {
  let draft = createEmptyDraft();

  const row1 = nextId();
  const slot1 = nextId();
  draft = addRowBlock(draft, row1, slot1);
  draft = setRowLabel(draft, slot1, EXAMPLE_QUESTION_PROMPTS[0]!);
  draft = setSlotInput(draft, slot1, 'choice');
  const pool1 = nextId();
  draft = setSlotPool(draft, slot1, pool1);
  const blue = nextId();
  draft = setPool(draft, pool1, [
    { id: blue, text: 'Blue' },
    { id: nextId(), text: 'Red' },
    { id: nextId(), text: 'Green' },
  ]);
  draft = setSlotAnswer(draft, slot1, [blue]);

  const row2 = nextId();
  const slot2 = nextId();
  draft = addRowBlock(draft, row2, slot2);
  draft = setRowLabel(draft, slot2, EXAMPLE_QUESTION_PROMPTS[1]!);
  // `addRowBlock` already defaults a fresh slot's mechanic to `text`.
  draft = setSlotAnswer(draft, slot2, ['am']);

  const row3 = nextId();
  const slot3 = nextId();
  draft = addRowBlock(draft, row3, slot3);
  draft = setRowLabel(draft, slot3, EXAMPLE_QUESTION_PROMPTS[2]!);
  draft = setSlotInput(draft, slot3, 'select');
  const pool3 = nextId();
  draft = setSlotPool(draft, slot3, pool3);
  const goes = nextId();
  draft = setPool(draft, pool3, [
    { id: goes, text: 'goes' },
    { id: nextId(), text: 'go' },
    { id: nextId(), text: 'going' },
  ]);
  draft = setSlotAnswer(draft, slot3, [goes]);

  return draft;
}
