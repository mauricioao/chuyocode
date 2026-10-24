// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import WindowTitleBar from './WindowTitleBar';

afterEach(() => cleanup());

describe('WindowTitleBar', () => {
  it('renders the centred title', () => {
    render(<WindowTitleBar title="Verbos irregulares" />);
    expect(screen.getByTestId('window-title-bar-title').textContent).toBe('Verbos irregulares');
  });

  it('renders the level badge when supplied', () => {
    render(<WindowTitleBar title="Verbos irregulares" levelChip="Básico A2" />);
    expect(screen.getByTestId('window-title-bar-level').textContent).toBe('Básico A2');
  });

  it('omits the level badge entirely when not supplied', () => {
    render(<WindowTitleBar title="Verbos irregulares" />);
    expect(screen.queryByTestId('window-title-bar-level')).toBeNull();
  });

  it('uses the same 3-column grid as the real desk window title bar', () => {
    render(<WindowTitleBar title="Verbos irregulares" />);
    expect(screen.getByTestId('window-title-bar').className).toContain('grid-cols-[1fr_auto_1fr]');
  });
});
