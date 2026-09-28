// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import WorksheetPracticePlayer from './WorksheetPracticePlayer';
import type { WorksheetBlock } from '@/lib/activities/blocks';

afterEach(() => cleanup());

const BLOCK: WorksheetBlock = {
  id: 'b1',
  type: 'worksheet',
  rotation: 0,
  image: { path: 'activity-images/act-1/img-1.webp', width: 800, height: 400 },
  zones: [{ id: 'z1', x: 0.1, y: 0.2, w: 0.3, h: 0.1, kind: 'text', answers: ['sat'] }],
};

function renderPlayer(overrides: Partial<Parameters<typeof WorksheetPracticePlayer>[0]> = {}) {
  return render(
    <WorksheetPracticePlayer
      lang="es"
      block={BLOCK}
      imageUrl="/img.webp"
      practice={{ values: {}, onChange: () => {} }}
      {...overrides}
    />,
  );
}

describe('WorksheetPracticePlayer', () => {
  it('renders the underlying WorksheetPlayer in practice mode (no "not graded" notice)', () => {
    renderPlayer();
    expect(screen.getByTestId('worksheet-player').textContent).not.toContain('no corrige');
  });

  it('starts at 100% width ("Ajustar"/Fit)', () => {
    renderPlayer();
    expect(screen.getByTestId('practice-zoom-content').style.width).toBe('100%');
  });

  it('zooms in by one step on click', () => {
    renderPlayer();
    fireEvent.click(screen.getByTestId('practice-zoom-in'));
    expect(screen.getByTestId('practice-zoom-content').style.width).toBe('125%');
  });

  it('zooms out by one step on click', () => {
    renderPlayer();
    fireEvent.click(screen.getByTestId('practice-zoom-out'));
    expect(screen.getByTestId('practice-zoom-content').style.width).toBe('75%');
  });

  it('resets to 100% via the Fit button after zooming', () => {
    renderPlayer();
    fireEvent.click(screen.getByTestId('practice-zoom-in'));
    fireEvent.click(screen.getByTestId('practice-zoom-in'));
    fireEvent.click(screen.getByTestId('practice-zoom-fit'));
    expect(screen.getByTestId('practice-zoom-content').style.width).toBe('100%');
  });

  it('never zooms below the 25% floor', () => {
    renderPlayer();
    for (let i = 0; i < 10; i += 1) {
      fireEvent.click(screen.getByTestId('practice-zoom-out'));
    }
    expect(screen.getByTestId('practice-zoom-content').style.width).toBe('25%');
  });

  it('never zooms above the 400% ceiling', () => {
    renderPlayer();
    for (let i = 0; i < 20; i += 1) {
      fireEvent.click(screen.getByTestId('practice-zoom-in'));
    }
    expect(screen.getByTestId('practice-zoom-content').style.width).toBe('400%');
  });

  it('forwards value changes to the caller through practice.onChange', () => {
    const onChange = vi.fn();
    renderPlayer({ practice: { values: {}, onChange } });
    const input = screen.getByTestId('player-zone-z1').querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sat' } });
    expect(onChange).toHaveBeenCalledWith('z1', 'sat');
  });

  it('shows grading feedback once practice.results is provided', () => {
    renderPlayer({ practice: { values: { z1: 'sat' }, onChange: () => {}, results: { z1: true } } });
    expect(screen.getByTestId('player-zone-result-z1').textContent).toBe('Correcto');
  });
});
