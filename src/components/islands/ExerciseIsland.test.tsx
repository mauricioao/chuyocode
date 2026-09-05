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
import type { Payload } from '@/lib/exercisePayload';
import ExerciseIsland, { hasSubmittableAnswer } from './ExerciseIsland';

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
      'Elegí al menos una respuesta',
    );
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
