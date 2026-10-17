// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AnswerReveal, SINGLE_CARD } from './singleCard';

afterEach(() => cleanup());

describe('singleCard (shared single-card stage look)', () => {
  it('shows the answer and, when authored, its explanation', () => {
    render(<AnswerReveal data-testid="x-answer" answer="cat" explanation="Cats say meow." />);
    const answer = screen.getByTestId('x-answer');
    expect(answer.textContent).toContain('cat');
    expect(answer.textContent).toContain('Cats say meow.');
  });

  it('renders no explanation line when the slot has none', () => {
    render(<AnswerReveal data-testid="x-answer" answer="cat" />);
    expect(screen.getByTestId('x-answer').querySelector('svg')).toBeNull();
  });

  it('the answer well is a neutral pale-sky tint, never the old yellow accent or a correctness colour', () => {
    render(<AnswerReveal data-testid="x-answer" answer="cat" />);
    const cls = screen.getByTestId('x-answer').className;
    expect(cls).toContain('bg-pop-sky/15');
    expect(cls).not.toMatch(/bg-accent|success|destructive/);
  });

  it('the stage card is a soft-shadowed rounded rectangle, never the old hard 2px border box', () => {
    expect(SINGLE_CARD).toContain('rounded-[26px]');
    // The runtime var form — the bare `shadow-elevation-2` utility inlines
    // the brand's pure-black value (see `singleCard.tsx`'s own header).
    expect(SINGLE_CARD).toContain('shadow-(--shadow-elevation-2)');
    expect(SINGLE_CARD).not.toMatch(/(^|\s)shadow-elevation-/);
    expect(SINGLE_CARD).not.toContain('border-2');
  });
});
