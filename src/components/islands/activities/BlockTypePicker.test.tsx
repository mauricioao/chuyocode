// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BlockTypePicker from './BlockTypePicker';

function noopHandlers() {
  return { onSelectWorksheet: vi.fn(), onSelectQuestions: vi.fn(), onSelectMatch: vi.fn() };
}

describe('BlockTypePicker', () => {
  it('renders the worksheet, questions and match cards, in Spanish', () => {
    render(<BlockTypePicker lang="es" {...noopHandlers()} />);
    expect(screen.getByTestId('picker-worksheet').textContent).toContain('Worksheet');
    expect(screen.getByTestId('picker-questions').textContent).toContain('Básico');
    expect(screen.getByTestId('picker-match').textContent).toContain('Une las parejas');
  });

  it('renders in English', () => {
    render(<BlockTypePicker lang="en" {...noopHandlers()} />);
    expect(screen.getByTestId('picker-worksheet').textContent).toContain('Worksheet');
    expect(screen.getByTestId('picker-questions').textContent).toContain('Basic');
    expect(screen.getByTestId('picker-match').textContent).toContain('Match the pairs');
  });

  it('shows one plain description line per card, naming what the student does', () => {
    render(<BlockTypePicker lang="es" {...noopHandlers()} />);
    expect(screen.getByTestId('picker-worksheet').textContent).toContain(
      'Sube una hoja o PDF y marca dónde van las respuestas.',
    );
    expect(screen.getByTestId('picker-match').textContent).toContain('Arrastra cada respuesta junto a su pareja.');
  });

  it('lays the three cards out as one responsive grid (3 columns wide, 2 narrower, 1 on a phone)', () => {
    render(<BlockTypePicker lang="es" {...noopHandlers()} />);
    expect(screen.getByTestId('block-type-picker').className).toContain('grid-cols-1');
    expect(screen.getByTestId('block-type-picker').className).toContain('sm:grid-cols-2');
    expect(screen.getByTestId('block-type-picker').className).toContain('lg:grid-cols-3');
  });

  it('calls onSelectWorksheet when the worksheet card is chosen', () => {
    const handlers = noopHandlers();
    render(<BlockTypePicker lang="es" {...handlers} />);
    fireEvent.click(screen.getByTestId('picker-worksheet'));
    expect(handlers.onSelectWorksheet).toHaveBeenCalledTimes(1);
  });

  it('calls onSelectQuestions when the questions card is chosen', () => {
    const handlers = noopHandlers();
    render(<BlockTypePicker lang="es" {...handlers} />);
    fireEvent.click(screen.getByTestId('picker-questions'));
    expect(handlers.onSelectQuestions).toHaveBeenCalledTimes(1);
  });

  it('calls onSelectMatch when the match card is chosen', () => {
    const handlers = noopHandlers();
    render(<BlockTypePicker lang="es" {...handlers} />);
    fireEvent.click(screen.getByTestId('picker-match'));
    expect(handlers.onSelectMatch).toHaveBeenCalledTimes(1);
  });

  it('renders a tiny CSS-only animated preview on each card, that only animates under motion-safe', () => {
    render(<BlockTypePicker lang="es" {...noopHandlers()} />);
    const worksheetPreview = screen.getByTestId('card-preview-worksheet');
    const questionsPreview = screen.getByTestId('card-preview-questions');
    const matchPreview = screen.getByTestId('card-preview-match');
    expect(worksheetPreview.getAttribute('aria-hidden')).toBe('true');
    expect(questionsPreview.getAttribute('aria-hidden')).toBe('true');
    expect(matchPreview.getAttribute('aria-hidden')).toBe('true');
    // `motion-safe:` means "animate only when the viewer has no
    // reduced-motion preference" — a reduced-motion viewer gets the exact
    // same markup, just static (the Tailwind variant never applies), so
    // there is nothing JS-side to branch on here.
    expect(worksheetPreview.innerHTML).toContain('motion-safe:animate-pulse');
    expect(questionsPreview.innerHTML).toContain('motion-safe:animate-pulse');
    expect(matchPreview.innerHTML).toContain('motion-safe:group-hover:');
    // The match preview's own line never leaves `motion-reduce:` to the
    // `motion-safe:` variant's absence alone — it also needs the line
    // visible (not mid-draw) at rest under reduced motion.
    expect(matchPreview.innerHTML).toContain('motion-reduce:');
  });

  it('is idle by default: no card is disabled or busy', () => {
    render(<BlockTypePicker lang="es" {...noopHandlers()} />);
    for (const testId of ['picker-worksheet', 'picker-questions', 'picker-match']) {
      const button = screen.getByTestId(testId) as HTMLButtonElement;
      expect(button.disabled).toBe(false);
      expect(button.getAttribute('aria-busy')).toBe('false');
    }
  });

  describe('busyCard="worksheet"', () => {
    it('marks the worksheet card aria-busy, disables all three, and dims only the others', () => {
      const handlers = noopHandlers();
      render(<BlockTypePicker lang="es" {...handlers} busyCard="worksheet" />);
      const worksheetButton = screen.getByTestId('picker-worksheet') as HTMLButtonElement;
      const questionsButton = screen.getByTestId('picker-questions') as HTMLButtonElement;
      const matchButton = screen.getByTestId('picker-match') as HTMLButtonElement;

      expect(worksheetButton.disabled).toBe(true);
      expect(questionsButton.disabled).toBe(true);
      expect(matchButton.disabled).toBe(true);
      expect(worksheetButton.getAttribute('aria-busy')).toBe('true');
      expect(questionsButton.getAttribute('aria-busy')).toBe('false');
      expect(matchButton.getAttribute('aria-busy')).toBe('false');
      expect(worksheetButton.className).not.toContain('opacity-50');
      expect(questionsButton.className).toContain('opacity-50');
      expect(matchButton.className).toContain('opacity-50');

      fireEvent.click(worksheetButton);
      fireEvent.click(questionsButton);
      fireEvent.click(matchButton);
      expect(handlers.onSelectWorksheet).not.toHaveBeenCalled();
      expect(handlers.onSelectQuestions).not.toHaveBeenCalled();
      expect(handlers.onSelectMatch).not.toHaveBeenCalled();
    });

    it('renders a spinning CircleNotch in place of the worksheet card icon', () => {
      render(<BlockTypePicker lang="es" {...noopHandlers()} busyCard="worksheet" />);
      const worksheetIcon = screen.getByTestId('picker-worksheet').querySelector('svg');
      expect(worksheetIcon?.getAttribute('class')).toContain('animate-spin');
    });
  });

  describe('busyCard="questions"', () => {
    it('marks the questions card aria-busy, disables all three, and dims only the others', () => {
      render(<BlockTypePicker lang="es" {...noopHandlers()} busyCard="questions" />);
      const worksheetButton = screen.getByTestId('picker-worksheet') as HTMLButtonElement;
      const questionsButton = screen.getByTestId('picker-questions') as HTMLButtonElement;
      const matchButton = screen.getByTestId('picker-match') as HTMLButtonElement;

      expect(questionsButton.getAttribute('aria-busy')).toBe('true');
      expect(worksheetButton.getAttribute('aria-busy')).toBe('false');
      expect(matchButton.getAttribute('aria-busy')).toBe('false');
      expect(questionsButton.className).not.toContain('opacity-50');
      expect(worksheetButton.className).toContain('opacity-50');
      expect(matchButton.className).toContain('opacity-50');
    });
  });

  describe('busyCard="match"', () => {
    it('marks the match card aria-busy, disables all three, and dims only the others', () => {
      render(<BlockTypePicker lang="es" {...noopHandlers()} busyCard="match" />);
      const worksheetButton = screen.getByTestId('picker-worksheet') as HTMLButtonElement;
      const questionsButton = screen.getByTestId('picker-questions') as HTMLButtonElement;
      const matchButton = screen.getByTestId('picker-match') as HTMLButtonElement;

      expect(matchButton.getAttribute('aria-busy')).toBe('true');
      expect(worksheetButton.getAttribute('aria-busy')).toBe('false');
      expect(questionsButton.getAttribute('aria-busy')).toBe('false');
      expect(matchButton.className).not.toContain('opacity-50');
      expect(worksheetButton.className).toContain('opacity-50');
      expect(questionsButton.className).toContain('opacity-50');
    });

    it('renders a spinning CircleNotch in place of the match card icon', () => {
      render(<BlockTypePicker lang="es" {...noopHandlers()} busyCard="match" />);
      const matchIcon = screen.getByTestId('picker-match').querySelector('svg');
      expect(matchIcon?.getAttribute('class')).toContain('animate-spin');
    });
  });
});
