// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AudioMarkerButton from './AudioMarkerButton';

describe('AudioMarkerButton', () => {
  it('positions itself at the given fractional x/y', () => {
    render(<AudioMarkerButton x={0.25} y={0.75} playing={false} label="Audio marker" data-testid="marker" />);
    const button = screen.getByTestId('marker');
    expect(button.style.left).toBe('25%');
    expect(button.style.top).toBe('75%');
  });

  it('shows the play icon when not playing, and the pause icon when playing', () => {
    const { rerender } = render(<AudioMarkerButton x={0} y={0} playing={false} label="l" />);
    expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('false');
    rerender(<AudioMarkerButton x={0} y={0} playing label="l" />);
    expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('true');
  });

  it('calls onToggle on click, without the click bubbling to an ancestor', () => {
    const onToggle = vi.fn();
    const onAncestorClick = vi.fn();
    render(
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions
      <div onClick={onAncestorClick}>
        <AudioMarkerButton x={0} y={0} playing={false} label="Audio marker" onToggle={onToggle} />
      </div>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onAncestorClick).not.toHaveBeenCalled();
  });

  it('is inert (disabled, unreachable by tab, no pointer events) when inert', () => {
    render(<AudioMarkerButton x={0} y={0} playing={false} label="l" inert data-testid="marker" />);
    const button = screen.getByTestId('marker') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('tabindex')).toBe('-1');
    expect(button.className).toContain('pointer-events-none');
  });

  it('adds a selection ring when selected, independent of playing', () => {
    render(<AudioMarkerButton x={0} y={0} playing={false} selected label="l" data-testid="marker" />);
    expect(screen.getByTestId('marker').className).toContain('ring-accent-ink');
  });

  it('forwards onPointerDown (the editor canvas drag handle)', () => {
    const onPointerDown = vi.fn();
    render(<AudioMarkerButton x={0} y={0} playing={false} label="l" onPointerDown={onPointerDown} data-testid="marker" />);
    screen.getByTestId('marker').dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(onPointerDown).toHaveBeenCalledTimes(1);
  });
});
