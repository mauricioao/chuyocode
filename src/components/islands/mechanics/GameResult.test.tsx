// @vitest-environment jsdom
/**
 * GameResult tests — the outcome classification, which actions render for
 * which combination of props, and the behavior of each action. The four
 * drag templates' own test files cover the WIRING into this component
 * (score computation, "Repasar las que fallé" actually resuming play); this
 * file owns the component's own contract in isolation.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import GameResult from './GameResult';

afterEach(cleanup);

describe('GameResult', () => {
  describe('outcome by score', () => {
    it('is "perfect" when every item is correct', () => {
      render(<GameResult lang="es" correct={3} total={3} onPlayAgain={() => {}} />);
      expect(screen.getByTestId('game-result').getAttribute('data-outcome')).toBe('perfect');
      expect(screen.getByText('¡Perfecto!')).toBeTruthy();
    });

    it('is "good" at exactly 70% correct', () => {
      render(<GameResult lang="es" correct={7} total={10} onPlayAgain={() => {}} />);
      expect(screen.getByTestId('game-result').getAttribute('data-outcome')).toBe('good');
      expect(screen.getByText('¡Muy bien!')).toBeTruthy();
    });

    it('is "retry" just under 70% correct', () => {
      render(<GameResult lang="es" correct={6} total={10} onPlayAgain={() => {}} />);
      expect(screen.getByTestId('game-result').getAttribute('data-outcome')).toBe('retry');
      expect(screen.getByText('¡Casi! Sigue practicando')).toBeTruthy();
    });
  });

  describe('score line', () => {
    it('uses the shared "de"/"correctas" wording when no `resultWord` is given', () => {
      render(<GameResult lang="es" correct={2} total={3} onPlayAgain={() => {}} />);
      expect(screen.getByTestId('game-result-score').textContent).toBe('2 de 3 correctas');
    });

    it('reuses the host template\'s own last word when `resultWord` is given', () => {
      render(<GameResult lang="es" correct={4} total={4} resultWord="bien ubicados" onPlayAgain={() => {}} />);
      expect(screen.getByTestId('game-result-score').textContent).toBe('4 de 4 bien ubicados');
    });

    it('renders the English wording for lang="en"', () => {
      render(<GameResult lang="en" correct={2} total={3} onPlayAgain={() => {}} />);
      expect(screen.getByTestId('game-result-score').textContent).toBe('2 of 3 correct');
    });
  });

  describe('actions — no `nextHref` (editor preview, any host with no next activity)', () => {
    it('makes "Jugar de nuevo" the PRIMARY action and calls `onPlayAgain`', () => {
      const onPlayAgain = vi.fn();
      render(<GameResult lang="es" correct={3} total={3} onPlayAgain={onPlayAgain} />);
      const button = screen.getByTestId('game-result-play-again');
      expect(screen.queryByTestId('game-result-next')).toBeNull();
      fireEvent.click(button);
      expect(onPlayAgain).toHaveBeenCalledOnce();
    });
  });

  describe('actions — with `nextHref` (the practice page)', () => {
    it('makes "Otra actividad" the PRIMARY action, a real link to `nextHref`, and keeps "Jugar de nuevo" as a secondary action', () => {
      const onPlayAgain = vi.fn();
      render(
        <GameResult lang="es" correct={3} total={3} nextHref="/es/ingles/actividades?nivel=a1" onPlayAgain={onPlayAgain} />,
      );
      const next = screen.getByTestId('game-result-next');
      expect(next.tagName).toBe('A');
      expect(next.getAttribute('href')).toBe('/es/ingles/actividades?nivel=a1');
      expect(next.textContent).toBe('Otra actividad');

      fireEvent.click(screen.getByTestId('game-result-play-again'));
      expect(onPlayAgain).toHaveBeenCalledOnce();
    });
  });

  describe('"Repasar las que fallé"', () => {
    it('is omitted when the round was perfect, even if the host supplies `onReviewWrong`', () => {
      render(<GameResult lang="es" correct={3} total={3} onPlayAgain={() => {}} onReviewWrong={() => {}} />);
      expect(screen.queryByTestId('game-result-review')).toBeNull();
    });

    it('is omitted when there were mistakes but the host supplies no `onReviewWrong` (a mechanic that cannot end with mistakes)', () => {
      render(<GameResult lang="es" correct={2} total={3} onPlayAgain={() => {}} />);
      expect(screen.queryByTestId('game-result-review')).toBeNull();
    });

    it('renders and calls `onReviewWrong` when there were mistakes AND the host supplies a handler', () => {
      const onReviewWrong = vi.fn();
      render(<GameResult lang="es" correct={2} total={3} onPlayAgain={() => {}} onReviewWrong={onReviewWrong} />);
      fireEvent.click(screen.getByTestId('game-result-review'));
      expect(onReviewWrong).toHaveBeenCalledOnce();
    });
  });

  describe('guest invite', () => {
    it('is omitted for a signed-in host (no `guest` prop)', () => {
      render(<GameResult lang="es" correct={3} total={3} onPlayAgain={() => {}} />);
      expect(screen.queryByTestId('game-result-guest-banner')).toBeNull();
    });

    it('renders the invite with a sign-up link when the host is a guest', () => {
      render(
        <GameResult
          lang="es"
          correct={3}
          total={3}
          onPlayAgain={() => {}}
          guest={{ signUpHref: '/es/auth/entrar?mode=signup&next=%2Fes%2Fx' }}
        />,
      );
      expect(screen.getByTestId('game-result-guest-banner').textContent).toContain(
        '¿Te gustó? Crea tu cuenta gratis para guardar tus favoritas y crear las tuyas.',
      );
      const link = screen.getByTestId('game-result-guest-sign-up-link');
      expect(link.getAttribute('href')).toBe('/es/auth/entrar?mode=signup&next=%2Fes%2Fx');
      expect(link.textContent).toBe('Crear cuenta');
    });
  });

  describe('icon by outcome (owner review: must never show the check on a "retry" outcome)', () => {
    it('shows the success check, in the success color, for "perfect"', () => {
      render(<GameResult lang="es" correct={3} total={3} onPlayAgain={() => {}} />);
      const icon = screen.getByTestId('game-result-icon');
      expect(icon.getAttribute('class')).toContain('text-success-strong');
    });

    it('shows the success check, in the success color, for "good"', () => {
      render(<GameResult lang="es" correct={7} total={10} onPlayAgain={() => {}} />);
      const icon = screen.getByTestId('game-result-icon');
      expect(icon.getAttribute('class')).toContain('text-success-strong');
    });

    it('shows a neutral, non-success icon for "retry" — never the green check', () => {
      render(<GameResult lang="es" correct={2} total={10} onPlayAgain={() => {}} />);
      const icon = screen.getByTestId('game-result-icon');
      expect(icon.getAttribute('class')).not.toContain('text-success-strong');
      expect(icon.getAttribute('class')).toContain('text-foreground/60');
    });
  });

  describe('secondary action contrast (owner review: light yellow on white fails 4.5:1)', () => {
    it('never renders a secondary action with the plain `text-primary` link color', () => {
      render(
        <GameResult
          lang="es"
          correct={2}
          total={3}
          nextHref="/es/ingles/actividades"
          onPlayAgain={() => {}}
          onReviewWrong={() => {}}
        />,
      );
      for (const testId of ['game-result-review', 'game-result-play-again']) {
        const className = screen.getByTestId(testId).getAttribute('class') ?? '';
        expect(className).not.toContain('text-primary');
        expect(className).toContain('text-accent-ink');
      }
    });
  });

  describe('accessibility', () => {
    it('exposes the result region as a polite live status', () => {
      render(<GameResult lang="es" correct={3} total={3} onPlayAgain={() => {}} />);
      const region = screen.getByTestId('game-result');
      expect(region.getAttribute('role')).toBe('status');
      expect(region.getAttribute('aria-live')).toBe('polite');
    });

    it('gives every action a real button/link at least 44px tall', () => {
      render(
        <GameResult
          lang="es"
          correct={2}
          total={3}
          nextHref="/es/ingles/actividades"
          onPlayAgain={() => {}}
          onReviewWrong={() => {}}
        />,
      );
      for (const testId of ['game-result-next', 'game-result-play-again', 'game-result-review']) {
        const el = screen.getByTestId(testId);
        expect(['A', 'BUTTON']).toContain(el.tagName);
        expect(el.className).toContain('min-h-11');
      }
    });
  });
});
