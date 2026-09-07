// @vitest-environment jsdom
/**
 * ExerciseIsland tests — the interactive half of the walking skeleton.
 *
 * Covers the spec scenarios this slice must prove:
 *  - an unknown `slot.input` degrades that slot only; the rest renders AND grades,
 *  - two slots grade independently,
 *  - a correct answer gives positive feedback with NO network call,
 *  - a wrong answer gives negative feedback,
 *  - remounting clears feedback (grading is stateless, there is no progress),
 *  - copy differs between es and en.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CHEVRON_PATH } from '@/lib/arrowControl';
import type { GradeResult } from '@/lib/exerciseGrading';
import type { Payload } from '@/lib/exercisePayload';
import { findVoseo, voseoWords } from '@/lib/neutralSpanish';
import { DROP_COPY } from './mechanics/DropRenderer';
import ExerciseIsland, {
  clearIncorrectAnswers,
  COPY,
  firstIncorrectSlotId,
} from './ExerciseIsland';

/** One choice slot. The smallest gradeable exercise. */
const single: Payload = {
  pools: {
    opts: [
      { id: 'a', text: 'sit' },
      { id: 'b', text: 'sits' },
    ],
  },
  slots: [
    { id: 's1', label: 'The cat ___', input: 'choice', pool: 'opts', answer: ['b'] },
  ],
};

/** Two independent choice slots sharing one pool. */
const pair: Payload = {
  pools: {
    opts: [
      { id: 'a', text: 'sit' },
      { id: 'b', text: 'sits' },
    ],
  },
  slots: [
    { id: 's1', label: 'First', input: 'choice', pool: 'opts', answer: ['b'] },
    { id: 's2', label: 'Second', input: 'choice', pool: 'opts', answer: ['a'] },
  ],
};

/** A gradeable slot next to one whose mechanic has not shipped. */
const mixed: Payload = {
  pools: {
    opts: [
      { id: 'a', text: 'sit' },
      { id: 'b', text: 'sits' },
    ],
  },
  slots: [
    { id: 's1', label: 'First', input: 'choice', pool: 'opts', answer: ['b'] },
    { id: 'h1', label: 'Tap it', input: 'hotspot', answer: ['x'] },
  ],
};

/** An exercise whose only mechanic has not shipped: nothing is answerable. */
const unanswerable: Payload = {
  pools: {},
  slots: [{ id: 'h1', label: 'Tap it', input: 'hotspot', answer: ['x'] }],
};

/**
 * The liveworksheets-shaped case the model was designed for: THREE different
 * mechanics in one exercise, each graded on its own.
 *
 * Deliberately gives the select pool ids that differ from their visible text
 * (`i_some` vs "some"), so an implementation reporting the option's label
 * instead of its id fails here rather than passing by coincidence.
 */
const threeMechanics: Payload = {
  pools: {
    opts: [
      { id: 'a', text: 'sit' },
      { id: 'b', text: 'sits' },
    ],
    qty: [
      { id: 'i_a', text: 'a' },
      { id: 'i_some', text: 'some' },
    ],
  },
  slots: [
    { id: 'c1', label: 'Choice slot', input: 'choice', pool: 'opts', answer: ['b'] },
    { id: 'd1', label: 'Dropdown slot', input: 'select', pool: 'qty', answer: ['i_some'] },
    { id: 't1', label: 'Blank slot ___', input: 'text', answer: ['sits', 'is sitting'] },
  ],
};

/**
 * Three independent blanks. One focusable control each, so "first incorrect in
 * DOCUMENT order" is unambiguous and every answer is directly readable off
 * `input.value` — which is what proves an answer survived correcting.
 */
const threeBlanks: Payload = {
  pools: {},
  slots: [
    { id: 't1', label: 'First ___', input: 'text', answer: ['one'] },
    { id: 't2', label: 'Second ___', input: 'text', answer: ['two'] },
    { id: 't3', label: 'Third ___', input: 'text', answer: ['three'] },
  ],
};

/**
 * TWO `drop` SLOTS READING ONE POOL — the case the island exists to keep honest.
 *
 * A pool is SHARED, and a renderer only ever sees its OWN answer. So nothing
 * inside `DropRenderer` can know that the tile it is about to offer is already
 * sitting in the question above it. Only the island holds the whole response,
 * which is why it — and not the renderer — derives `claimed`.
 *
 * Four tiles for two slots on purpose: with an exact-fit pool, "the tile
 * disappeared from the other slot" and "the other slot ran out of tiles" look
 * identical, and a broken implementation would pass by coincidence.
 */
const twoDropsOnePool: Payload = {
  pools: {
    quantities: [
      { id: 'q_some', text: 'some' },
      { id: 'q_any', text: 'any' },
      { id: 'q_much', text: 'much' },
      { id: 'q_many', text: 'many' },
    ],
  },
  slots: [
    {
      id: 'olives',
      label: 'There are ___ olives on the table.',
      input: 'drop',
      pool: 'quantities',
      answer: ['q_some'],
    },
    {
      id: 'bread',
      label: 'Is there ___ bread left?',
      input: 'drop',
      pool: 'quantities',
      answer: ['q_any'],
    },
  ],
};

/** A radio slot above a blank: the choice slot is the top-most control. */
const choiceThenBlank: Payload = {
  pools: {
    opts: [
      { id: 'a', text: 'sit' },
      { id: 'b', text: 'sits' },
    ],
  },
  slots: [
    { id: 'c1', label: 'Choice slot', input: 'choice', pool: 'opts', answer: ['b'] },
    { id: 't1', label: 'Blank ___', input: 'text', answer: ['one'] },
  ],
};

function dropdown(): HTMLSelectElement {
  return screen.getByRole('combobox') as HTMLSelectElement;
}

function blank(): HTMLInputElement {
  return screen.getByRole('textbox') as HTMLInputElement;
}

/**
 * Walk to the step showing slot `index`, from wherever we are.
 *
 * THE ISLAND RENDERS ONE SLOT AT A TIME, so a multi-slot exercise only ever has
 * one slot's controls in the DOM. Reaching the others is navigation, and this is
 * the learner's own path to them: press the real buttons. Rewinding with `prev`
 * first makes the helper absolute rather than relative, so a test never has to
 * track where a previous line left the stepper.
 *
 * A single-slot exercise ships NO stepper, so this is a no-op there — which is
 * what lets the same helper be dropped into a test that does not step.
 */
function goToSlot(index: number) {
  if (!screen.queryByTestId('exercise-stepper')) return;
  // Bounded: a stepper that never disables `prev` is a bug, and an unbounded
  // loop would hang the suite instead of failing it.
  for (let guard = 0; guard < 50; guard += 1) {
    const prev = screen.getByTestId('exercise-prev') as HTMLButtonElement;
    if (prev.disabled) break;
    fireEvent.click(prev);
  }
  for (let i = 0; i < index; i += 1) {
    fireEvent.click(screen.getByTestId('exercise-next'));
  }
}

/** Type into the blank on the CURRENT step, as a learner would. */
function typeHere(text: string) {
  fireEvent.change(blank(), { target: { value: text } });
}

/**
 * Answer one blank per slot, stepping between them. `''` leaves a slot
 * untouched, which is how a test says "the learner never answered this one".
 */
function fillBlanks(values: string[]) {
  values.forEach((value, index) => {
    goToSlot(index);
    if (value !== '') typeHere(value);
  });
}

function retryButton(): HTMLButtonElement {
  return screen.getByTestId('exercise-retry') as HTMLButtonElement;
}

function retry() {
  fireEvent.click(retryButton());
}

/** Click the option labelled `text` inside the slot's group. */
function choose(name: string, index = 0) {
  fireEvent.click(screen.getAllByRole('radio', { name })[index]!);
}

function submitButton(): HTMLButtonElement {
  return screen.getByTestId('exercise-submit') as HTMLButtonElement;
}

function submit() {
  fireEvent.click(screen.getByTestId('exercise-submit'));
}

/** The tiles slot `slotId` currently offers, by accessible name. */
function tilesIn(slotId: string): string[] {
  const pool = screen.getByTestId(`drop-pool-${slotId}`);
  return Array.from(pool.querySelectorAll('button')).map(
    (button) => button.getAttribute('aria-label') ?? '',
  );
}

/**
 * Drag a tile into a slot's box with the keyboard.
 *
 * The `await act` between presses is load-bearing: dnd-kit's `KeyboardSensor`
 * registers its document-level keydown handler inside a `setTimeout`, so a press
 * dispatched in the same tick as the pick-up lands before the sensor is
 * listening and is silently ignored.
 *
 * Each slot owns its own `DndContext`, so the drag below can only ever resolve
 * to that slot's single box — which is what makes this deterministic in jsdom,
 * where every rect is zero and collision detection has no geometry to work with.
 */
async function dropInto(slotId: string, tileName: string) {
  const pool = screen.getByTestId(`drop-pool-${slotId}`);
  const tile = Array.from(pool.querySelectorAll('button')).find(
    (button) => button.getAttribute('aria-label') === tileName,
  );
  if (!tile) throw new Error(`no tile named ${tileName} in slot ${slotId}`);

  fireEvent.keyDown(tile, { code: 'Space' });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  fireEvent.keyDown(document, { code: 'Space' });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ExerciseIsland — rendering', () => {
  it('renders one option per pool item for a choice slot', () => {
    render(<ExerciseIsland lang="en" payload={single} />);

    expect(screen.getByText('The cat ___')).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('degrades an unrenderable slot while the rest still renders', () => {
    render(<ExerciseIsland lang="en" payload={mixed} />);

    // The choice slot is fully interactive...
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.getByText('First')).toBeTruthy();

    // ...and the hotspot slot, one step away, shows the degraded notice.
    goToSlot(1);
    expect(screen.getByTestId('slot-unavailable-h1').textContent).toContain(
      'cannot be answered here yet',
    );
  });
});

describe('ExerciseIsland — grading', () => {
  it('gives positive feedback for a correct answer, with NO network call', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<ExerciseIsland lang="en" payload={single} />);
    choose('sits');
    submit();

    expect(screen.getByTestId('slot-feedback-s1').textContent).toContain(
      'Correct',
    );
    expect(screen.getByTestId('exercise-verdict').textContent).toContain(
      'All correct',
    );
    // Grading is stateless and client-side by design: nothing leaves the browser.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('gives negative feedback for a wrong answer', () => {
    render(<ExerciseIsland lang="en" payload={single} />);
    choose('sit');
    submit();

    expect(screen.getByTestId('slot-feedback-s1').textContent).toContain(
      'Incorrect',
    );
    expect(screen.getByTestId('exercise-verdict').textContent).toContain(
      'Review',
    );
  });

  it('grades two slots independently', () => {
    render(<ExerciseIsland lang="en" payload={pair} />);

    // Slot 1 answered correctly ('b'), slot 2 answered incorrectly ('b' vs 'a').
    choose('sits');
    goToSlot(1);
    choose('sits');
    submit();

    goToSlot(0);
    expect(screen.getByTestId('slot-feedback-s1').textContent).toContain(
      'Correct',
    );
    goToSlot(1);
    expect(screen.getByTestId('slot-feedback-s2').textContent).toContain(
      'Incorrect',
    );
  });

  it('never marks an unrenderable slot incorrect, and stays winnable', () => {
    render(<ExerciseIsland lang="en" payload={mixed} />);
    choose('sits');
    submit();

    // It does not poison the exercise the learner could actually answer...
    expect(screen.getByTestId('slot-feedback-s1').textContent).toContain(
      'Correct',
    );
    expect(screen.getByTestId('exercise-verdict').textContent).toContain(
      'All correct',
    );
    // ...and the degraded slot gets NO correct/incorrect verdict at all.
    goToSlot(1);
    expect(screen.queryByTestId('slot-feedback-h1')).toBeNull();
  });

  it('shows no feedback before the learner submits', () => {
    render(<ExerciseIsland lang="en" payload={single} />);
    choose('sits');

    expect(screen.queryByTestId('exercise-verdict')).toBeNull();
    expect(screen.queryByTestId('slot-feedback-s1')).toBeNull();
  });
});

/**
 * The gate itself is proved in `src/lib/exerciseSubmit.test.ts`, against the
 * pure rule and a one-line registry fake. What is left here is the wiring: that
 * the island really renders that rule onto a real `disabled` attribute, and that
 * it re-applies after a retry.
 */
describe('ExerciseIsland — submit gating', () => {
  it('disables submit until the learner has answered something', () => {
    render(<ExerciseIsland lang="en" payload={single} />);

    // A REAL attribute, not a dimmed style: not answering yet is a non-attempt,
    // not a mistake, and keyboard/screen-reader users must get the same signal.
    expect(submitButton().hasAttribute('disabled')).toBe(true);
    expect(submitButton().disabled).toBe(true);
  });

  it('grades nothing when a disabled submit is clicked', () => {
    render(<ExerciseIsland lang="en" payload={single} />);

    fireEvent.click(submitButton());

    // The whole point: a non-attempt must never be scored "Incorrect".
    expect(screen.queryByTestId('exercise-verdict')).toBeNull();
    expect(screen.queryByTestId('slot-feedback-s1')).toBeNull();
  });

  it('enables submit once the only slot of the exercise is answered', () => {
    render(<ExerciseIsland lang="en" payload={single} />);
    expect(submitButton().disabled).toBe(true);

    choose('sits');

    expect(submitButton().disabled).toBe(false);
    expect(submitButton().hasAttribute('disabled')).toBe(false);
  });

  it('REJECTS a partial answer: every slot has to be answered', () => {
    render(<ExerciseIsland lang="en" payload={pair} />);
    expect(submitButton().disabled).toBe(true);

    // Answer slot 1 only, and never even visit slot 2 — the realistic shape of
    // a partial attempt now that the learner has to walk to the second
    // question. Grading here would mark them Incorrect on a question they have
    // not been shown.
    choose('sits');
    expect(submitButton().disabled).toBe(true);

    goToSlot(1);
    choose('sits');

    expect(submitButton().disabled).toBe(false);
    submit();
    goToSlot(0);
    expect(screen.getByTestId('slot-feedback-s1').textContent).toContain(
      'Correct',
    );
    goToSlot(1);
    expect(screen.getByTestId('slot-feedback-s2').textContent).toContain(
      'Incorrect',
    );
  });

  it('disables submit again after the learner resets with retry', () => {
    render(<ExerciseIsland lang="en" payload={single} />);
    choose('sits');
    submit();

    fireEvent.click(screen.getByTestId('exercise-retry'));

    expect(submitButton().disabled).toBe(true);
  });

  /**
   * THE GATE RE-ARMS AFTER A PARTIAL CORRECTION.
   *
   * Correcting clears only the WRONG answers, so the response comes back with a
   * hole in it — and a hole means the exercise is unfinished again. Without the
   * gate re-applying, the learner could press Check straight after correcting
   * and be marked Incorrect on the very slot they were just told to redo.
   */
  it('re-locks submit after correcting, until the cleared slot is answered again', () => {
    render(<ExerciseIsland lang="en" payload={pair} />);

    choose('sits'); // s1 correct
    goToSlot(1);
    choose('sits'); // s2 wrong
    submit();

    retry();

    expect(submitButton().disabled).toBe(true);

    // The surviving correct answer is still there — only the wrong one was
    // cleared — so a single re-answer is all that is needed.
    goToSlot(1);
    choose('sit');

    expect(submitButton().disabled).toBe(false);
  });

  it('never offers an enabled submit when no slot can be rendered', () => {
    render(<ExerciseIsland lang="en" payload={unanswerable} />);

    expect(screen.getByTestId('slot-unavailable-h1')).toBeTruthy();
    expect(submitButton().disabled).toBe(true);
    // "Pick an answer" would be a LIE here: there is nothing to pick.
    expect(screen.queryByTestId('exercise-submit-hint')).toBeNull();
  });
});

describe('ExerciseIsland — disabled submit hint', () => {
  it('explains why submit is disabled and wires the hint to the button', () => {
    render(<ExerciseIsland lang="en" payload={single} />);

    const hint = screen.getByTestId('exercise-submit-hint');
    // The copy must describe the rule that is actually enforced. "At least one"
    // was true of the old gate and would now be a lie told to the only user who
    // has nothing else to go on.
    expect(hint.textContent).toContain('Answer every part');
    // A bare disabled button announces nothing; describedby carries the reason.
    expect(hint.id.length).toBeGreaterThan(0);
    expect(submitButton().getAttribute('aria-describedby')).toBe(hint.id);
  });

  it('drops the hint once submit is usable', () => {
    render(<ExerciseIsland lang="en" payload={single} />);
    choose('sits');

    expect(screen.queryByTestId('exercise-submit-hint')).toBeNull();
    expect(submitButton().getAttribute('aria-describedby')).toBeNull();
  });

  it('localizes the hint to Spanish', () => {
    render(<ExerciseIsland lang="es" payload={single} />);

    expect(screen.getByTestId('exercise-submit-hint').textContent).toContain(
      'Responder todas las partes',
    );
  });
});

describe('ExerciseIsland — mixed mechanics in one exercise', () => {
  it('renders a distinct control for each of the three mechanics', () => {
    render(<ExerciseIsland lang="en" payload={threeMechanics} />);

    expect(screen.getAllByRole('radio')).toHaveLength(2);

    goToSlot(1);
    expect(dropdown()).toBeTruthy();
    goToSlot(2);
    expect(blank()).toBeTruthy();

    // Nothing degraded: all three mechanics ship a renderer now.
    expect(screen.queryByTestId('slot-unavailable-d1')).toBeNull();
    expect(screen.queryByTestId('slot-unavailable-t1')).toBeNull();
  });

  it('grades all three slots INDEPENDENTLY when each is correct', () => {
    render(<ExerciseIsland lang="en" payload={threeMechanics} />);

    choose('sits');
    goToSlot(1);
    fireEvent.change(dropdown(), { target: { value: 'i_some' } });
    goToSlot(2);
    // Sloppy casing and padding on purpose: the `text` comparator normalizes,
    // and it only gets the chance if the renderer reported the string RAW.
    typeHere('  SITS ');
    submit();

    goToSlot(0);
    expect(screen.getByTestId('slot-feedback-c1').textContent).toContain('Correct');
    goToSlot(1);
    expect(screen.getByTestId('slot-feedback-d1').textContent).toContain('Correct');
    goToSlot(2);
    expect(screen.getByTestId('slot-feedback-t1').textContent).toContain('Correct');
    // The verdict is about the WHOLE exercise, so it is on screen at every step.
    expect(screen.getByTestId('exercise-verdict').textContent).toContain('All correct');
  });

  it('marks only the wrong slot wrong, leaving the other two correct', () => {
    render(<ExerciseIsland lang="en" payload={threeMechanics} />);

    choose('sits');
    // Wrong dropdown id...
    goToSlot(1);
    fireEvent.change(dropdown(), { target: { value: 'i_a' } });
    goToSlot(2);
    typeHere('is sitting');
    submit();

    goToSlot(0);
    expect(screen.getByTestId('slot-feedback-c1').textContent).toContain('Correct');
    goToSlot(1);
    expect(screen.getByTestId('slot-feedback-d1').textContent).toContain('Incorrect');
    goToSlot(2);
    // ...and the second accepted alternative still passes the text slot.
    expect(screen.getByTestId('slot-feedback-t1').textContent).toContain('Correct');
    expect(screen.getByTestId('exercise-verdict').textContent).toContain('Review');
  });

  it('fails the text slot when the typed word is simply wrong', () => {
    render(<ExerciseIsland lang="en" payload={threeMechanics} />);

    choose('sits');
    goToSlot(1);
    fireEvent.change(dropdown(), { target: { value: 'i_some' } });
    goToSlot(2);
    typeHere('sitting');
    submit();

    // Guards against a renderer that reports a constant, or a comparator wired
    // to always match: a genuinely wrong answer must still be rejected.
    expect(screen.getByTestId('slot-feedback-t1').textContent).toContain('Incorrect');
  });

  it('re-locks submit when any ONE of the three slots is emptied again', () => {
    render(<ExerciseIsland lang="en" payload={threeMechanics} />);
    expect(submitButton().disabled).toBe(true);

    choose('sits');
    goToSlot(1);
    fireEvent.change(dropdown(), { target: { value: 'i_some' } });
    // Two of three: still an unfinished exercise.
    expect(submitButton().disabled).toBe(true);

    goToSlot(2);
    typeHere('s');
    expect(submitButton().disabled).toBe(false);

    // An emptied text field is a NON-ANSWER, not the answer "" — so the gate
    // closes again on the slot the learner just gave up on.
    typeHere('');
    expect(submitButton().disabled).toBe(true);
    typeHere('sits');
    expect(submitButton().disabled).toBe(false);

    // Same for a dropdown put back on its placeholder, and it re-locks from a
    // slot that is NOT the one on screen — the gate reads the whole response,
    // not the visible step.
    goToSlot(1);
    fireEvent.change(dropdown(), { target: { value: '' } });
    expect(submitButton().disabled).toBe(true);
  });

  it('locks every control once the exercise has been graded', () => {
    render(<ExerciseIsland lang="en" payload={threeMechanics} />);

    choose('sits');
    goToSlot(1);
    fireEvent.change(dropdown(), { target: { value: 'i_some' } });
    goToSlot(2);
    typeHere('sits');
    submit();

    // Locked on EVERY step, not only the one grading happened to be on: the
    // learner walks back through the slots to read their verdicts.
    goToSlot(1);
    expect(dropdown().disabled).toBe(true);
    goToSlot(2);
    expect(blank().disabled).toBe(true);
  });

  it('localizes the dropdown placeholder', () => {
    render(<ExerciseIsland lang="es" payload={threeMechanics} />);

    goToSlot(1);
    expect(screen.getByRole('option', { name: 'Elegir una opción' })).toBeTruthy();
    cleanup();

    render(<ExerciseIsland lang="en" payload={threeMechanics} />);
    goToSlot(1);
    expect(screen.getByRole('option', { name: 'Choose an option' })).toBeTruthy();
  });
});

describe('ExerciseIsland — two drop slots sharing one pool', () => {
  it('offers the whole pool to both slots before anything is placed', () => {
    render(<ExerciseIsland lang="en" payload={twoDropsOnePool} />);

    expect(tilesIn('olives')).toEqual(['some', 'any', 'much', 'many']);
    goToSlot(1);
    expect(tilesIn('bread')).toEqual(['some', 'any', 'much', 'many']);
  });

  /**
   * THE BUG THIS BLOCK EXISTS TO PREVENT.
   *
   * `DropRenderer` derives its pool from its OWN answer plus `claimed`. If the
   * island never computes `claimed`, the second slot keeps offering a tile that
   * is already in the first slot's box — so the learner can answer with the same
   * tile twice and the shared pool is a lie. Nothing throws, nothing logs, and
   * both slots look perfectly normal.
   */
  it('withdraws a placed tile from the OTHER slot', async () => {
    render(<ExerciseIsland lang="en" payload={twoDropsOnePool} />);

    await dropInto('olives', 'some');

    // Gone from the slot that consumed it...
    expect(tilesIn('olives')).not.toContain('some');
    // ...and, the part only the island can know, gone from its sibling too.
    // The sibling is a step away and MOUNTS FRESH when the learner reaches it,
    // so this also proves `claimed` is recomputed rather than captured once.
    goToSlot(1);
    expect(tilesIn('bread')).toEqual(['any', 'much', 'many']);
  });

  it('leaves the rest of the pool alone', async () => {
    render(<ExerciseIsland lang="en" payload={twoDropsOnePool} />);

    await dropInto('olives', 'some');

    // Three tiles for one remaining slot: consuming one tile must not look like
    // exhausting the pool.
    goToSlot(1);
    expect(tilesIn('bread')).toHaveLength(3);
  });

  it('lets each slot consume a different tile independently', async () => {
    render(<ExerciseIsland lang="en" payload={twoDropsOnePool} />);

    await dropInto('olives', 'some');
    goToSlot(1);
    await dropInto('bread', 'any');

    expect(tilesIn('bread')).toEqual(['much', 'many']);
    goToSlot(0);
    expect(tilesIn('olives')).toEqual(['much', 'many']);
  });

  it('returns a removed tile to BOTH slots', async () => {
    render(<ExerciseIsland lang="en" payload={twoDropsOnePool} />);

    await dropInto('olives', 'some');
    fireEvent.click(
      screen.getByRole('button', { name: DROP_COPY.en.remove('some') }),
    );

    // Derived, not stored: nothing names the tile any more, so it is back.
    expect(tilesIn('olives')).toContain('some');
    goToSlot(1);
    expect(tilesIn('bread')).toContain('some');
  });

  it('grades both drop slots instead of excluding them from the verdict', async () => {
    render(<ExerciseIsland lang="en" payload={twoDropsOnePool} />);

    await dropInto('olives', 'some');
    goToSlot(1);
    await dropInto('bread', 'any');
    submit();

    goToSlot(0);
    expect(screen.getByTestId('slot-feedback-olives').textContent).toBe(
      COPY.en.correct,
    );
    goToSlot(1);
    expect(screen.getByTestId('slot-feedback-bread').textContent).toBe(
      COPY.en.correct,
    );
    expect(screen.getByTestId('exercise-verdict').textContent).toBe(
      COPY.en.allCorrect,
    );
  });

  it('grades a wrong tile as incorrect rather than unavailable', async () => {
    render(<ExerciseIsland lang="en" payload={twoDropsOnePool} />);

    await dropInto('olives', 'much');
    goToSlot(1);
    await dropInto('bread', 'any');
    submit();

    goToSlot(0);
    expect(screen.getByTestId('slot-feedback-olives').textContent).toBe(
      COPY.en.incorrect,
    );
  });

  it('unlocks submit only once BOTH boxes hold a tile', async () => {
    render(<ExerciseIsland lang="en" payload={twoDropsOnePool} />);

    // An untouched exercise is a NON-ATTEMPT, not a wrong answer.
    expect(submitButton().disabled).toBe(true);

    await dropInto('olives', 'some');
    // One box filled, one still empty: the exercise is not finished.
    expect(submitButton().disabled).toBe(true);

    goToSlot(1);
    await dropInto('bread', 'any');

    expect(submitButton().disabled).toBe(false);
  });

  it('gives a wrongly placed tile back for a second attempt', async () => {
    render(<ExerciseIsland lang="en" payload={twoDropsOnePool} />);

    await dropInto('olives', 'much');
    goToSlot(1);
    await dropInto('bread', 'any');
    submit();
    retry();

    // The wrong answer was cleared, so its tile is claimable again — by either
    // slot. A learner who must redo a slot needs its tiles back.
    expect(tilesIn('olives')).toContain('much');
    goToSlot(1);
    expect(tilesIn('bread')).toContain('much');
  });
});

describe('ExerciseIsland — locale reaches the mechanics', () => {
  /**
   * `drop` is the first mechanic whose chrome is whole SENTENCES rather than one
   * label, so `placeholder` could not carry it and the island had to pass `lang`.
   * Untested, a Spanish page would narrate its drag-and-drop in English and no
   * automated check would notice.
   */
  it('narrates a Spanish exercise in Spanish', () => {
    render(<ExerciseIsland lang="es" payload={twoDropsOnePool} />);

    expect(document.body.textContent).toContain(DROP_COPY.es.instructions);
  });

  it('narrates an English exercise in English', () => {
    render(<ExerciseIsland lang="en" payload={twoDropsOnePool} />);

    expect(document.body.textContent).toContain(DROP_COPY.en.instructions);
  });
});

/**
 * The stopwatch, seen from the outside.
 *
 * The RULES (the stop condition, the formatting past a minute and past ten) are
 * proved against pure functions in `exerciseStopwatch.test.ts`. What is left
 * here is the wiring that only exists once React owns an interval: that it runs
 * on every exercise without being asked to, WHICH verdict stops it, which one
 * does not, when it goes back to zero, and that nothing keeps ticking after
 * unmount.
 *
 * It is deliberately proved on `single` — the plainest exercise in the file,
 * carrying no clock configuration of any kind, because there is none to carry.
 */
describe('ExerciseIsland — stopwatch', () => {
  function clock(): HTMLElement | null {
    return screen.queryByTestId('exercise-stopwatch');
  }

  function verdict(): HTMLElement | null {
    return screen.queryByTestId('exercise-verdict');
  }

  /** Let `seconds` of wall time pass. */
  async function elapse(seconds: number) {
    await act(async () => {
      vi.advanceTimersByTime(seconds * 1000);
    });
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * NO CONFIGURATION. The countdown this replaced only appeared on an exercise
   * that authored a `timer`, so the overwhelming majority of exercises showed no
   * clock at all. The inversion is the whole point of the change: every exercise
   * is measured, and `single` proves it because it authors nothing.
   */
  it('starts at zero on an exercise that configures nothing, and advances', async () => {
    vi.useFakeTimers();
    render(<ExerciseIsland lang="en" payload={single} />);

    expect(clock()?.textContent).toContain('00:00');

    await elapse(1);
    expect(clock()?.textContent).toContain('00:01');

    await elapse(64);
    expect(clock()?.textContent).toContain('01:05');
  });

  /**
   * THE REGRESSION THAT MATTERS MOST, inherited from the countdown: the clock
   * has no power to end an exercise. It measures. Ten minutes of ticking must
   * produce a reading, never a verdict.
   */
  it('never grades an exercise on its own, however long it runs', async () => {
    vi.useFakeTimers();
    render(<ExerciseIsland lang="en" payload={single} />);

    await elapse(600);

    expect(verdict()).toBeNull();
    expect(clock()?.textContent).toContain('10:00');
  });

  it('stops on a fully correct submission — the finish line', async () => {
    vi.useFakeTimers();
    render(<ExerciseIsland lang="en" payload={single} />);

    await elapse(4);
    choose('sits');
    submit();

    expect(verdict()?.textContent).toBe(COPY.en.allCorrect);
    const finished = clock()?.textContent;

    await elapse(30);

    expect(clock()?.textContent).toBe(finished);
    expect(finished).toContain('00:04');
  });

  /**
   * THE REVERSAL OF THE COUNTDOWN'S RULE, and the one most likely to be "fixed"
   * back by someone reading the old module's reasoning.
   *
   * The countdown PAUSED while feedback was on screen: it was a budget, and
   * draining it punished the learner for reading the verdict we asked them to
   * read. A stopwatch has no budget. Freezing it here would make it report
   * something other than elapsed time — a three-minute struggle could read
   * `00:40` purely because the learner spent it looking at a verdict. On a wrong
   * answer, reading why IS the work.
   */
  it('keeps running while an incorrect verdict is on screen', async () => {
    vi.useFakeTimers();
    render(<ExerciseIsland lang="en" payload={single} />);

    choose('sit');
    submit();
    expect(verdict()?.textContent).toBe(COPY.en.someWrong);

    await elapse(5);

    expect(clock()?.textContent).toContain('00:05');
  });

  it('keeps running through the correction cycle, without jumping backwards', async () => {
    vi.useFakeTimers();
    render(<ExerciseIsland lang="en" payload={single} />);

    await elapse(3);
    choose('sit');
    submit();
    await elapse(2);

    // `Fix` is the SAME attempt continuing — it clears the wrong answers, not
    // the clock. A reset here would hand the learner a shorter time for having
    // got it wrong, which is exactly backwards.
    retry();
    expect(clock()?.textContent).toContain('00:05');

    await elapse(1);
    expect(clock()?.textContent).toContain('00:06');
  });

  it('resets to zero when the learner retries from scratch', async () => {
    vi.useFakeTimers();
    render(<ExerciseIsland lang="en" payload={single} />);

    await elapse(7);
    choose('sits');
    submit();
    expect(verdict()?.textContent).toBe(COPY.en.allCorrect);

    // A correct verdict ends the attempt, so this button discards it whole.
    retry();

    expect(clock()?.textContent).toContain('00:00');
  });

  it('runs again after a reset, rather than staying stopped at zero', async () => {
    vi.useFakeTimers();
    render(<ExerciseIsland lang="en" payload={single} />);

    choose('sits');
    submit();
    retry();

    await elapse(2);

    expect(clock()?.textContent).toContain('00:02');
  });

  it('clears its interval on unmount', async () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');

    const { unmount } = render(<ExerciseIsland lang="en" payload={single} />);
    await elapse(1);
    unmount();

    expect(clearSpy).toHaveBeenCalled();

    // And nothing is left running: a leaked interval would keep calling
    // `setElapsed` on an unmounted tree.
    const callsAfterUnmount = vi.getTimerCount();
    expect(callsAfterUnmount).toBe(0);
  });

  it('localizes the stopwatch label', () => {
    vi.useFakeTimers();
    render(<ExerciseIsland lang="es" payload={single} />);

    expect(clock()?.textContent).toContain(COPY.es.elapsed);
  });
});

describe('ExerciseIsland — statelessness', () => {
  it('clears feedback on remount: there is no progress to remember', () => {
    const { unmount } = render(<ExerciseIsland lang="en" payload={single} />);
    choose('sits');
    submit();
    expect(screen.getByTestId('exercise-verdict')).toBeTruthy();

    unmount();
    render(<ExerciseIsland lang="en" payload={single} />);

    expect(screen.queryByTestId('exercise-verdict')).toBeNull();
    expect(
      screen.getByRole('radio', { name: 'sits' }).getAttribute('aria-checked'),
    ).toBe('false');
  });

  it('lets the learner retry, which clears the previous verdict', () => {
    render(<ExerciseIsland lang="en" payload={single} />);
    choose('sit');
    submit();
    expect(screen.getByTestId('exercise-verdict').textContent).toContain(
      'Review',
    );

    fireEvent.click(screen.getByTestId('exercise-retry'));

    expect(screen.queryByTestId('exercise-verdict')).toBeNull();
    expect(screen.getByTestId('exercise-submit')).toBeTruthy();
  });
});

describe('clearIncorrectAnswers', () => {
  /** Build a grade result without going through `check()`. */
  const graded = (slots: GradeResult['slots']): GradeResult => ({
    correct: Object.values(slots).every((o) => o !== 'incorrect'),
    slots,
  });

  it('drops the wrong answers and keeps the right ones', () => {
    const next = clearIncorrectAnswers(
      { t1: ['one'], t2: ['nope'], t3: ['three'] },
      graded({ t1: 'correct', t2: 'incorrect', t3: 'correct' }),
    );

    expect(next).toEqual({ t1: ['one'], t3: ['three'] });
  });

  // An `unavailable` slot is neither right nor wrong — it was never OFFERED.
  // Clearing it would silently discard data the learner cannot re-enter,
  // because that mechanic ships no control at all.
  it('leaves an unavailable slot untouched', () => {
    const next = clearIncorrectAnswers(
      { s1: ['b'], h1: ['x'] },
      graded({ s1: 'incorrect', h1: 'unavailable' }),
    );

    expect(next).toEqual({ h1: ['x'] });
  });

  it('keeps an entry the grader never reported at all', () => {
    // Defensive: a response key with no outcome is not evidence of a mistake.
    const next = clearIncorrectAnswers({ ghost: ['x'] }, graded({}));

    expect(next).toEqual({ ghost: ['x'] });
  });

  it('does not mutate the response it was given', () => {
    const before = { t1: ['one'], t2: ['nope'] };

    clearIncorrectAnswers(before, graded({ t1: 'correct', t2: 'incorrect' }));

    expect(before).toEqual({ t1: ['one'], t2: ['nope'] });
  });
});

describe('firstIncorrectSlotId', () => {
  it('returns null when nothing is wrong', () => {
    expect(
      firstIncorrectSlotId(threeBlanks, {
        correct: true,
        slots: { t1: 'correct', t2: 'correct', t3: 'correct' },
      }),
    ).toBeNull();
  });

  // The important one. `result.slots` is a plain object, so iterating IT walks
  // insertion order, which is not the order the learner sees. Only the payload
  // defines document order, and the island renders `payload.slots` in sequence.
  it('walks PAYLOAD order, not the order of the result keys', () => {
    const reversedKeys: GradeResult = {
      correct: false,
      slots: { t3: 'incorrect', t2: 'incorrect', t1: 'correct' },
    };

    expect(firstIncorrectSlotId(threeBlanks, reversedKeys)).toBe('t2');
  });

  it('skips an unavailable slot that sits above the first wrong one', () => {
    const payload: Payload = {
      pools: {},
      slots: [
        { id: 'h1', label: 'Tap it', input: 'hotspot', answer: ['x'] },
        { id: 't1', label: 'Blank ___', input: 'text', answer: ['one'] },
      ],
    };

    expect(
      firstIncorrectSlotId(payload, {
        correct: false,
        slots: { h1: 'unavailable', t1: 'incorrect' },
      }),
    ).toBe('t1');
  });
});

describe('ExerciseIsland — correcting keeps work that was already right', () => {
  it('keeps the correct answers and clears only the wrong one', () => {
    render(<ExerciseIsland lang="en" payload={threeBlanks} />);

    fillBlanks(['one', 'nope', 'three']);
    submit();

    goToSlot(1);
    expect(screen.getByTestId('slot-feedback-t2').textContent).toContain(
      'Incorrect',
    );

    retry();

    // The wrong one is CLEARED, not left in place: a value that was just marked
    // wrong, with its verdict now gone, invites re-submitting it unchanged.
    // Correcting lands ON that slot, so this is the blank now on screen.
    expect(blank().value).toBe('');
    // Four of five right and being made to redo all five is the bug this fixes.
    goToSlot(0);
    expect(blank().value).toBe('one');
    goToSlot(2);
    expect(blank().value).toBe('three');
  });

  it('unlocks the controls after correcting, and re-arms the submit gate', () => {
    render(<ExerciseIsland lang="en" payload={threeBlanks} />);

    fillBlanks(['one', 'nope', 'three']);
    submit();
    goToSlot(0);
    expect(blank().disabled).toBe(true);

    retry();

    for (const index of [0, 1, 2]) {
      goToSlot(index);
      expect(blank().disabled).toBe(false);
      expect(blank().hasAttribute('disabled')).toBe(false);
    }
    expect(screen.queryByTestId('exercise-verdict')).toBeNull();

    // Correcting punched a HOLE in the response, so the exercise is unfinished
    // again and the gate closes with it. Otherwise the learner could press Check
    // immediately and be marked Incorrect on the blank they were just told to
    // redo — the exact loop the gate exists to prevent.
    expect(submitButton().disabled).toBe(true);

    // The two surviving correct answers were NOT cleared, so re-answering the
    // one that was is all it takes: the learner is one blank away from
    // finishing, not back at an empty exercise.
    goToSlot(1);
    typeHere('two');
    expect(submitButton().disabled).toBe(false);
  });

  it('moves focus to the incorrect control', () => {
    render(<ExerciseIsland lang="en" payload={threeBlanks} />);

    fillBlanks(['one', 'nope', 'three']);
    submit();

    retry();

    // CORRECTING STEPS TO THE SLOT AND THEN FOCUSES IT. Only one slot is
    // mounted, so a focus request aimed at a slot the learner cannot see would
    // fall through silently — they would be told to fix something off-screen.
    expect(screen.getByTestId('exercise-step').textContent).toContain('2 of 3');
    // Focus must also land AFTER the re-render that re-enables the field:
    // focusing a still-disabled element is a silent no-op.
    expect(document.activeElement).toBe(blank());
  });

  it('focuses the TOP-most wrong control when two are wrong', () => {
    render(<ExerciseIsland lang="en" payload={threeBlanks} />);

    fillBlanks(['nope', 'also-nope', 'three']);
    submit();

    retry();

    // Not the last one the loop happened to touch: the learner reads top-down,
    // so correcting rewinds to the FIRST wrong slot.
    expect(screen.getByTestId('exercise-step').textContent).toContain('1 of 3');
    expect(document.activeElement).toBe(blank());
    expect(blank().value).toBe('');
  });

  it('focuses a choice slot WITHOUT answering it on the learner s behalf', () => {
    render(<ExerciseIsland lang="en" payload={choiceThenBlank} />);

    choose('sit'); // wrong
    goToSlot(1);
    typeHere('one'); // correct
    submit();

    retry();

    const first = screen.getAllByRole('radio')[0]!;
    expect(document.activeElement).toBe(first);
    // Radix only auto-checks on focus when an ARROW KEY is down (verified in
    // @radix-ui/react-radio-group/dist/index.mjs L369-373). A programmatic
    // focus must therefore leave the group unanswered — otherwise we would be
    // picking an answer for the learner and grading them on it.
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio.getAttribute('aria-checked')).toBe('false');
    }
    // ...and the blank they got right is still filled in.
    goToSlot(1);
    expect(blank().value).toBe('one');
  });

  it('focuses a dropdown slot', () => {
    render(<ExerciseIsland lang="en" payload={threeMechanics} />);

    choose('sits');
    goToSlot(1);
    fireEvent.change(dropdown(), { target: { value: 'i_a' } }); // wrong
    goToSlot(2);
    typeHere('sits');
    submit();

    retry();

    expect(document.activeElement).toBe(dropdown());
    expect(dropdown().value).toBe('');
  });

  it('still clears EVERYTHING when the whole exercise was correct', () => {
    render(<ExerciseIsland lang="en" payload={threeBlanks} />);

    fillBlanks(['one', 'two', 'three']);
    submit();
    expect(screen.getByTestId('exercise-verdict').textContent).toContain(
      'All correct',
    );

    retry();

    // Nothing to fix, so the button means "start over" — and it must really
    // start over, not silently preserve the finished attempt. Including the
    // step: a fresh attempt begins at the first question.
    expect(screen.getByTestId('exercise-step').textContent).toContain('1 of 3');
    for (const index of [0, 1, 2]) {
      goToSlot(index);
      expect(blank().value).toBe('');
    }
    expect(submitButton().disabled).toBe(true);
  });

  it('labels the two outcomes differently, in both locales', () => {
    render(<ExerciseIsland lang="en" payload={single} />);
    choose('sits');
    submit();
    const allRight = retryButton().textContent;
    cleanup();

    render(<ExerciseIsland lang="en" payload={single} />);
    choose('sit');
    submit();
    const someWrong = retryButton().textContent;

    expect(allRight).toBe('Try again');
    expect(someWrong).toBe('Fix');
    expect(allRight).not.toBe(someWrong);
    cleanup();

    render(<ExerciseIsland lang="es" payload={single} />);
    choose('sit');
    submit();
    expect(retryButton().textContent).toBe('Corregir');
  });

  it('keeps the correct-button label to a single word in both locales', () => {
    // "Corregir las incorrectas" described the behaviour accurately and read
    // like a sentence on a button. The verb alone is enough: the verdict right
    // above it already says which answers are wrong, so the label does not have
    // to repeat it.
    render(<ExerciseIsland lang="es" payload={single} />);
    choose('sit');
    submit();
    expect(retryButton().textContent).toBe('Corregir');
    cleanup();

    render(<ExerciseIsland lang="en" payload={single} />);
    choose('sit');
    submit();
    expect(retryButton().textContent).toBe('Fix');
  });

  it('writes the Spanish island copy in neutral Spanish, with no voseo', () => {
    // STANDING PROJECT RULE, site-wide. The island keeps its copy LOCAL (it
    // must not pull the Astro-side i18n module into the client bundle), so the
    // `i18n.test.ts` guard structurally cannot reach it and this second guard
    // is what keeps the learner-facing half of the Spanish covered.
    //
    // The detector is the SHARED one. It used to be re-implemented inline here
    // with a shorter allowlist, which is how one guard silently ends up
    // stricter than the other.

    // Triangulation: the detector fires on the copy this island used to ship.
    expect(voseoWords('Revisá las respuestas y elegí una opción')).toEqual([
      'Revisá',
      'elegí',
    ]);

    expect(Object.keys(COPY.es).length).toBeGreaterThan(5);
    expect(findVoseo(COPY.es)).toEqual([]);
  });

  it('leaves an unavailable slot alone while correcting the one beside it', () => {
    render(<ExerciseIsland lang="en" payload={mixed} />);

    choose('sit'); // wrong
    submit();

    retry();

    // The choice slot is answerable again...
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    // ...and the degraded slot is still degraded, still offers no control, and
    // still gets no verdict — correcting did not disturb it.
    goToSlot(1);
    expect(screen.getByTestId('slot-unavailable-h1')).toBeTruthy();
    expect(screen.queryByTestId('slot-feedback-h1')).toBeNull();
  });
});

/**
 * The stepper — NAVIGATION ONLY.
 *
 * The arithmetic (clamping, the two boundaries, the label) is proved against
 * pure functions in `exerciseStepper.test.ts`. What is left here is everything
 * that only exists once React owns the index: that a single-slot exercise gets
 * no stepper at all, that answers outlive the slot that collected them, that
 * grading is unaffected by the route the learner took through the questions, and
 * that the verdicts stay walkable afterwards.
 *
 * WHAT THESE CANNOT PROVE: the fade. jsdom runs no animations and computes no
 * styles, so the transition between two steps is invisible to every assertion
 * here — only the reduced-motion DECISION is observable, and only because it is
 * a JS read that can throw.
 */
describe('ExerciseIsland — stepping through the slots', () => {
  function stepLabel(): string {
    return screen.getByTestId('exercise-step').textContent ?? '';
  }

  function nextButton(): HTMLButtonElement {
    return screen.getByTestId('exercise-next') as HTMLButtonElement;
  }

  function prevButton(): HTMLButtonElement {
    return screen.getByTestId('exercise-prev') as HTMLButtonElement;
  }

  /** Install a `matchMedia` stub whose reduced-motion answer we control. */
  function stubMatchMedia(reduce: boolean) {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? reduce : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  }

  afterEach(() => {
    // jsdom ships NO `matchMedia`, and the island's guard depends on that
    // absence being the real default. Leaving a stub installed would hide a
    // regression in exactly the code path the guard exists for.
    Reflect.deleteProperty(window, 'matchMedia');
  });

  describe('a single-slot exercise', () => {
    /**
     * NO STEPPER AT ALL — not a disabled one. This is the shape of nearly every
     * exercise in the section, so the wrong answer here is the one the learner
     * sees most often.
     */
    it('ships no stepper, no arrows and no position', () => {
      render(<ExerciseIsland lang="en" payload={single} />);

      expect(screen.queryByTestId('exercise-stepper')).toBeNull();
      expect(screen.queryByTestId('exercise-prev')).toBeNull();
      expect(screen.queryByTestId('exercise-next')).toBeNull();
      expect(screen.queryByTestId('exercise-step')).toBeNull();
    });

    it('still renders and grades its one slot', () => {
      render(<ExerciseIsland lang="en" payload={single} />);

      choose('sits');
      submit();

      expect(screen.getByTestId('slot-feedback-s1').textContent).toBe(
        COPY.en.correct,
      );
    });
  });

  describe('a multi-slot exercise', () => {
    it('shows one slot at a time, with its position', () => {
      render(<ExerciseIsland lang="en" payload={threeBlanks} />);

      expect(stepLabel()).toContain('1 of 3');
      // ONE control on screen, not three: that is the whole change.
      expect(screen.getAllByRole('textbox')).toHaveLength(1);
      expect(screen.getByText('First')).toBeTruthy();
    });

    it('walks forward and back through every slot', () => {
      render(<ExerciseIsland lang="en" payload={threeBlanks} />);

      fireEvent.click(nextButton());
      expect(stepLabel()).toContain('2 of 3');
      fireEvent.click(nextButton());
      expect(stepLabel()).toContain('3 of 3');
      fireEvent.click(prevButton());
      expect(stepLabel()).toContain('2 of 3');
    });

    it('closes both ends instead of wrapping around', () => {
      render(<ExerciseIsland lang="en" payload={threeBlanks} />);

      // A learner who reaches the end has finished the questions, not returned
      // to the first one.
      expect(prevButton().disabled).toBe(true);
      expect(nextButton().disabled).toBe(false);

      goToSlot(2);

      expect(prevButton().disabled).toBe(false);
      expect(nextButton().disabled).toBe(true);
    });

    /**
     * REAL BUTTONS, reachable and operable without a pointer. The stepper is
     * the only way to reach slots two and three now, so if the keyboard cannot
     * work it, a keyboard-only learner cannot finish the exercise at all.
     *
     * WHAT THIS CANNOT PROVE: that pressing Enter or Space actually activates
     * them. jsdom does not implement a button's default activation behaviour, so
     * a `keyDown` here fires no click — asserting one would only prove the test
     * dispatched its own event. What IS provable is the thing that EARNS that
     * behaviour from the browser: a real `<button type="button">`, focusable,
     * not a div with a handler. That is the assertion below, and it is the
     * property the arrow swap could have broken.
     */
    it('exposes controls a keyboard can reach and operate', () => {
      render(<ExerciseIsland lang="en" payload={threeBlanks} />);

      for (const btn of [prevButton(), nextButton()]) {
        expect(btn.tagName).toBe('BUTTON');
        expect(btn.type).toBe('button');
      }

      nextButton().focus();
      expect(document.activeElement).toBe(nextButton());

      // Focus is NOT trapped: the blank in the slot below is still reachable.
      blank().focus();
      expect(document.activeElement).toBe(blank());
    });

    /** The position is a live region, so the change is spoken, not just drawn. */
    it('announces which slot the learner moved to, and out of how many', () => {
      render(<ExerciseIsland lang="en" payload={threeBlanks} />);

      const indicator = screen.getByTestId('exercise-step');
      expect(indicator.getAttribute('role')).toBe('status');

      fireEvent.click(nextButton());

      // The spoken half names the slot as well as the number: a screen-reader
      // user arrives at "2 of 3" with no buttons in view to give it meaning.
      expect(indicator.textContent).toContain(`${COPY.en.stepWord} 2 of 3`);
      expect(indicator.textContent).toContain('Second ___');
    });

    /**
     * THE ARROWS CARRY NO TEXT, SO THE NAME IS THE WHOLE ACCESSIBILITY STORY.
     *
     * Swapping "Anterior"/"Siguiente" for chevrons deleted the visible label.
     * If the localized string had not moved to `aria-label`, both controls would
     * announce as "button" and a screen-reader user would have no way to tell
     * them apart — the exact regression this replacement could have shipped.
     */
    it('localizes the controls and the position', () => {
      render(<ExerciseIsland lang="es" payload={threeBlanks} />);

      expect(prevButton().getAttribute('aria-label')).toBe(COPY.es.stepPrev);
      expect(nextButton().getAttribute('aria-label')).toBe(COPY.es.stepNext);
      expect(stepLabel()).toContain('1 de 3');
    });

    it('names each arrow for assistive tech, and hides the glyph from it', () => {
      render(<ExerciseIsland lang="en" payload={threeBlanks} />);

      // Resolvable BY NAME, which is what a screen-reader user navigates by.
      expect(screen.getByRole('button', { name: COPY.en.stepPrev })).toBe(
        prevButton(),
      );
      expect(screen.getByRole('button', { name: COPY.en.stepNext })).toBe(
        nextButton(),
      );

      // The chevron itself must be hidden, or the name would compete with it.
      const glyph = nextButton().querySelector('svg');
      expect(glyph).not.toBeNull();
      expect(glyph?.getAttribute('aria-hidden')).toBe('true');
      // No visible text left on the control — the name is the ONLY label.
      expect(nextButton().textContent).toBe('');

      // And they point OPPOSITE ways, from the same shared geometry the home
      // page's row uses. One transposed key here is invisible in a diff.
      expect(prevButton().querySelector('path')?.getAttribute('d')).toBe(
        CHEVRON_PATH.prev,
      );
      expect(nextButton().querySelector('path')?.getAttribute('d')).toBe(
        CHEVRON_PATH.next,
      );
    });

    /**
     * The position stays the ONLY announcement mechanism. Naming the arrows must
     * not have added a second one: two live regions racing on every step is how
     * a screen reader ends up reading the same move twice.
     */
    it('adds no second live region alongside the position', () => {
      render(<ExerciseIsland lang="en" payload={threeBlanks} />);

      const stepper = screen.getByTestId('exercise-stepper');
      const live = stepper.querySelectorAll('[role="status"], [aria-live]');
      expect(live).toHaveLength(1);
      expect(live[0]).toBe(screen.getByTestId('exercise-step'));
    });
  });

  describe('answers and grading are untouched by stepping', () => {
    /**
     * THE STATE QUESTION. The island already holds every answer, keyed by slot
     * id; the step is only an index into the slots. If stepping owned any of
     * that state instead, walking away from a question and back would lose it.
     */
    it('keeps an answer the learner steps away from and returns to', () => {
      render(<ExerciseIsland lang="en" payload={threeBlanks} />);

      typeHere('one');
      goToSlot(2);
      typeHere('three');
      goToSlot(0);

      expect(blank().value).toBe('one');
      goToSlot(2);
      expect(blank().value).toBe('three');
      // The slot never visited is still empty — stepping past a question does
      // not answer it.
      goToSlot(1);
      expect(blank().value).toBe('');
    });

    /**
     * GRADING DOES NOT CHANGE. Stepping is navigation, so the verdict must
     * depend on the ANSWERS and not on the path taken to give them.
     */
    it('grades identically whether or not the learner wandered', () => {
      render(<ExerciseIsland lang="en" payload={threeBlanks} />);
      fillBlanks(['one', 'nope', 'three']);
      submit();
      const direct = [0, 1, 2].map((i) => {
        goToSlot(i);
        return screen.getByTestId(`slot-feedback-t${i + 1}`).textContent;
      });
      const directVerdict = screen.getByTestId('exercise-verdict').textContent;
      cleanup();

      render(<ExerciseIsland lang="en" payload={threeBlanks} />);
      // The same answers, given in a wandering order with detours in between.
      goToSlot(2);
      typeHere('three');
      goToSlot(0);
      typeHere('one');
      goToSlot(1);
      goToSlot(2);
      goToSlot(1);
      typeHere('nope');
      goToSlot(0);
      submit();
      const wandered = [0, 1, 2].map((i) => {
        goToSlot(i);
        return screen.getByTestId(`slot-feedback-t${i + 1}`).textContent;
      });

      expect(wandered).toEqual(direct);
      expect(screen.getByTestId('exercise-verdict').textContent).toBe(directVerdict);
      // Triangulation: the run really did grade something, so this is not two
      // empty lists agreeing with each other.
      expect(direct).toEqual([COPY.en.correct, COPY.en.incorrect, COPY.en.correct]);
    });

    /**
     * The gate and the stepper together: an unopened slot is unanswered, so it
     * holds submit shut until the learner walks to it. Grading then still runs
     * over the WHOLE payload in one pass, not over the step that happens to be
     * on screen.
     */
    it('keeps submit shut until every slot has been walked to and answered', () => {
      render(<ExerciseIsland lang="en" payload={threeBlanks} />);

      typeHere('one');
      expect(submitButton().disabled).toBe(true);
      goToSlot(1);
      typeHere('two');
      expect(submitButton().disabled).toBe(true);

      goToSlot(2);
      typeHere('nope');
      expect(submitButton().disabled).toBe(false);

      submit();

      // One pass, three verdicts — including the slot reached last.
      goToSlot(0);
      expect(screen.getByTestId('slot-feedback-t1').textContent).toBe(
        COPY.en.correct,
      );
      goToSlot(2);
      expect(screen.getByTestId('slot-feedback-t3').textContent).toBe(
        COPY.en.incorrect,
      );
    });

    /**
     * After grading, the learner must be able to walk back and read each
     * verdict. The stepper is therefore NEVER disabled by grading — only the
     * answer controls are.
     */
    it('stays navigable after grading so every verdict can be read', () => {
      render(<ExerciseIsland lang="en" payload={threeBlanks} />);

      fillBlanks(['one', 'nope', 'three']);
      submit();
      goToSlot(0);

      expect(nextButton().disabled).toBe(false);
      expect(blank().disabled).toBe(true);

      const verdicts = [0, 1, 2].map((i) => {
        goToSlot(i);
        return screen.getByTestId(`slot-feedback-t${i + 1}`).textContent;
      });
      expect(verdicts).toEqual([
        COPY.en.correct,
        COPY.en.incorrect,
        COPY.en.correct,
      ]);
    });
  });

  describe('reduced motion', () => {
    /**
     * THE GUARD THAT MATTERS. jsdom ships no `window.matchMedia` at all, and
     * neither does the server. Reading `.matches` off it directly throws and
     * takes the whole island down — so this is not a style test, it is a crash
     * test, and it is the reason the `typeof` guard exists.
     */
    it('renders and steps where matchMedia does not exist at all', () => {
      expect(window.matchMedia).toBeUndefined();

      render(<ExerciseIsland lang="en" payload={threeBlanks} />);
      fireEvent.click(nextButton());

      expect(stepLabel()).toContain('2 of 3');
    });

    it('steps normally when the user asked for no motion', () => {
      stubMatchMedia(true);

      render(<ExerciseIsland lang="en" payload={threeBlanks} />);
      typeHere('one');
      fireEvent.click(nextButton());
      typeHere('two');
      goToSlot(0);

      // Honouring the request must not cost the learner the navigation itself.
      expect(stepLabel()).toContain('1 of 3');
      expect(blank().value).toBe('one');
    });

    it('steps normally when motion is allowed', () => {
      stubMatchMedia(false);

      render(<ExerciseIsland lang="en" payload={threeBlanks} />);
      fireEvent.click(nextButton());

      expect(stepLabel()).toContain('2 of 3');
    });
  });
});

describe('ExerciseIsland — localization', () => {
  it('renders Spanish copy', () => {
    render(<ExerciseIsland lang="es" payload={single} />);

    expect(screen.getByTestId('exercise-submit').textContent).toBe('Comprobar');
    choose('sits');
    submit();
    expect(screen.getByTestId('exercise-verdict').textContent).toContain(
      'Todo correcto',
    );
  });

  it('renders different copy for es and en', () => {
    render(<ExerciseIsland lang="en" payload={single} />);
    const english = screen.getByTestId('exercise-submit').textContent;
    cleanup();

    render(<ExerciseIsland lang="es" payload={single} />);
    const spanish = screen.getByTestId('exercise-submit').textContent;

    expect(english).toBe('Check');
    expect(spanish).toBe('Comprobar');
    expect(english).not.toBe(spanish);
  });

  it('falls back to English for an unknown locale', () => {
    render(<ExerciseIsland lang="pt" payload={single} />);

    expect(screen.getByTestId('exercise-submit').textContent).toBe('Check');
  });
});
