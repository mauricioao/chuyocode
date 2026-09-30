/**
 * Aventura scene engine — a PURE reducer over a {@link Scene} (zero I/O, zero
 * React, same posture as `@lib/activities/gameModes.ts`), so the whole
 * "advance / go back / answer a choice / retry / restart" state machine is
 * unit-testable without mounting anything.
 *
 * Branching is deliberately minimal (owner brief): a line's `choice` blocks
 * `ADVANCE` until answered correctly (wrong answers retry in place, never
 * lose progress); everything else advances linearly through `lines`, or
 * follows an authored `next` pointer when one is present.
 */
import type { Line, Scene } from './scene';

export type ChoiceState = 'unanswered' | 'wrong' | 'correct' | null;

export interface AventuraState {
  /** Index into `scene.lines` of the currently shown line. */
  index: number;
  /** `null` when the current line has no `choice`. */
  choiceState: ChoiceState;
  /** Index of the option last selected, for rendering its feedback — cleared on RETRY. */
  selectedOptionIndex: number | null;
  /** Unique grammar notes seen so far, in first-seen order — the end screen's summary. */
  learnedGrammar: import('./scene').GrammarNote[];
  /** Unique line ids visited so far — the "frases aprendidas" counter. */
  visitedLineIds: string[];
  /** Indices visited, in order, for BACK. */
  history: number[];
  phase: 'playing' | 'end';
}

export type AventuraAction =
  | { type: 'ADVANCE' }
  | { type: 'BACK' }
  | { type: 'SELECT_CHOICE'; optionIndex: number }
  | { type: 'RETRY' }
  | { type: 'RESTART' };

function choiceStateFor(line: Line | undefined): ChoiceState {
  return line?.choice ? 'unanswered' : null;
}

function recordVisit(state: AventuraState, line: Line): Pick<AventuraState, 'learnedGrammar' | 'visitedLineIds'> {
  const visitedLineIds = state.visitedLineIds.includes(line.id)
    ? state.visitedLineIds
    : [...state.visitedLineIds, line.id];
  const alreadyLearned = line.grammar && state.learnedGrammar.some((g) => g.title === line.grammar!.title);
  const learnedGrammar =
    line.grammar && !alreadyLearned ? [...state.learnedGrammar, line.grammar] : state.learnedGrammar;
  return { learnedGrammar, visitedLineIds };
}

/** The initial state, with the first line already recorded as visited/learned. */
export function initialAventuraState(scene: Scene): AventuraState {
  const first = scene.lines[0];
  const base: AventuraState = {
    index: 0,
    choiceState: choiceStateFor(first),
    selectedOptionIndex: null,
    learnedGrammar: [],
    visitedLineIds: [],
    history: [],
    phase: 'playing',
  };
  if (!first) return base;
  return { ...base, ...recordVisit(base, first) };
}

/** Resolve the index `line.next` (or, absent that, the next line in authored order) points to — `null` past the last line. */
function nextIndexFor(scene: Scene, line: Line, currentIndex: number): number | null {
  if (line.next !== undefined) {
    const target = scene.lines.findIndex((l) => l.id === line.next);
    return target === -1 ? null : target;
  }
  const target = currentIndex + 1;
  return target < scene.lines.length ? target : null;
}

export function aventuraReducer(scene: Scene, state: AventuraState, action: AventuraAction): AventuraState {
  const currentLine = scene.lines[state.index];

  switch (action.type) {
    case 'ADVANCE': {
      if (state.phase === 'end' || !currentLine) return state;
      // A choice must be answered correctly before the scene can move on.
      if (currentLine.choice && state.choiceState !== 'correct') return state;

      const nextIndex = nextIndexFor(scene, currentLine, state.index);
      if (nextIndex === null) {
        // The current index still names the last line shown (nothing to move
        // to), so it is pushed onto history too — BACK from the end screen
        // must redisplay that same last line, not skip past it to the one
        // before.
        return { ...state, phase: 'end', history: [...state.history, state.index] };
      }
      const nextLine = scene.lines[nextIndex]!;
      return {
        ...state,
        index: nextIndex,
        choiceState: choiceStateFor(nextLine),
        selectedOptionIndex: null,
        history: [...state.history, state.index],
        ...recordVisit(state, nextLine),
      };
    }

    case 'BACK': {
      if (state.history.length === 0) return state;
      const history = state.history.slice(0, -1);
      const prevIndex = state.history[state.history.length - 1]!;
      const prevLine = scene.lines[prevIndex]!;
      return {
        ...state,
        index: prevIndex,
        history,
        choiceState: choiceStateFor(prevLine),
        selectedOptionIndex: null,
        phase: 'playing',
      };
    }

    case 'SELECT_CHOICE': {
      if (!currentLine?.choice) return state;
      if (state.choiceState !== 'unanswered' && state.choiceState !== 'wrong') return state;
      const option = currentLine.choice.options[action.optionIndex];
      if (!option) return state;
      return {
        ...state,
        choiceState: option.correct ? 'correct' : 'wrong',
        selectedOptionIndex: action.optionIndex,
      };
    }

    case 'RETRY': {
      if (state.choiceState !== 'wrong') return state;
      return { ...state, choiceState: 'unanswered', selectedOptionIndex: null };
    }

    case 'RESTART':
      return initialAventuraState(scene);

    default:
      return state;
  }
}

/** `index + 1` out of `lines.length`, for the "Línea N/total" progress readout. */
export function progressLabel(scene: Scene, state: AventuraState): { current: number; total: number } {
  return { current: Math.min(state.index + 1, scene.lines.length), total: scene.lines.length };
}
