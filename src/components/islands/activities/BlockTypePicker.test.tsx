// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BlockTypePicker from './BlockTypePicker';

function noopHandlers() {
  return {
    onSelectWorksheet: vi.fn(),
    onSelectQuestions: vi.fn(),
    onSelectMatch: vi.fn(),
    onSelectReorder: vi.fn(),
    onSelectCloze: vi.fn(),
    onSelectGroupSort: vi.fn(),
  };
}

const ALL_CARDS = [
  'picker-worksheet',
  'picker-match',
  'picker-reorder',
  'picker-cloze',
  'picker-groupsort',
];

describe('BlockTypePicker', () => {
  it('renders the worksheet, match, reorder and cloze cards, in Spanish', () => {
    render(<BlockTypePicker lang="es" {...noopHandlers()} />);
    expect(screen.getByTestId('picker-worksheet').textContent).toContain('Worksheet');
    expect(screen.getByTestId('picker-match').textContent).toContain('Une las parejas');
    expect(screen.getByTestId('picker-reorder').textContent).toContain('Reordenar');
    expect(screen.getByTestId('picker-cloze').textContent).toContain('Completar la frase');
  });

  // Owner decision (2026-10-19): "Varios juegos" serves too many purposes
  // and will get out of hand — hidden from creation while the flag is off
  // (`VARIOS_JUEGOS_ENABLED` in `lib/activities/flags.ts`).
  it('does not render the questions card while VARIOS_JUEGOS_ENABLED is false', () => {
    render(<BlockTypePicker lang="es" {...noopHandlers()} />);
    expect(screen.queryByTestId('picker-questions')).toBeNull();
    expect(screen.queryByTestId('card-preview-questions')).toBeNull();
  });

  it('clicking the cloze card calls onSelectCloze', () => {
    const handlers = noopHandlers();
    render(<BlockTypePicker lang="es" {...handlers} />);
    fireEvent.click(screen.getByTestId('picker-cloze'));
    expect(handlers.onSelectCloze).toHaveBeenCalledOnce();
  });

  it('renders in English', () => {
    render(<BlockTypePicker lang="en" {...noopHandlers()} />);
    expect(screen.getByTestId('picker-worksheet').textContent).toContain('Worksheet');
    expect(screen.getByTestId('picker-match').textContent).toContain('Match the pairs');
    expect(screen.getByTestId('picker-reorder').textContent).toContain('Reorder');
  });

  it('shows one plain description line per card, naming what the student does', () => {
    render(<BlockTypePicker lang="es" {...noopHandlers()} />);
    expect(screen.getByTestId('picker-worksheet').textContent).toContain(
      'Sube una hoja o PDF y marca dónde van las respuestas.',
    );
    expect(screen.getByTestId('picker-match').textContent).toContain('Arrastra cada respuesta junto a su pareja.');
    expect(screen.getByTestId('picker-reorder').textContent).toContain(
      'Arrastra las palabras para ordenar la oración.',
    );
  });

  it('lays the cards out as one responsive grid (3 columns wide, 2 narrower, 1 on a phone)', () => {
    render(<BlockTypePicker lang="es" {...noopHandlers()} />);
    expect(screen.getByTestId('block-type-picker').className).toContain('grid-cols-1');
    expect(screen.getByTestId('block-type-picker').className).toContain('sm:grid-cols-2');
    expect(screen.getByTestId('block-type-picker').className).toContain('lg:grid-cols-3');
  });

  it('lays each card out horizontally — a fixed-width illustration column beside the text', () => {
    render(<BlockTypePicker lang="es" {...noopHandlers()} />);
    const content = screen.getByTestId('picker-worksheet').querySelector('[data-slot="card-content"]');
    expect(content?.className).toContain('items-center');
    const illustrationColumn = screen.getByTestId('card-preview-worksheet').parentElement;
    expect(illustrationColumn?.className).toContain('w-28');
  });

  it('renders the groupsort card, in Spanish', () => {
    render(<BlockTypePicker lang="es" {...noopHandlers()} />);
    expect(screen.getByTestId('picker-groupsort').textContent).toContain('Ordenar por grupos');
  });

  it('calls onSelectGroupSort when the groupsort card is chosen', () => {
    const handlers = noopHandlers();
    render(<BlockTypePicker lang="es" {...handlers} />);
    fireEvent.click(screen.getByTestId('picker-groupsort'));
    expect(handlers.onSelectGroupSort).toHaveBeenCalledTimes(1);
  });

  it('calls onSelectWorksheet when the worksheet card is chosen', () => {
    const handlers = noopHandlers();
    render(<BlockTypePicker lang="es" {...handlers} />);
    fireEvent.click(screen.getByTestId('picker-worksheet'));
    expect(handlers.onSelectWorksheet).toHaveBeenCalledTimes(1);
  });

  it('calls onSelectMatch when the match card is chosen', () => {
    const handlers = noopHandlers();
    render(<BlockTypePicker lang="es" {...handlers} />);
    fireEvent.click(screen.getByTestId('picker-match'));
    expect(handlers.onSelectMatch).toHaveBeenCalledTimes(1);
  });

  it('calls onSelectReorder when the reorder card is chosen', () => {
    const handlers = noopHandlers();
    render(<BlockTypePicker lang="es" {...handlers} />);
    fireEvent.click(screen.getByTestId('picker-reorder'));
    expect(handlers.onSelectReorder).toHaveBeenCalledTimes(1);
  });

  it('renders a tiny CSS-only animated preview on each card, that only animates under motion-safe', () => {
    render(<BlockTypePicker lang="es" {...noopHandlers()} />);
    const worksheetPreview = screen.getByTestId('card-preview-worksheet');
    const matchPreview = screen.getByTestId('card-preview-match');
    const reorderPreview = screen.getByTestId('card-preview-reorder');
    expect(worksheetPreview.getAttribute('aria-hidden')).toBe('true');
    expect(matchPreview.getAttribute('aria-hidden')).toBe('true');
    expect(reorderPreview.getAttribute('aria-hidden')).toBe('true');
    // `motion-safe:` means "animate only when the viewer has no
    // reduced-motion preference" — a reduced-motion viewer gets the exact
    // same markup, just static (the Tailwind variant never applies), so
    // there is nothing JS-side to branch on here.
    expect(worksheetPreview.innerHTML).toContain('motion-safe:animate-pulse');
    expect(matchPreview.innerHTML).toContain('motion-safe:group-hover:');
    // The match preview's own line never leaves `motion-reduce:` to the
    // `motion-safe:` variant's absence alone — it also needs the line
    // visible (not mid-draw) at rest under reduced motion.
    expect(matchPreview.innerHTML).toContain('motion-reduce:');
    expect(reorderPreview.innerHTML).toContain('motion-safe:group-hover:');
  });

  it('is idle by default: no card is disabled or busy', () => {
    render(<BlockTypePicker lang="es" {...noopHandlers()} />);
    for (const testId of ALL_CARDS) {
      const button = screen.getByTestId(testId) as HTMLButtonElement;
      expect(button.disabled).toBe(false);
      expect(button.getAttribute('aria-busy')).toBe('false');
    }
  });

  describe('busyCard="worksheet"', () => {
    it('marks the worksheet card aria-busy, disables every card, and dims only the others', () => {
      const handlers = noopHandlers();
      render(<BlockTypePicker lang="es" {...handlers} busyCard="worksheet" />);
      const worksheetButton = screen.getByTestId('picker-worksheet') as HTMLButtonElement;
      const matchButton = screen.getByTestId('picker-match') as HTMLButtonElement;
      const reorderButton = screen.getByTestId('picker-reorder') as HTMLButtonElement;

      expect(worksheetButton.disabled).toBe(true);
      expect(matchButton.disabled).toBe(true);
      expect(reorderButton.disabled).toBe(true);
      expect(worksheetButton.getAttribute('aria-busy')).toBe('true');
      expect(matchButton.getAttribute('aria-busy')).toBe('false');
      expect(reorderButton.getAttribute('aria-busy')).toBe('false');
      expect(worksheetButton.className).not.toContain('opacity-50');
      expect(matchButton.className).toContain('opacity-50');
      expect(reorderButton.className).toContain('opacity-50');

      fireEvent.click(worksheetButton);
      fireEvent.click(matchButton);
      fireEvent.click(reorderButton);
      expect(handlers.onSelectWorksheet).not.toHaveBeenCalled();
      expect(handlers.onSelectMatch).not.toHaveBeenCalled();
      expect(handlers.onSelectReorder).not.toHaveBeenCalled();
    });

    it('renders a spinning CircleNotch in place of the worksheet card icon', () => {
      render(<BlockTypePicker lang="es" {...noopHandlers()} busyCard="worksheet" />);
      const worksheetIcon = screen.getByTestId('picker-worksheet').querySelector('svg');
      expect(worksheetIcon?.getAttribute('class')).toContain('animate-spin');
    });
  });

  describe('busyCard="match"', () => {
    it('marks the match card aria-busy, disables every card, and dims only the others', () => {
      render(<BlockTypePicker lang="es" {...noopHandlers()} busyCard="match" />);
      const worksheetButton = screen.getByTestId('picker-worksheet') as HTMLButtonElement;
      const matchButton = screen.getByTestId('picker-match') as HTMLButtonElement;
      const reorderButton = screen.getByTestId('picker-reorder') as HTMLButtonElement;

      expect(matchButton.getAttribute('aria-busy')).toBe('true');
      expect(worksheetButton.getAttribute('aria-busy')).toBe('false');
      expect(reorderButton.getAttribute('aria-busy')).toBe('false');
      expect(matchButton.className).not.toContain('opacity-50');
      expect(worksheetButton.className).toContain('opacity-50');
      expect(reorderButton.className).toContain('opacity-50');
    });

    it('renders a spinning CircleNotch in place of the match card icon', () => {
      render(<BlockTypePicker lang="es" {...noopHandlers()} busyCard="match" />);
      const matchIcon = screen.getByTestId('picker-match').querySelector('svg');
      expect(matchIcon?.getAttribute('class')).toContain('animate-spin');
    });
  });

  describe('busyCard="reorder"', () => {
    it('marks the reorder card aria-busy, disables every card, and dims only the others', () => {
      render(<BlockTypePicker lang="es" {...noopHandlers()} busyCard="reorder" />);
      const worksheetButton = screen.getByTestId('picker-worksheet') as HTMLButtonElement;
      const matchButton = screen.getByTestId('picker-match') as HTMLButtonElement;
      const reorderButton = screen.getByTestId('picker-reorder') as HTMLButtonElement;

      expect(reorderButton.getAttribute('aria-busy')).toBe('true');
      expect(worksheetButton.getAttribute('aria-busy')).toBe('false');
      expect(matchButton.getAttribute('aria-busy')).toBe('false');
      expect(reorderButton.className).not.toContain('opacity-50');
      expect(worksheetButton.className).toContain('opacity-50');
      expect(matchButton.className).toContain('opacity-50');
    });

    it('renders a spinning CircleNotch in place of the reorder card icon', () => {
      render(<BlockTypePicker lang="es" {...noopHandlers()} busyCard="reorder" />);
      const reorderIcon = screen.getByTestId('picker-reorder').querySelector('svg');
      expect(reorderIcon?.getAttribute('class')).toContain('animate-spin');
    });
  });
});
