// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ActivityStage from './ActivityStage';
import { FLOATING_CHECK_BAR_CLASS } from '@/components/islands/mechanics/scale';

afterEach(() => cleanup());

describe('ActivityStage', () => {
  it('renders its own stable testid', () => {
    render(
      <ActivityStage>
        <p>board</p>
      </ActivityStage>,
    );
    expect(screen.getByTestId('activity-stage')).toBeTruthy();
  });

  it('renders children inside it', () => {
    render(
      <ActivityStage>
        <p data-testid="board">board content</p>
      </ActivityStage>,
    );
    expect(screen.getByTestId('activity-stage').contains(screen.getByTestId('board'))).toBe(true);
  });

  // Owner audit (LANZAMIENTO H13 part 2): the floating Comprobar must
  // resolve against THIS stage's own box — `contain: layout` makes it the
  // containing block for a `position: fixed` descendant regardless of the
  // descendant's own ancestor chain in between.
  it('carries the CSS containment style that makes it the containing block for a floating "fixed" Comprobar', () => {
    render(
      <ActivityStage>
        <div data-testid="check-bar" className={FLOATING_CHECK_BAR_CLASS} />
      </ActivityStage>,
    );
    const stage = screen.getByTestId('activity-stage');
    expect(stage.className).toContain('[contain:layout]');
    expect(stage.contains(screen.getByTestId('check-bar'))).toBe(true);
  });

  it('never clips paint (must stay readable by GameResult\'s own Vanina/confetti bleed) — no "paint"/"strict"/"content" containment', () => {
    render(
      <ActivityStage>
        <p>board</p>
      </ActivityStage>,
    );
    const className = screen.getByTestId('activity-stage').className;
    expect(className).not.toContain('paint');
    expect(className).not.toContain('strict');
  });

  it('renders an optional backdrop slot behind the children, empty by default', () => {
    render(
      <ActivityStage backdrop={<div data-testid="custom-backdrop" />}>
        <p>board</p>
      </ActivityStage>,
    );
    expect(screen.getByTestId('custom-backdrop')).toBeTruthy();
  });

  it('renders no backdrop node at all when none is supplied', () => {
    render(
      <ActivityStage>
        <p>board</p>
      </ActivityStage>,
    );
    expect(screen.queryByTestId('custom-backdrop')).toBeNull();
  });

  // Plantillas: fondo (owner decision 2026-10-23) — a molded quiz block's
  // own decorative background, painted full-bleed behind the content.
  it('paints a preset background as its own CSS gradient var', () => {
    render(
      <ActivityStage background={{ kind: 'preset', preset: 'mint' }}>
        <p>board</p>
      </ActivityStage>,
    );
    const layer = screen.getByTestId('activity-stage-backdrop-preset');
    expect(layer.style.background).toContain('var(--backdrop-mint)');
  });

  it('paints an uploaded photo (cover/center) plus the --backdrop-veil scrim', () => {
    render(
      <ActivityStage background={{ kind: 'image', path: 'activity-images/a1/background-i1.webp', width: 800, height: 600 }}>
        <p>board</p>
      </ActivityStage>,
    );
    const layer = screen.getByTestId('activity-stage-backdrop-image');
    expect(layer.style.backgroundImage).toContain(encodeURIComponent('activity-images/a1/background-i1.webp'));
    expect(layer.className).toContain('bg-cover');
    expect(layer.className).toContain('bg-center');
    expect(screen.getByTestId('activity-stage-backdrop-veil').style.background).toContain('var(--backdrop-veil)');
  });

  it('keeps the plain grey canvas (no backdrop node) while no background is supplied', () => {
    render(
      <ActivityStage>
        <p>board</p>
      </ActivityStage>,
    );
    const stage = screen.getByTestId('activity-stage');
    expect(stage.className).toContain('bg-background');
    expect(screen.queryByTestId('activity-stage-backdrop-preset')).toBeNull();
    expect(screen.queryByTestId('activity-stage-backdrop-image')).toBeNull();
  });
});
