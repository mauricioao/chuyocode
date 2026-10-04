// @vitest-environment jsdom
/**
 * `PlacementIsland` — the whole client-side quiz (intro -> one question per
 * screen -> result). Written FIRST, against the not-yet-written component, so
 * this file is expected to fail until `PlacementIsland.tsx` exists.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PLACEMENT_ITEMS } from '@/content/placement/items';
import { STORAGE_KEY } from '@/lib/placement/storage';
import PlacementIsland from './PlacementIsland';

function start(lang: 'es' | 'en' = 'es') {
  render(<PlacementIsland lang={lang} />);
  fireEvent.click(screen.getByTestId('placement-start'));
}

function answerDontKnow(times: number) {
  for (let i = 0; i < times; i++) {
    fireEvent.click(screen.getByTestId('placement-dontknow'));
  }
}

describe('PlacementIsland', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('shows the intro screen first, then the first item after starting', () => {
    render(<PlacementIsland lang="es" />);
    expect(screen.getByTestId('placement-intro')).not.toBeNull();
    expect(screen.queryByTestId('placement-prompt')).toBeNull();

    fireEvent.click(screen.getByTestId('placement-start'));

    expect(screen.getByTestId('placement-prompt').textContent).toBe(PLACEMENT_ITEMS[0]!.prompt);
    expect(screen.getByTestId('task-progress-label').textContent).toBe('Pregunta 1 de 30');
  });

  it('disables "Siguiente" until an option is chosen', () => {
    start();
    const next = screen.getByTestId('placement-next') as HTMLButtonElement;
    expect(next.disabled).toBe(true);

    fireEvent.click(screen.getByTestId('placement-option-0'));
    expect(next.disabled).toBe(false);
  });

  it('choosing an option and clicking "Siguiente" advances, and the progress updates', () => {
    start();

    fireEvent.click(screen.getByTestId('placement-option-0'));
    fireEvent.click(screen.getByTestId('placement-next'));

    expect(screen.getByTestId('placement-prompt').textContent).toBe(PLACEMENT_ITEMS[1]!.prompt);
    expect(screen.getByTestId('task-progress-label').textContent).toBe('Pregunta 2 de 30');
  });

  it('"No lo sé" advances without choosing an option', () => {
    start();

    fireEvent.click(screen.getByTestId('placement-dontknow'));

    expect(screen.getByTestId('placement-prompt').textContent).toBe(PLACEMENT_ITEMS[1]!.prompt);
  });

  it('finishing the test shows the result, persists it, and never calls fetch', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    start();
    answerDontKnow(PLACEMENT_ITEMS.length); // "No lo sé" on every item -> nothing passed.

    expect(screen.getByTestId('placement-result')).not.toBeNull();
    expect(screen.getByTestId('placement-result-level').textContent).toBe('Todavía no alcanzas el nivel A1');
    expect(screen.getByTestId('placement-result-recommended').textContent).toContain('A1');

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');
    expect(stored.version).toBe(1);
    expect(stored.estimatedLevel).toBeNull();
    expect(stored.recommendedLevel).toBe('A1');
    expect(typeof stored.takenAt).toBe('string');
    expect(Number.isNaN(Date.parse(stored.takenAt))).toBe(false);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('links the result to practising the recommended level', () => {
    start();
    answerDontKnow(PLACEMENT_ITEMS.length);

    const link = screen.getByTestId('placement-practice-link') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/es/ingles/propuestos?nivel=A1');
  });

  it('offers "Repetir el test" on the result screen, which restarts the quiz', () => {
    start();
    answerDontKnow(PLACEMENT_ITEMS.length);

    fireEvent.click(screen.getByTestId('placement-retry'));

    expect(screen.getByTestId('placement-prompt').textContent).toBe(PLACEMENT_ITEMS[0]!.prompt);
    expect(screen.getByTestId('task-progress-label').textContent).toBe('Pregunta 1 de 30');
  });

  it('shows a previously stored result on a later visit, with the option to retake', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, estimatedLevel: 'A2', recommendedLevel: 'B1', takenAt: '2026-09-01T00:00:00.000Z' }),
    );

    render(<PlacementIsland lang="es" />);

    expect(screen.getByTestId('placement-last-result').textContent).toContain('2026-09-01');
    expect(screen.getByTestId('placement-start').textContent).toBe('Repetir el test');
  });

  it('renders English copy for lang="en"', () => {
    render(<PlacementIsland lang="en" />);
    expect(screen.getByTestId('placement-start').textContent).toBe('Start the test');

    fireEvent.click(screen.getByTestId('placement-start'));

    expect(screen.getByTestId('task-progress-label').textContent).toBe('Question 1 of 30');
    expect(screen.getByTestId('placement-next').textContent).toBe('Next');
    expect(screen.getByTestId('placement-dontknow').textContent).toBe("I don't know");
  });
});
