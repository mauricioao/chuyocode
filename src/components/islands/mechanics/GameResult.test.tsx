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

  describe('time line (worksheet result overlay)', () => {
    it('renders no time line when `elapsedMs` is omitted', () => {
      render(<GameResult lang="es" correct={3} total={3} onPlayAgain={() => {}} />);
      expect(screen.queryByTestId('game-result-time')).toBeNull();
    });

    it('renders the formatted elapsed time when given', () => {
      render(<GameResult lang="es" correct={3} total={3} onPlayAgain={() => {}} elapsedMs={83_000} />);
      expect(screen.getByTestId('game-result-time').textContent).toBe('Tiempo: 1 min 23 s');
    });

    it('renders the English label for lang="en"', () => {
      render(<GameResult lang="en" correct={3} total={3} onPlayAgain={() => {}} elapsedMs={45_000} />);
      expect(screen.getByTestId('game-result-time').textContent).toBe('Time: 45 s');
    });
  });

  describe('secondaryAction (generic extra action — e.g. the worksheet overlay\'s own "Revisar respuestas")', () => {
    it('renders no secondary row at all when omitted, and no `nextHref`/`onReviewWrong` either', () => {
      render(<GameResult lang="es" correct={3} total={3} onPlayAgain={() => {}} />);
      expect(screen.queryByTestId('game-result-secondary-action')).toBeNull();
    });

    it('renders it, alone, in the secondary row when the primary is already "Jugar de nuevo"', () => {
      const onClick = vi.fn();
      render(
        <GameResult
          lang="es"
          correct={3}
          total={3}
          onPlayAgain={() => {}}
          secondaryAction={{ label: 'Revisar respuestas', onClick }}
        />,
      );
      const button = screen.getByTestId('game-result-secondary-action');
      expect(button.textContent).toBe('Revisar respuestas');
      fireEvent.click(button);
      expect(onClick).toHaveBeenCalledOnce();
    });

    it('renders after "Jugar de nuevo" when `nextHref` is also given', () => {
      render(
        <GameResult
          lang="es"
          correct={3}
          total={3}
          nextHref="/es/ingles/actividades?nivel=a1"
          onPlayAgain={() => {}}
          secondaryAction={{ label: 'Revisar respuestas', onClick: () => {} }}
        />,
      );
      const playAgain = screen.getByTestId('game-result-play-again');
      const secondary = screen.getByTestId('game-result-secondary-action');
      // Same row, in DOM order — "Jugar de nuevo" before "Revisar respuestas".
      expect(playAgain.compareDocumentPosition(secondary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('renders before the guest invite line (actions first, guest line last)', () => {
      render(
        <GameResult
          lang="es"
          correct={3}
          total={3}
          onPlayAgain={() => {}}
          secondaryAction={{ label: 'Revisar respuestas', onClick: () => {} }}
          guest={{ signUpHref: '/es/auth/entrar?mode=signup&next=%2Fes%2Fx' }}
        />,
      );
      const secondary = screen.getByTestId('game-result-secondary-action');
      const guestBanner = screen.getByTestId('game-result-guest-banner');
      expect(secondary.compareDocumentPosition(guestBanner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

  describe('Vanina reaction by outcome (visual-polish pass: must never show the wrong reaction)', () => {
    it('shows "celebra" for "perfect"', () => {
      render(<GameResult lang="es" correct={3} total={3} onPlayAgain={() => {}} />);
      const icon = screen.getByTestId('game-result-icon');
      expect(icon.getAttribute('data-outcome-pose')).toBe('vanina/celebra');
    });

    // UI round 2 (owner feedback, 2026-10-12): the pose must match the
    // outcome's OWN headline, not just its score tier — "casi" (hand on
    // head, oops face) under "¡Muy bien!" contradicted the text.
    it('shows "pulgar-arriba" for "good" ("¡Muy bien!")', () => {
      render(<GameResult lang="es" correct={7} total={10} onPlayAgain={() => {}} />);
      const icon = screen.getByTestId('game-result-icon');
      expect(icon.getAttribute('data-outcome-pose')).toBe('vanina/pulgar-arriba');
    });

    it('shows "casi" for "retry" ("¡Casi! Sigue practicando") — never a celebratory pose', () => {
      render(<GameResult lang="es" correct={2} total={10} onPlayAgain={() => {}} />);
      const icon = screen.getByTestId('game-result-icon');
      expect(icon.getAttribute('data-outcome-pose')).toBe('vanina/casi');
    });

    it('is decorative only (empty alt, aria-hidden) — the outcome already carries in the headline and data-outcome', () => {
      render(<GameResult lang="es" correct={3} total={3} onPlayAgain={() => {}} />);
      const img = screen.getByTestId('game-result-icon').querySelector('img')!;
      expect(img.getAttribute('alt')).toBe('');
      expect(img.getAttribute('aria-hidden')).toBe('true');
    });

    // UI round 2 (owner feedback, 2026-10-12): an `object-cover` box cropped
    // the full-body "celebra" pose's own hands/feet, which read as a
    // mistake. Character images are never shrunk/cropped to fit a box here
    // — a fixed HEIGHT per breakpoint with `width: auto` keeps the whole
    // silhouette at the master's own aspect ratio (`object-cover` stays
    // reserved for a fixed-shape frame that is part of the design, like
    // `DeskHelper.astro`'s own circular avatar — not this free-standing
    // figure).
    it('keeps its natural aspect ratio (fixed height, width auto, never cropped/letterboxed)', () => {
      render(<GameResult lang="es" correct={3} total={3} onPlayAgain={() => {}} />);
      const img = screen.getByTestId('game-result-icon').querySelector('img')!;
      expect(img.className).toMatch(/\bh-44\b/);
      expect(img.className).toMatch(/\bw-auto\b/);
      expect(img.className).toMatch(/max-\[400px\]:h-36/);
      expect(img.className).not.toMatch(/\bobject-cover\b/);
      expect(img.className).not.toMatch(/\bobject-contain\b/);
    });
  });

  describe('secondary action contrast (owner review: light yellow on white fails 4.5:1)', () => {
    it('relies on the shared Button link variant\'s own ingles:text-accent-ink override — no local color override left here (UI round 2)', () => {
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
        // The fix now lives in `button.tsx`'s own `link` variant (scoped to
        // the `ingles` theme via the `ingles:` variant) — these buttons no
        // longer need their own local `text-accent-ink` override.
        expect(className).toContain('ingles:text-accent-ink');
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
