// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { gameDropAnimation, gameTileTransitionClassName, GameSoundToggle, liftedTileClassName } from './gameFeel';

afterEach(cleanup);

describe('liftedTileClassName', () => {
  it('scales and deepens the shadow normally', () => {
    const className = liftedTileClassName(false);
    expect(className).toContain('scale-');
    expect(className).toContain('shadow-xl');
  });

  it('applies no scaling/shadow under reduced motion', () => {
    expect(liftedTileClassName(true)).toBe('');
  });
});

describe('gameTileTransitionClassName', () => {
  it('transitions normally', () => {
    expect(gameTileTransitionClassName(false)).toContain('transition');
  });

  it('is empty under reduced motion', () => {
    expect(gameTileTransitionClassName(true)).toBe('');
  });
});

describe('gameDropAnimation', () => {
  it('eases over ~180ms normally', () => {
    const config = gameDropAnimation(false);
    expect(config).not.toBeNull();
    expect(config?.duration).toBe(180);
  });

  it('is null (instant) under reduced motion', () => {
    expect(gameDropAnimation(true)).toBeNull();
  });
});

describe('GameSoundToggle', () => {
  it('shows the mute label and a speaker icon while unmuted', () => {
    render(<GameSoundToggle muted={false} onToggle={vi.fn()} labelMute="Silenciar" labelUnmute="Activar sonido" />);
    const button = screen.getByTestId('game-sound-toggle');
    expect(button.getAttribute('aria-label')).toBe('Silenciar');
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows the unmute label while muted', () => {
    render(<GameSoundToggle muted onToggle={vi.fn()} labelMute="Silenciar" labelUnmute="Activar sonido" />);
    const button = screen.getByTestId('game-sound-toggle');
    expect(button.getAttribute('aria-label')).toBe('Activar sonido');
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('calls onToggle when clicked', () => {
    const onToggle = vi.fn();
    render(<GameSoundToggle muted={false} onToggle={onToggle} labelMute="Silenciar" labelUnmute="Activar sonido" />);
    fireEvent.click(screen.getByTestId('game-sound-toggle'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
