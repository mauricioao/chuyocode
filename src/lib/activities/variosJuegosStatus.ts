/**
 * variosJuegosStatus — "Varios juegos"' own status-line data (owner R3: "the
 * status line tells what the content unlocks ... the point of 'Varios
 * juegos'"). Pure, zero React: `QuizBlockEditor.tsx` turns this into the
 * actual one-line, localized text; this module only derives WHAT to say,
 * reusing `gameModes.ts`'s own rules (`availableGameModes`,
 * `nearestLockedMode`) rather than re-deriving them, and `quizChecklist.ts`'s
 * own "submit-ready" rule for `ready` — so this can never disagree with
 * either.
 */
import { draftToPayload, type Draft } from '@/lib/authoringDraft';
import { listIncompleteQuestions } from '@/lib/quizChecklist';
import { availableGameModes, deriveGameItems, nearestLockedMode, type GameMode } from './gameModes';

export interface VariosJuegosStatus {
  /** Every authored row, complete or not — matches the card list's own count. */
  questionCount: number;
  /** Every question has an accepted answer (and, for a pooled one, enough valid options) — `quizChecklist.ts`'s own rule, AND at least one question exists. */
  ready: boolean;
  /** Every mode this content already plays as, besides the base `quiz` mode itself, in `availableGameModes`' own order. */
  unlockedModes: GameMode[];
  /** The locked mode closest to unlocking, and how many more questions would close that gap — `null` while not `ready`, or once nothing expressible is left locked. */
  nearestLocked: { mode: GameMode; gap: number } | null;
}

export function variosJuegosStatus(draft: Draft): VariosJuegosStatus {
  const payload = draftToPayload(draft);
  const items = deriveGameItems(payload);
  const questionCount = draft.blocks.filter((block) => block.kind === 'row').length;
  const ready = questionCount > 0 && listIncompleteQuestions(draft).length === 0;
  const unlockedModes = availableGameModes(items, payload).filter((mode) => mode !== 'quiz');
  const nearestLocked = ready ? nearestLockedMode(items, payload) : null;
  return { questionCount, ready, unlockedModes, nearestLocked };
}
