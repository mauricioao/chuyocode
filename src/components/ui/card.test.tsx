// @vitest-environment jsdom
/**
 * card.tsx — the premium design system's one card recipe (PR 1): the
 * `--radius-card` token, a 16px-phone/24px-desktop padding rhythm instead of
 * a flat 16px, and a 56px header row with vertically centered items.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card, CardHeader, CardTitle } from './card';

describe('Card', () => {
  it('uses the shared card radius token', () => {
    render(<Card data-testid="card">content</Card>);
    expect(screen.getByTestId('card').className).toContain('rounded-(--radius-card)');
  });

  it('uses the mobile/desktop padding rhythm, not a flat 16px', () => {
    render(<Card data-testid="card">content</Card>);
    const classes = screen.getByTestId('card').className;
    expect(classes).toContain('[--card-spacing:var(--card-padding-mobile)]');
    expect(classes).toContain('md:[--card-spacing:var(--card-padding-desktop)]');
  });
});

describe('CardHeader', () => {
  it('is a 56px-min header row with vertically centered items', () => {
    render(
      <Card>
        <CardHeader data-testid="header">
          <CardTitle>Title</CardTitle>
        </CardHeader>
      </Card>,
    );
    const classes = screen.getByTestId('header').className;
    expect(classes).toContain('min-h-(--card-header-h)');
    expect(classes).toContain('items-center');
  });
});
