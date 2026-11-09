// @vitest-environment jsdom
/**
 * UiReferenceIsland — smoke coverage for the coherent-loading-states
 * sections added to the `/[lang]/admin/ui` reference (skeleton shapes,
 * TaskProgress states, image fade-in/broken placeholder). The rest of the
 * page (inputs/buttons/cards/toasts) predates this pass and has no prior
 * test file — this one stays scoped to what this pass added.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import UiReferenceIsland from './UiReferenceIsland';

afterEach(() => cleanup());

describe('UiReferenceIsland — skeletons', () => {
  it('shows a card-list skeleton and a text-lines skeleton', () => {
    render(<UiReferenceIsland lang="es" />);
    expect(screen.getByTestId('ui-ref-skeleton-card-list').querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    expect(screen.getByTestId('ui-ref-skeleton-lines').querySelectorAll('[data-slot="skeleton"]').length).toBe(3);
  });
});

describe('UiReferenceIsland — task progress', () => {
  it('shows a running state with a cancel button and an error state with retry/choose-another', () => {
    render(<UiReferenceIsland lang="es" />);
    const panels = screen.getAllByTestId('task-progress');
    expect(panels).toHaveLength(2);
    expect(screen.getByTestId('task-progress-cancel')).toBeTruthy();
    expect(screen.getByTestId('task-progress-retry')).toBeTruthy();
    expect(screen.getByTestId('task-progress-choose-another')).toBeTruthy();
  });
});

describe('UiReferenceIsland — capsule dropdowns (Inglés pattern, owner approval 2026-11-09)', () => {
  it('shows the generic capsule select, its disabled state and the level select, inside the Inglés scope', () => {
    render(<UiReferenceIsland lang="es" />);
    const section = screen.getByTestId('ui-ref-capsule-selects');
    expect(section.getAttribute('data-theme')).toBe('ingles');

    const generic = screen.getByTestId('ui-ref-capsule-select-default');
    expect(generic.getAttribute('role')).toBe('combobox');
    expect(generic.textContent).toBe('Más recientes');
    expect((screen.getByTestId('ui-ref-capsule-select-disabled') as HTMLButtonElement).disabled).toBe(true);

    const level = screen.getByTestId('ui-ref-level-select');
    expect(level.textContent).toBe('Intermedio B1');
    expect(level.querySelector('[data-slot="level-bars"]')).not.toBeNull();
    expect(screen.getByTestId('ui-ref-level-select-none').textContent).toBe('Sin nivel');
    for (const el of [generic, level]) expect(section.contains(el)).toBe(true);
  });
});

describe('UiReferenceIsland — images', () => {
  it('fades the loaded swatch in, and swaps the broken swatch for a neutral placeholder', () => {
    render(<UiReferenceIsland lang="es" />);
    const images = document.querySelectorAll('img');
    expect(images.length).toBe(2);

    const [loadedImg, brokenImg] = Array.from(images) as HTMLImageElement[];
    expect(loadedImg.className).toContain('opacity-0');
    fireEvent.load(loadedImg);
    expect(loadedImg.className).toContain('opacity-100');

    fireEvent.error(brokenImg);
    expect(document.querySelectorAll('img').length).toBe(1); // the broken one was replaced by the icon placeholder
  });
});
