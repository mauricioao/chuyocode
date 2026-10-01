// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Skeleton } from './skeleton';

describe('Skeleton', () => {
  it('pulses by default and turns static under prefers-reduced-motion', () => {
    render(<Skeleton data-testid="sk" />);
    const el = screen.getByTestId('sk');
    expect(el.className).toContain('animate-pulse');
    expect(el.className).toContain('motion-reduce:animate-none');
  });

  it('merges a caller className (e.g. shaping it like a row/line/card)', () => {
    render(<Skeleton data-testid="sk" className="h-4 w-32" />);
    expect(screen.getByTestId('sk').className).toContain('h-4');
  });
});
