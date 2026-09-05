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
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { GradeResult } from '@/lib/exerciseGrading';
import type { Payload } from '@/lib/exercisePayload';
import { findVoseo, voseoWords } from '@/lib/neutralSpanish';
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
