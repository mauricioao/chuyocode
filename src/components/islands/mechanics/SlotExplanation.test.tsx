// @vitest-environment jsdom
/**
 * SlotExplanation tests — the shared D5 "¿Por qué?" note `ExerciseIsland` and
 * `QuizBlockPractice` both mount once a slot is graded `incorrect`.
 *
 * Mounting policy (never-before-checking, never-for-correct) is each
 * CALLER's own job and is covered by their own suites; this component only
 * has to draw the text it is handed, under the caller's own testid, announced.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import SlotExplanation from './SlotExplanation';

afterEach(cleanup);

describe('SlotExplanation', () => {
  it('renders the given text under the caller-supplied testid', () => {
    render(<SlotExplanation text="Third person -s." testId="slot-explanation-s1" />);

    expect(screen.getByTestId('slot-explanation-s1').textContent).toContain(
      'Third person -s.',
    );
  });

  it('is a politely-announced status region', () => {
    render(<SlotExplanation text="Because." testId="slot-explanation-s1" />);

    expect(screen.getByRole('status').textContent).toContain('Because.');
  });

  // TRIANGULATION: a different testid must actually reach the DOM, which
  // rules out a hardcoded string.
  it('uses whatever testid the caller passes', () => {
    render(<SlotExplanation text="Because." testId="quiz-slot-explanation-q1" />);

    expect(screen.getByTestId('quiz-slot-explanation-q1')).toBeTruthy();
  });
});
