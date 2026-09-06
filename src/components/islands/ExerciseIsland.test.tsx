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
import type { GradeResult } from '@/lib/exerciseGrading';
import type { Payload } from '@/lib/exercisePayload';
import { findVoseo, voseoWords } from '@/lib/neutralSpanish';
import { DROP_COPY } from './mechanics/DropRenderer';
import ExerciseIsland, {
  clearIncorrectAnswers,
  COPY,
  firstIncorrectSlotId,
  hasSubmittableAnswer,
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

function blanks(): HTMLInputElement[] {
  return screen.getAllByRole('textbox') as HTMLInputElement[];
}

/** Type into the nth blank, as a learner would. */
function type(index: number, text: string) {
  fireEvent.change(blanks()[index]!, { target: { value: text } });
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

    // The hotspot slot shows the degraded notice...
    expect(screen.getByTestId('slot-unavailable-h1').textContent).toContain(
      'cannot be answered here yet',
    );
    // ...and the choice slot is fully interactive next to it.
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.getByText('First')).toBeTruthy();
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
    choose('sits', 0);
    choose('sits', 1);
    submit();

    expect(screen.getByTestId('slot-feedback-s1').textContent).toContain(
      'Correct',
    );
    expect(screen.getByTestId('slot-feedback-s2').textContent).toContain(
      'Incorrect',
    );
  });

  it('never marks an unrenderable slot incorrect, and stays winnable', () => {
    render(<ExerciseIsland lang="en" payload={mixed} />);
    choose('sits');
    submit();

    // The degraded slot gets NO correct/incorrect verdict at all...
    expect(screen.queryByTestId('slot-feedback-h1')).toBeNull();
    // ...and it does not poison the exercise the learner could actually answer.
    expect(screen.getByTestId('slot-feedback-s1').textContent).toContain(
      'Correct',
    );
    expect(screen.getByTestId('exercise-verdict').textContent).toContain(
      'All correct',
    );
  });

  it('shows no feedback before the learner submits', () => {
    render(<ExerciseIsland lang="en" payload={single} />);
    choose('sits');

    expect(screen.queryByTestId('exercise-verdict')).toBeNull();
    expect(screen.queryByTestId('slot-feedback-s1')).toBeNull();
  });
});

describe('hasSubmittableAnswer', () => {
  it('is false for an untouched exercise and true once a slot is answered', () => {
    expect(hasSubmittableAnswer(single, {})).toBe(false);
    expect(hasSubmittableAnswer(single, { s1: ['b'] })).toBe(true);
  });

  it('treats an empty array as unanswered, not as an answer', () => {
    expect(hasSubmittableAnswer(single, { s1: [] })).toBe(false);
  });

  it('needs ANY slot, not ALL of them', () => {
    expect(hasSubmittableAnswer(pair, { s2: ['a'] })).toBe(true);
  });

  it('ignores answers to a slot whose mechanic never rendered', () => {
    // `h1` is a hotspot: no renderer, so the learner was never offered it.
    // A stale response entry must not unlock submit on its own...
    expect(hasSubmittableAnswer(unanswerable, { h1: ['x'] })).toBe(false);
    // ...but a renderable sibling still does.
    expect(hasSubmittableAnswer(mixed, { s1: ['b'] })).toBe(true);
  });
});

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

  it('enables submit as soon as one answer is selected', () => {
    render(<ExerciseIsland lang="en" payload={single} />);
    expect(submitButton().disabled).toBe(true);

    choose('sits');

    expect(submitButton().disabled).toBe(false);
    expect(submitButton().hasAttribute('disabled')).toBe(false);
  });

  it('accepts a PARTIAL answer: one of two slots is enough to submit', () => {
    render(<ExerciseIsland lang="en" payload={pair} />);
    expect(submitButton().disabled).toBe(true);

    // Answer slot 1 only. Slot 2 is deliberately left untouched.
    choose('sits', 0);

    expect(submitButton().disabled).toBe(false);
    submit();
    // Partial submission really grades — we did not turn this into "answer all".
    expect(screen.getByTestId('slot-feedback-s1').textContent).toContain(
      'Correct',
    );
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
    expect(hint.textContent).toContain('Select at least one answer');
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
      'Elegir al menos una respuesta',
    );
  });
});

describe('ExerciseIsland — mixed mechanics in one exercise', () => {
  it('renders a distinct control for each of the three mechanics', () => {
    render(<ExerciseIsland lang="en" payload={threeMechanics} />);

    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(dropdown()).toBeTruthy();
    expect(blank()).toBeTruthy();
    // Nothing degraded: all three mechanics ship a renderer now.
    expect(screen.queryByTestId('slot-unavailable-d1')).toBeNull();
    expect(screen.queryByTestId('slot-unavailable-t1')).toBeNull();
  });

  it('grades all three slots INDEPENDENTLY when each is correct', () => {
    render(<ExerciseIsland lang="en" payload={threeMechanics} />);

    choose('sits');
    fireEvent.change(dropdown(), { target: { value: 'i_some' } });
    // Sloppy casing and padding on purpose: the `text` comparator normalizes,
    // and it only gets the chance if the renderer reported the string RAW.
    fireEvent.change(blank(), { target: { value: '  SITS ' } });
    submit();

    expect(screen.getByTestId('slot-feedback-c1').textContent).toContain('Correct');
    expect(screen.getByTestId('slot-feedback-d1').textContent).toContain('Correct');
    expect(screen.getByTestId('slot-feedback-t1').textContent).toContain('Correct');
    expect(screen.getByTestId('exercise-verdict').textContent).toContain('All correct');
  });

  it('marks only the wrong slot wrong, leaving the other two correct', () => {
    render(<ExerciseIsland lang="en" payload={threeMechanics} />);

    choose('sits');
    // Wrong dropdown id...
    fireEvent.change(dropdown(), { target: { value: 'i_a' } });
    fireEvent.change(blank(), { target: { value: 'is sitting' } });
    submit();

    expect(screen.getByTestId('slot-feedback-c1').textContent).toContain('Correct');
    expect(screen.getByTestId('slot-feedback-d1').textContent).toContain('Incorrect');
    // ...and the second accepted alternative still passes the text slot.
    expect(screen.getByTestId('slot-feedback-t1').textContent).toContain('Correct');
    expect(screen.getByTestId('exercise-verdict').textContent).toContain('Review');
  });

  it('fails the text slot when the typed word is simply wrong', () => {
    render(<ExerciseIsland lang="en" payload={threeMechanics} />);

    choose('sits');
    fireEvent.change(dropdown(), { target: { value: 'i_some' } });
    fireEvent.change(blank(), { target: { value: 'sitting' } });
    submit();

    // Guards against a renderer that reports a constant, or a comparator wired
    // to always match: a genuinely wrong answer must still be rejected.
    expect(screen.getByTestId('slot-feedback-t1').textContent).toContain('Incorrect');
  });

  it('unlocks submit from the dropdown alone, and from the blank alone', () => {
    render(<ExerciseIsland lang="en" payload={threeMechanics} />);
    expect(submitButton().disabled).toBe(true);

    fireEvent.change(dropdown(), { target: { value: 'i_some' } });
    expect(submitButton().disabled).toBe(false);

    // Clearing back to the placeholder must RE-LOCK it: an empty dropdown is a
    // non-answer, not the answer "".
    fireEvent.change(dropdown(), { target: { value: '' } });
    expect(submitButton().disabled).toBe(true);

    fireEvent.change(blank(), { target: { value: 's' } });
    expect(submitButton().disabled).toBe(false);

    // And an emptied text field re-locks it too, for the same reason.
    fireEvent.change(blank(), { target: { value: '' } });
    expect(submitButton().disabled).toBe(true);
  });

  it('locks every control once the exercise has been graded', () => {
    render(<ExerciseIsland lang="en" payload={threeMechanics} />);

    choose('sits');
    submit();

    expect(dropdown().disabled).toBe(true);
    expect(blank().disabled).toBe(true);
  });

  it('localizes the dropdown placeholder', () => {
    render(<ExerciseIsland lang="es" payload={threeMechanics} />);

    expect(screen.getByRole('option', { name: 'Elegir una opción' })).toBeTruthy();
    cleanup();

    render(<ExerciseIsland lang="en" payload={threeMechanics} />);
    expect(screen.getByRole('option', { name: 'Choose an option' })).toBeTruthy();
  });
});

describe('ExerciseIsland — two drop slots sharing one pool', () => {
  it('offers the whole pool to both slots before anything is placed', () => {
    render(<ExerciseIsland lang="en" payload={twoDropsOnePool} />);

    expect(tilesIn('olives')).toEqual(['some', 'any', 'much', 'many']);
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
    expect(tilesIn('bread')).toEqual(['any', 'much', 'many']);
  });

  it('leaves the rest of the pool alone', async () => {
    render(<ExerciseIsland lang="en" payload={twoDropsOnePool} />);

    await dropInto('olives', 'some');

    // Three tiles for one remaining slot: consuming one tile must not look like
    // exhausting the pool.
    expect(tilesIn('bread')).toHaveLength(3);
  });

  it('lets each slot consume a different tile independently', async () => {
    render(<ExerciseIsland lang="en" payload={twoDropsOnePool} />);

    await dropInto('olives', 'some');
    await dropInto('bread', 'any');

    expect(tilesIn('olives')).toEqual(['much', 'many']);
    expect(tilesIn('bread')).toEqual(['much', 'many']);
  });

  it('returns a removed tile to BOTH slots', async () => {
    render(<ExerciseIsland lang="en" payload={twoDropsOnePool} />);

    await dropInto('olives', 'some');
    fireEvent.click(
      screen.getByRole('button', { name: DROP_COPY.en.remove('some') }),
    );

    // Derived, not stored: nothing names the tile any more, so it is back.
    expect(tilesIn('olives')).toContain('some');
    expect(tilesIn('bread')).toContain('some');
  });

  it('grades both drop slots instead of excluding them from the verdict', async () => {
    render(<ExerciseIsland lang="en" payload={twoDropsOnePool} />);

    await dropInto('olives', 'some');
    await dropInto('bread', 'any');
    submit();

    expect(screen.getByTestId('slot-feedback-olives').textContent).toBe(
      COPY.en.correct,
    );
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
    submit();

    expect(screen.getByTestId('slot-feedback-olives').textContent).toBe(
      COPY.en.incorrect,
    );
  });

  it('unlocks submit once a tile has been placed', async () => {
    render(<ExerciseIsland lang="en" payload={twoDropsOnePool} />);

    // An untouched exercise is a NON-ATTEMPT, not a wrong answer.
    expect(submitButton().disabled).toBe(true);

    await dropInto('olives', 'some');

    expect(submitButton().disabled).toBe(false);
  });

  it('gives a wrongly placed tile back for a second attempt', async () => {
    render(<ExerciseIsland lang="en" payload={twoDropsOnePool} />);

    await dropInto('olives', 'much');
    submit();
    retry();

    // The wrong answer was cleared, so its tile is claimable again — by either
    // slot. A learner who must redo a slot needs its tiles back.
    expect(tilesIn('olives')).toContain('much');
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
 * The countdown, seen from the outside.
 *
 * The RULES (clamping, the pause while graded, formatting) are proved against
 * pure functions in `exerciseTimer.test.ts`. What is left here is the wiring
 * that only exists once React owns an interval: that expiry grades through the
 * EXISTING path, that it does so exactly once, that an untimed exercise is
 * untouched, and that nothing keeps ticking after unmount.
 */
describe('ExerciseIsland — countdown', () => {
  /** A one-slot exercise with a short, exact limit. */
  const timed: Payload = { ...single, timer: { seconds: 3 } };

  function clock(): HTMLElement | null {
    return screen.queryByTestId('exercise-timer');
  }

  function verdict(): HTMLElement | null {
    return screen.queryByTestId('exercise-verdict');
  }

  /** Let `seconds` of countdown elapse. */
  async function elapse(seconds: number) {
    await act(async () => {
      vi.advanceTimersByTime(seconds * 1000);
    });
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows no countdown for an exercise without a timer', () => {
    vi.useFakeTimers();
    render(<ExerciseIsland lang="en" payload={single} />);

    expect(clock()).toBeNull();
  });

  /**
   * THE REGRESSION THAT MATTERS MOST: every exercise authored so far is untimed,
   * and none of them may start grading itself.
   */
  it('never grades an untimed exercise on its own', async () => {
    vi.useFakeTimers();
    render(<ExerciseIsland lang="en" payload={single} />);

    await elapse(600);

    expect(verdict()).toBeNull();
  });

  it('shows the countdown for a timed exercise and counts it down', async () => {
    vi.useFakeTimers();
    render(<ExerciseIsland lang="en" payload={timed} />);

    expect(clock()?.textContent).toContain('0:03');

    await elapse(1);

    expect(clock()?.textContent).toContain('0:02');
  });

  it('grades automatically when the clock reaches zero', async () => {
    vi.useFakeTimers();
    render(<ExerciseIsland lang="en" payload={timed} />);

    expect(verdict()).toBeNull();

    await elapse(3);

    expect(clock()?.textContent).toContain('0:00');
    expect(verdict()?.textContent).toBe(COPY.en.someWrong);
  });

  /**
   * Expiry goes through the SAME grading path as the button, so an answer given
   * before the clock ran out is judged, not discarded.
   */
  it('grades the answers the learner actually gave', async () => {
    vi.useFakeTimers();
    render(<ExerciseIsland lang="en" payload={timed} />);

    choose('sits');
    await elapse(3);

    expect(screen.getByTestId('slot-feedback-s1').textContent).toBe(COPY.en.correct);
    expect(verdict()?.textContent).toBe(COPY.en.allCorrect);
  });

  it('grades an unanswered exercise when time runs out, even though submit was locked', async () => {
    vi.useFakeTimers();
    render(<ExerciseIsland lang="en" payload={timed} />);

    // The learner never earned the right to press submit...
    expect(submitButton().disabled).toBe(true);

    await elapse(3);

    // ...but running out of time is not a non-attempt. It is a finished attempt.
    expect(verdict()?.textContent).toBe(COPY.en.someWrong);
  });

  it('stops counting down once the learner submits', async () => {
    vi.useFakeTimers();
    render(<ExerciseIsland lang="en" payload={timed} />);

    await elapse(1);
    choose('sits');
    submit();

    const frozen = clock()?.textContent;
    await elapse(10);

    // The clock measures time spent ANSWERING; reading a verdict is not
    // answering, so it must not drain while feedback is on screen.
    expect(clock()?.textContent).toBe(frozen);
  });

  /**
   * THE CLOCK GETS TO END THE EXERCISE ONCE.
   *
   * `retry()` clears the result, so `graded` returns to false while the clock is
   * still at zero — a state in which "time is up" reads as true again. If the
   * expiry effect runs in it, the learner is handed a verdict they never
   * submitted, on answers that were just cleared for them, with nothing thrown.
   *
   * Two separate things prevent that today, and this test is deliberately blind
   * to which one is doing the work: the effect depends on `remaining` alone (so
   * React never re-runs it), and a latch makes the shot single regardless.
   * Measured: widening the dependency array to `[remaining, graded]` — the edit
   * `react-hooks/exhaustive-deps` asks for — keeps passing WITH the latch and
   * fails here without it.
   */
  it('does not grade again when the learner retries after time ran out', async () => {
    vi.useFakeTimers();
    render(<ExerciseIsland lang="en" payload={timed} />);

    await elapse(3);
    expect(verdict()).not.toBeNull();

    retry();
    expect(verdict()).toBeNull();

    await elapse(30);

    // The clock already had its one chance to end the exercise.
    expect(verdict()).toBeNull();
  });

  it('leaves the exercise answerable after the clock has been spent', async () => {
    vi.useFakeTimers();
    render(<ExerciseIsland lang="en" payload={timed} />);

    await elapse(3);
    retry();
    await elapse(30);

    // A second, untimed attempt: the learner can still answer and submit.
    choose('sits');
    submit();

    expect(verdict()?.textContent).toBe(COPY.en.allCorrect);
  });

  it('clears its interval on unmount', async () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');

    const { unmount } = render(<ExerciseIsland lang="en" payload={timed} />);
    await elapse(1);
    unmount();

    expect(clearSpy).toHaveBeenCalled();

    // And nothing is left running: a leaked interval would keep calling
    // `setRemaining` on an unmounted tree.
    const callsAfterUnmount = vi.getTimerCount();
    expect(callsAfterUnmount).toBe(0);
  });

  it('localizes the countdown label', () => {
    vi.useFakeTimers();
    render(<ExerciseIsland lang="es" payload={timed} />);

    expect(clock()?.textContent).toContain(COPY.es.timeLeft);
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

    type(0, 'one');
    type(1, 'nope');
    type(2, 'three');
    submit();

    expect(screen.getByTestId('slot-feedback-t2').textContent).toContain(
      'Incorrect',
    );

    retry();

    // Four of five right and being made to redo all five is the bug this fixes.
    expect(blanks()[0]!.value).toBe('one');
    expect(blanks()[2]!.value).toBe('three');
    // The wrong one is CLEARED, not left in place: a value that was just marked
    // wrong, with its verdict now gone, invites re-submitting it unchanged.
    expect(blanks()[1]!.value).toBe('');
  });

  it('unlocks the controls and re-enables submit after correcting', () => {
    render(<ExerciseIsland lang="en" payload={threeBlanks} />);

    type(0, 'one');
    type(1, 'nope');
    submit();
    expect(blanks()[0]!.disabled).toBe(true);

    retry();

    for (const field of blanks()) {
      expect(field.disabled).toBe(false);
      expect(field.hasAttribute('disabled')).toBe(false);
    }
    // The surviving correct answer keeps submit usable — the learner is one
    // blank away from finishing, not back at an empty exercise.
    expect(submitButton().disabled).toBe(false);
    expect(screen.queryByTestId('exercise-verdict')).toBeNull();
  });

  it('moves focus to the incorrect control', () => {
    render(<ExerciseIsland lang="en" payload={threeBlanks} />);

    type(0, 'one');
    type(1, 'nope');
    type(2, 'three');
    submit();

    retry();

    // Focus must land AFTER the re-render that re-enables the field: focusing a
    // still-disabled element is a silent no-op that nothing would report.
    expect(document.activeElement).toBe(blanks()[1]);
  });

  it('focuses the TOP-most wrong control when two are wrong', () => {
    render(<ExerciseIsland lang="en" payload={threeBlanks} />);

    type(0, 'nope');
    type(1, 'also-nope');
    type(2, 'three');
    submit();

    retry();

    // Not the last one the loop happened to touch: the learner reads top-down.
    expect(document.activeElement).toBe(blanks()[0]);
    expect(document.activeElement).not.toBe(blanks()[1]);
  });

  it('focuses a choice slot WITHOUT answering it on the learner s behalf', () => {
    render(<ExerciseIsland lang="en" payload={choiceThenBlank} />);

    choose('sit'); // wrong
    type(0, 'one'); // correct
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
    expect(blank().value).toBe('one');
  });

  it('focuses a dropdown slot', () => {
    render(<ExerciseIsland lang="en" payload={threeMechanics} />);

    choose('sits');
    fireEvent.change(dropdown(), { target: { value: 'i_a' } }); // wrong
    submit();

    retry();

    expect(document.activeElement).toBe(dropdown());
    expect(dropdown().value).toBe('');
  });

  it('still clears EVERYTHING when the whole exercise was correct', () => {
    render(<ExerciseIsland lang="en" payload={threeBlanks} />);

    type(0, 'one');
    type(1, 'two');
    type(2, 'three');
    submit();
    expect(screen.getByTestId('exercise-verdict').textContent).toContain(
      'All correct',
    );

    retry();

    // Nothing to fix, so the button means "start over" — and it must really
    // start over, not silently preserve the finished attempt.
    for (const field of blanks()) expect(field.value).toBe('');
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

    // The degraded slot is still degraded, still offers no control, and still
    // gets no verdict — correcting did not disturb it.
    expect(screen.getByTestId('slot-unavailable-h1')).toBeTruthy();
    expect(screen.queryByTestId('slot-feedback-h1')).toBeNull();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
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
