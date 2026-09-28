// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import ActivityPracticeIsland from './ActivityPracticeIsland';
import type { Block, WorksheetBlock, QuizBlock } from '@/lib/activities/blocks';

afterEach(() => cleanup());

function resolveImageUrl(path: string): string {
  return `/api/actividades/imagen?path=${encodeURIComponent(path)}`;
}

const WORKSHEET: WorksheetBlock = {
  id: 'w1',
  type: 'worksheet',
  rotation: 0,
  image: { path: 'activity-images/act-1/img-1.webp', width: 800, height: 400 },
  zones: [
    { id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: ['cat'] },
    { id: 'z2', x: 0.5, y: 0.5, w: 0.2, h: 0.1, kind: 'choice', answers: ['blue'], options: ['blue', 'red'] },
  ],
};

const SECOND_WORKSHEET: WorksheetBlock = {
  id: 'w2',
  type: 'worksheet',
  rotation: 0,
  image: { path: 'activity-images/act-1/img-2.webp', width: 800, height: 400 },
  zones: [{ id: 'z3', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: ['dog'] }],
};

const QUIZ: QuizBlock = {
  id: 'q1',
  type: 'quiz',
  payload: { pools: { opts: [{ id: 'a', text: 'x' }] }, slots: [{ id: 's1', label: 'x', input: 'choice', pool: 'opts', answer: ['a'] }] },
};

function renderIsland(blocks: Block[]) {
  return render(<ActivityPracticeIsland lang="es" blocks={blocks} resolveImageUrl={resolveImageUrl} />);
}

describe('ActivityPracticeIsland — rendering blocks in order', () => {
  it('renders a worksheet block through the practice player', () => {
    renderIsland([WORKSHEET]);
    expect(screen.getByTestId('worksheet-player')).toBeTruthy();
  });

  it('renders a quiz block as a "coming soon" placeholder, not a functional player', () => {
    renderIsland([QUIZ]);
    expect(screen.getByTestId('quiz-coming-soon-q1').textContent).toContain('Próximamente');
    expect(screen.queryByTestId('worksheet-player')).toBeNull();
  });

  it('renders mixed blocks in the given order', () => {
    const { container } = renderIsland([WORKSHEET, QUIZ]);
    const testIds = Array.from(container.querySelectorAll('[data-testid]')).map((el) =>
      el.getAttribute('data-testid'),
    );
    const worksheetIndex = testIds.indexOf('worksheet-player');
    const quizIndex = testIds.indexOf('quiz-coming-soon-q1');
    expect(worksheetIndex).toBeGreaterThanOrEqual(0);
    expect(quizIndex).toBeGreaterThan(worksheetIndex);
  });
});

describe('ActivityPracticeIsland — Comprobar/Reintentar', () => {
  it('shows no controls when there is nothing gradable (quiz-only activity)', () => {
    renderIsland([QUIZ]);
    expect(screen.queryByTestId('practice-controls')).toBeNull();
  });

  it('shows Comprobar before grading', () => {
    renderIsland([WORKSHEET]);
    expect(screen.getByTestId('practice-check-button')).toBeTruthy();
    expect(screen.queryByTestId('practice-retry-button')).toBeNull();
  });

  it('grades every zone and shows the combined score on Comprobar', () => {
    renderIsland([WORKSHEET]);
    const textInput = screen.getByTestId('player-zone-z1').querySelector('input') as HTMLInputElement;
    fireEvent.change(textInput, { target: { value: 'cat' } });
    const select = screen.getByTestId('player-zone-z2').querySelector('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'blue' } });

    fireEvent.click(screen.getByTestId('practice-check-button'));

    expect(screen.getByTestId('practice-score').textContent).toContain('2 / 2');
    expect(screen.getByTestId('player-zone-result-z1').textContent).toBe('Correcto');
    expect(screen.getByTestId('player-zone-result-z2').textContent).toBe('Correcto');
  });

  it('combines zones across MULTIPLE worksheet blocks into one score', () => {
    renderIsland([WORKSHEET, SECOND_WORKSHEET]);
    fireEvent.click(screen.getByTestId('practice-check-button'));
    // Nothing filled in: 0 correct out of 3 total zones (z1, z2, z3).
    expect(screen.getByTestId('practice-score').textContent).toContain('0 / 3');
  });

  it('swaps Comprobar for Reintentar once graded', () => {
    renderIsland([WORKSHEET]);
    fireEvent.click(screen.getByTestId('practice-check-button'));
    expect(screen.queryByTestId('practice-check-button')).toBeNull();
    expect(screen.getByTestId('practice-retry-button')).toBeTruthy();
  });

  it('disables inputs once graded', () => {
    renderIsland([WORKSHEET]);
    fireEvent.click(screen.getByTestId('practice-check-button'));
    const textInput = screen.getByTestId('player-zone-z1').querySelector('input') as HTMLInputElement;
    expect(textInput.disabled).toBe(true);
  });

  it('Reintentar clears every answer and result, and re-enables inputs', () => {
    renderIsland([WORKSHEET]);
    const textInput = screen.getByTestId('player-zone-z1').querySelector('input') as HTMLInputElement;
    fireEvent.change(textInput, { target: { value: 'cat' } });
    fireEvent.click(screen.getByTestId('practice-check-button'));

    fireEvent.click(screen.getByTestId('practice-retry-button'));

    expect(screen.queryByTestId('practice-score')).toBeNull();
    expect(screen.queryByTestId('player-zone-result-z1')).toBeNull();
    const freshInput = screen.getByTestId('player-zone-z1').querySelector('input') as HTMLInputElement;
    expect(freshInput.value).toBe('');
    expect(freshInput.disabled).toBe(false);
    expect(screen.getByTestId('practice-check-button')).toBeTruthy();
  });
});
