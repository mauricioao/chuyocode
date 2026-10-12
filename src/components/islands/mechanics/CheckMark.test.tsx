// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GradeMark, gradeAriaSuffix, gradeSummary } from './CheckMark';

describe('gradeAriaSuffix', () => {
  it('returns nothing for an ungraded piece', () => {
    expect(gradeAriaSuffix('es', undefined)).toBe('');
    expect(gradeAriaSuffix('en', undefined)).toBe('');
  });

  it('appends the ES/EN word for a graded piece', () => {
    expect(gradeAriaSuffix('es', 'correct')).toBe(' correcta');
    expect(gradeAriaSuffix('es', 'wrong')).toBe(' incorrecta');
    expect(gradeAriaSuffix('en', 'correct')).toBe(' correct');
    expect(gradeAriaSuffix('en', 'wrong')).toBe(' incorrect');
  });
});

describe('gradeSummary', () => {
  it('is null once nothing has been graded', () => {
    expect(gradeSummary('es', 0, 0)).toBeNull();
    expect(gradeSummary('en', 0, 0)).toBeNull();
  });

  it('reports a mix of correct/wrong, correct first, Spanish pluralised', () => {
    expect(gradeSummary('es', 2, 1)).toBe('2 correctas, 1 incorrecta');
    expect(gradeSummary('en', 2, 1)).toBe('2 correct, 1 incorrect');
  });

  it('omits a zero count rather than reading "0 incorrectas"', () => {
    expect(gradeSummary('es', 3, 0)).toBe('3 correctas');
    expect(gradeSummary('es', 0, 1)).toBe('1 incorrecta');
    expect(gradeSummary('en', 3, 0)).toBe('3 correct');
  });

  it('keeps the singular word for a count of exactly one, in Spanish', () => {
    expect(gradeSummary('es', 1, 0)).toBe('1 correcta');
    expect(gradeSummary('es', 0, 1)).toBe('1 incorrecta');
  });

  it('never pluralises the English adjective', () => {
    expect(gradeSummary('en', 1, 0)).toBe('1 correct');
    expect(gradeSummary('en', 5, 0)).toBe('5 correct');
  });
});

describe('GradeMark', () => {
  // `getAttribute('class')`, never `.className`: this icon renders as an
  // `<svg>`, whose DOM `className` is an `SVGAnimatedString`, not a plain
  // string — the same reason every other test in this codebase asserting
  // on a Phosphor icon's classes reads the raw attribute instead.
  it('renders the ✓ badge, aria-hidden, for "correct"', () => {
    render(<GradeMark state="correct" />);
    const mark = screen.getByTestId('grade-mark-correct');
    expect(mark.getAttribute('aria-hidden')).toBe('true');
    expect(mark.getAttribute('class')).toContain('bg-success-strong');
    expect(mark.getAttribute('class')).toContain('text-white');
  });

  it('renders the ✕ badge, aria-hidden, for "wrong"', () => {
    render(<GradeMark state="wrong" />);
    const mark = screen.getByTestId('grade-mark-wrong');
    expect(mark.getAttribute('aria-hidden')).toBe('true');
    expect(mark.getAttribute('class')).toContain('bg-destructive');
    expect(mark.getAttribute('class')).toContain('text-white');
  });

  it('is pinned absolute to the top-right corner, never in flow', () => {
    render(<GradeMark state="correct" />);
    expect(screen.getByTestId('grade-mark-correct').getAttribute('class')).toContain('absolute');
  });

  it('only animates under motion-safe, so reduced motion gets an instant badge', () => {
    render(<GradeMark state="correct" />);
    expect(screen.getByTestId('grade-mark-correct').getAttribute('class')).toMatch(/motion-safe:animate-in/);
  });
});
