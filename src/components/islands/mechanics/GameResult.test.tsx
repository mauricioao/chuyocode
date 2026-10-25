// @vitest-environment jsdom
/**
 * GameResult tests — the outcome classification, which actions render for
 * which combination of props, and the behavior of each action. The four
 * drag templates' own test files cover the WIRING into this component
 * (score computation, "Repasar las que fallé" actually resuming play); this
 * file owns the component's own contract in isolation.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import GameResult, { OUTCOME_POSE } from './GameResult';
import { GAME_RESULT_OUTCOME_POSES, characterPoseFraming } from '@/content/characterPoses';

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

    // Bugfix (owner report): inside a desk window, clicking "Otra actividad"
    // left the finished activity window open behind the newly-opened
    // community window. `data-desk-open-window="replace"` is the embedded
    // opener's own marker (`deskWindow.ts#initDeskOpenWindowLinks`) — it asks
    // the host to open/focus the community window AND close this one.
    // Outside a desk window the attribute is inert (`initDeskOpenWindowLinks`
    // only ever acts in embedded mode), so this stays a plain link there.
    it('marks "Otra actividad" with data-desk-open-window="replace" so the host also closes this window', () => {
      render(
        <GameResult lang="es" correct={3} total={3} nextHref="/es/ingles/actividades?nivel=a1" onPlayAgain={() => {}} />,
      );
      const next = screen.getByTestId('game-result-next');
      expect(next.getAttribute('data-desk-open-window')).toBe('replace');
    });

    // Owner audit (`PROPUESTA-PLANTILLAS-2026-10-23.md` §c): the template
    // editor's own preview has no real next activity to go to, but must
    // still show the REAL result screen — `nextHrefInert` keeps "Otra
    // actividad" visibly present, just never navigating.
    it('keeps "Otra actividad" visible but inert when `nextHrefInert` is set', () => {
      render(
        <GameResult
          lang="es"
          correct={3}
          total={3}
          nextHref="/es/ingles/actividades?nivel=a1"
          nextHrefInert
          onPlayAgain={() => {}}
        />,
      );
      const next = screen.getByTestId('game-result-next');
      expect(next.textContent).toBe('Otra actividad');
      const event = fireEvent.click(next);
      // `fireEvent.click` returns `false` when a handler called `preventDefault()`.
      expect(event).toBe(false);
    });

    it('leaves "Otra actividad" a normal navigation when `nextHrefInert` is omitted', () => {
      render(
        <GameResult lang="es" correct={3} total={3} nextHref="/es/ingles/actividades?nivel=a1" onPlayAgain={() => {}} />,
      );
      const event = fireEvent.click(screen.getByTestId('game-result-next'));
      expect(event).toBe(true);
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
    // figure). Vanina pop-in pass: she is now a bit LARGER (h-64, half
    // visible once cropped by the edge — see the "edge-anchored" describe
    // below) than the old h-44 centred figure.
    it('keeps its natural aspect ratio (width auto, never cropped/letterboxed/squashed)', () => {
      render(<GameResult lang="es" correct={3} total={3} onPlayAgain={() => {}} />);
      const img = screen.getByTestId('game-result-icon').querySelector('img')!;
      expect(img.className).toMatch(/\bw-auto\b/);
      expect(img.className).not.toMatch(/\bobject-cover\b/);
      expect(img.className).not.toMatch(/\bobject-contain\b/);
    });
  });

  // "Equal head size" sizing (owner follow-up bugfix: her size when you do
  // well must be the SAME as when you lose — the original "abdomen up"
  // formula this replaces cropped at the abdomen, but that inflated
  // `pulgar-arriba`'s whole image, head included, ~25% bigger than the
  // other two outcomes, since that master's own abdomen is an extrapolated
  // guess with no real feature behind it). Replaces the old flat
  // `h-64`/`md:h-80`/`lg:h-[28rem]` box: the actual height now comes from
  // `.game-result-vanina`'s own formula in `global.css` (`--vanina-head`
  // per breakpoint, divided by this pose's own `--pose-chin - --pose-head`)
  // — this component's only job is wiring the right per-pose fractions onto
  // the element as inline custom properties, which is what these tests
  // actually exercise (the CSS math itself is verified against real
  // screenshots, not jsdom).
  describe('Vanina — per-pose "equal head size" sizing (owner spec: same apparent size for every outcome)', () => {
    it.each([
      ['perfect', 3, 3, 'vanina/celebra'],
      ['good', 7, 10, 'vanina/pulgar-arriba'],
      ['retry', 2, 10, 'vanina/casi'],
    ] as const)('sets --pose-head/--pose-chin/--pose-abdomen inline for the "%s" outcome, matching %s\'s own registry framing', (_outcome, correct, total, poseKey) => {
      render(<GameResult lang="es" correct={correct} total={total} onPlayAgain={() => {}} />);
      const icon = screen.getByTestId('game-result-icon');
      const framing = characterPoseFraming(poseKey);
      expect(icon.style.getPropertyValue('--pose-head')).toBe(String(framing.headTop));
      expect(icon.style.getPropertyValue('--pose-chin')).toBe(String(framing.chin));
      expect(icon.style.getPropertyValue('--pose-abdomen')).toBe(String(framing.abdomen));
    });

    it('uses the SAME sizing class (and so the same CSS formula) for all 3 outcome poses — only the inline fractions differ', () => {
      for (const [correct, total] of [
        [3, 3],
        [7, 10],
        [2, 10],
      ] as const) {
        const { unmount } = render(<GameResult lang="es" correct={correct} total={total} onPlayAgain={() => {}} />);
        expect(screen.getByTestId('game-result-icon').className).toMatch(/\bgame-result-vanina\b/);
        unmount();
      }
    });
  });

  // Vanina pop-in pass (owner spec: "Vanina sale desde abajo a la izquierda
  // de la ventana... la mitad de la imagen visible", "como el Toasty de
  // Mortal Kombat, pero desde el borde inferior... se queda"): she moves
  // OUT of the centred results column and anchors to the result area's own
  // bottom-left edge, half-cropped by its `overflow-hidden`. The centred
  // column (`game-result-content`) now holds only the headline/score/
  // buttons — nothing new exported, `GameResultProps` stays unchanged.
  describe('Vanina — edge-anchored pop-in (owner spec: peeking from the bottom-left edge, half visible, stays)', () => {
    it('renders Vanina OUTSIDE the centred results column, anchored to the result area itself', () => {
      render(<GameResult lang="es" correct={3} total={3} onPlayAgain={() => {}} />);
      const root = screen.getByTestId('game-result');
      const content = screen.getByTestId('game-result-content');
      const icon = screen.getByTestId('game-result-icon');
      expect(root.contains(content)).toBe(true);
      expect(content.contains(icon)).toBe(false);
      expect(root.contains(icon)).toBe(true);
    });

    it('anchors to the bottom-left edge, absolutely positioned, half-cropped by the root\'s own overflow-hidden', () => {
      render(<GameResult lang="es" correct={3} total={3} onPlayAgain={() => {}} />);
      const root = screen.getByTestId('game-result');
      const icon = screen.getByTestId('game-result-icon');
      expect(root.className).toMatch(/\brelative\b/);
      expect(root.className).toMatch(/\boverflow-hidden\b/);
      expect(icon.className).toMatch(/\babsolute\b/);
      expect(icon.className).toMatch(/\bbottom-0\b/);
      expect(icon.className).toMatch(/\bleft-/);
    });

    // Bugfix (owner report: her crop line sat ~12px above the window's
    // actual bottom edge, not flush with it): `bottom-0` on the Vanina
    // `<picture>` anchors flush with THIS root's own bottom edge, but every
    // host renders this component inside the SAME known stage wrapper
    // (`ActivityPracticeIsland`'s own `overflow-y-auto p-3` quiz-tab
    // container), whose `p-3` kept the root's own bottom edge 12px short of
    // the window. `-mb-3` bleeds the root past exactly that padding.
    it('bleeds the root past the stage wrapper\'s own bottom padding so Vanina crops flush with the window edge', () => {
      render(<GameResult lang="es" correct={3} total={3} onPlayAgain={() => {}} />);
      const root = screen.getByTestId('game-result');
      expect(root.className).toMatch(/-mb-3\b/);
    });

    it('is still decorative only and keeps the right pose per outcome, now from the edge-anchored element', () => {
      render(<GameResult lang="es" correct={7} total={10} onPlayAgain={() => {}} />);
      const icon = screen.getByTestId('game-result-icon');
      expect(icon.getAttribute('data-outcome-pose')).toBe('vanina/pulgar-arriba');
      const img = icon.querySelector('img')!;
      expect(img.getAttribute('alt')).toBe('');
      expect(img.getAttribute('aria-hidden')).toBe('true');
    });
  });

  // Confetti burst (owner spec: "confetti que sale de los costados" timed to
  // Vanina's landing) — perfect/good only, never retry; a decorative,
  // aria-hidden layer the component owns itself (no new dependency).
  describe('confetti burst (perfect/good only, never retry)', () => {
    it('renders the confetti layer for a perfect outcome', () => {
      render(<GameResult lang="es" correct={3} total={3} onPlayAgain={() => {}} />);
      expect(screen.getByTestId('game-result-confetti')).toBeTruthy();
    });

    it('renders the confetti layer for a good outcome', () => {
      render(<GameResult lang="es" correct={7} total={10} onPlayAgain={() => {}} />);
      expect(screen.getByTestId('game-result-confetti')).toBeTruthy();
    });

    it('omits the confetti layer entirely for a retry outcome', () => {
      render(<GameResult lang="es" correct={2} total={10} onPlayAgain={() => {}} />);
      expect(screen.queryByTestId('game-result-confetti')).toBeNull();
    });

    it('is aria-hidden and never intercepts pointer events', () => {
      render(<GameResult lang="es" correct={3} total={3} onPlayAgain={() => {}} />);
      const confetti = screen.getByTestId('game-result-confetti');
      expect(confetti.getAttribute('aria-hidden')).toBe('true');
      expect(confetti.className).toMatch(/\bpointer-events-none\b/);
    });

    it('renders a non-trivial number of individual pieces', () => {
      render(<GameResult lang="es" correct={3} total={3} onPlayAgain={() => {}} />);
      const confetti = screen.getByTestId('game-result-confetti');
      // ~18-24 pieces per side (owner spec) — just a floor, not an exact count.
      expect(confetti.children.length).toBeGreaterThanOrEqual(30);
    });

    // Bugfix (owner report: the burst reads as two static coloured columns
    // at the edges, not a burst): `--confetti-dx`/`--confetti-dy` used to be
    // plain `%`, which `translate()` resolves against the TRANSLATED
    // element's own box — an 8px piece — so every piece only ever moved a
    // few px. They must be container-relative length units (`cqw`/`cqh`,
    // resolving against `.game-result-confetti`'s own `container-type: size`
    // box in `global.css`) so the burst actually travels across the stage.
    it('expresses each piece\'s travel as cqw/cqh length units, never %', () => {
      render(<GameResult lang="es" correct={3} total={3} onPlayAgain={() => {}} />);
      const pieces = Array.from(screen.getByTestId('game-result-confetti').children) as HTMLElement[];
      expect(pieces.length).toBeGreaterThan(0);
      for (const piece of pieces) {
        const dx = piece.style.getPropertyValue('--confetti-dx');
        const dy = piece.style.getPropertyValue('--confetti-dy');
        expect(dx).toMatch(/^-?\d+(\.\d+)?cqw$/);
        expect(dy).toMatch(/^-\d+(\.\d+)?cqh$/);
      }
    });

    it('keeps each piece\'s travel within the owner-specified range (15-40% of the stage width inward, 20-60% upward)', () => {
      render(<GameResult lang="es" correct={3} total={3} onPlayAgain={() => {}} />);
      const pieces = Array.from(screen.getByTestId('game-result-confetti').children) as HTMLElement[];
      for (const piece of pieces) {
        const dx = Math.abs(parseFloat(piece.style.getPropertyValue('--confetti-dx')));
        const dy = Math.abs(parseFloat(piece.style.getPropertyValue('--confetti-dy')));
        expect(dx).toBeGreaterThanOrEqual(15);
        expect(dx).toBeLessThanOrEqual(40);
        expect(dy).toBeGreaterThanOrEqual(20);
        expect(dy).toBeLessThanOrEqual(60);
      }
    });

    // Owner spec: pieces shoot from each side edge INWARD — left pieces
    // travel right, right pieces travel left (`buildConfettiPieces` renders
    // every left piece before any right piece, so the first half/second
    // half split matches `confettiPieceStyle`'s own `side` argument).
    it('shoots left-edge pieces inward (positive dx) and right-edge pieces inward (negative dx)', () => {
      render(<GameResult lang="es" correct={3} total={3} onPlayAgain={() => {}} />);
      const pieces = Array.from(screen.getByTestId('game-result-confetti').children) as HTMLElement[];
      const half = pieces.length / 2;
      for (const piece of pieces.slice(0, half)) {
        expect(parseFloat(piece.style.getPropertyValue('--confetti-dx'))).toBeGreaterThan(0);
      }
      for (const piece of pieces.slice(half)) {
        expect(parseFloat(piece.style.getPropertyValue('--confetti-dx'))).toBeLessThan(0);
      }
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

  // Dialog placement bugfix (owner report, production screenshot: inside
  // the worksheet result dialog, Vanina came out blurred/pixelated by the
  // backdrop blur AND clipped/hidden behind the result text by the small
  // card). `characterPlacement="portal"` moves Vanina (and confetti) OUT of
  // this component's own DOM subtree via `createPortal`, so a host that
  // renders `GameResult` inside a small Dialog card can keep her above its
  // blurred backdrop and outside its clipped bounds.
  describe('characterPlacement (dialog placement bugfix)', () => {
    it('defaults to "inline" (every non-dialog host) when the prop is omitted — no portal at all', () => {
      render(<GameResult lang="es" correct={3} total={3} onPlayAgain={() => {}} />);
      expect(screen.queryByTestId('game-result-character-portal')).toBeNull();
      // Unchanged from the existing "edge-anchored" contract above: Vanina
      // stays INSIDE this component's own root.
      const root = screen.getByTestId('game-result');
      const icon = screen.getByTestId('game-result-icon');
      expect(root.contains(icon)).toBe(true);
    });

    it('"inline" explicitly behaves exactly like the default (no regression for an explicit value)', () => {
      render(<GameResult lang="es" correct={3} total={3} onPlayAgain={() => {}} characterPlacement="inline" />);
      expect(screen.queryByTestId('game-result-character-portal')).toBeNull();
      const root = screen.getByTestId('game-result');
      const icon = screen.getByTestId('game-result-icon');
      expect(root.contains(icon)).toBe(true);
    });

    it('"portal" renders Vanina OUTSIDE this component\'s own root, via a portal — not a descendant of the result region at all', () => {
      render(<GameResult lang="es" correct={3} total={3} onPlayAgain={() => {}} characterPlacement="portal" />);
      const root = screen.getByTestId('game-result');
      const icon = screen.getByTestId('game-result-icon');
      expect(root.contains(icon)).toBe(false);
      // Still present in the document — just portaled elsewhere (document.body by default).
      expect(document.body.contains(icon)).toBe(true);
    });

    it('"portal" also moves the confetti burst out of this component\'s own root (perfect/good only)', () => {
      render(<GameResult lang="es" correct={3} total={3} onPlayAgain={() => {}} characterPlacement="portal" />);
      const root = screen.getByTestId('game-result');
      const confetti = screen.getByTestId('game-result-confetti');
      expect(root.contains(confetti)).toBe(false);
      expect(document.body.contains(confetti)).toBe(true);
    });

    it('"portal" still omits confetti for a retry outcome, same as inline', () => {
      render(<GameResult lang="es" correct={2} total={10} onPlayAgain={() => {}} characterPlacement="portal" />);
      expect(screen.queryByTestId('game-result-confetti')).toBeNull();
    });

    it('"portal" portals into document.body by default, fixed to the viewport, above a dialog\'s z-50 overlay/content', () => {
      render(<GameResult lang="es" correct={3} total={3} onPlayAgain={() => {}} characterPlacement="portal" />);
      const portalBox = screen.getByTestId('game-result-character-portal');
      expect(portalBox.parentElement).toBe(document.body);
      expect(portalBox.className).toMatch(/\bfixed\b/);
      expect(portalBox.className).toMatch(/\binset-0\b/);
      expect(portalBox.className).toMatch(/z-\[60\]/);
      expect(portalBox.getAttribute('aria-hidden')).toBe('true');
      expect(portalBox.className).toMatch(/\bpointer-events-none\b/);
    });

    it('"portal" keeps Vanina\'s own bottom-left edge anchoring and pose/accessibility contract unchanged', () => {
      render(<GameResult lang="es" correct={7} total={10} onPlayAgain={() => {}} characterPlacement="portal" />);
      const icon = screen.getByTestId('game-result-icon');
      expect(icon.getAttribute('data-outcome-pose')).toBe('vanina/pulgar-arriba');
      expect(icon.className).toMatch(/\babsolute\b/);
      expect(icon.className).toMatch(/\bbottom-0\b/);
      expect(icon.className).toMatch(/\bleft-/);
      const img = icon.querySelector('img')!;
      expect(img.getAttribute('alt')).toBe('');
      expect(img.getAttribute('aria-hidden')).toBe('true');
    });

    it('"portal" portals into a given characterPortalContainer instead of document.body when supplied', () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      render(
        <GameResult
          lang="es"
          correct={3}
          total={3}
          onPlayAgain={() => {}}
          characterPlacement="portal"
          characterPortalContainer={container}
        />,
      );
      const portalBox = screen.getByTestId('game-result-character-portal');
      expect(portalBox.parentElement).toBe(container);
      container.remove();
    });

    it('"portal" leaves the centred results column (headline/score/buttons) right where it always was, inside this component\'s own root', () => {
      render(<GameResult lang="es" correct={3} total={3} onPlayAgain={() => {}} characterPlacement="portal" />);
      const root = screen.getByTestId('game-result');
      const content = screen.getByTestId('game-result-content');
      expect(root.contains(content)).toBe(true);
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

// Vanina pop-in, gated on real decode (bugfix; owner report: "aparece de
// golpe" — she appears abruptly; verified diagnosis: her CSS entrance used
// to start unconditionally on mount, but the pose `<img>` only became
// paintable ~180ms later on a good connection (much later on a slow one),
// so the entrance had already finished playing before there was anything
// to actually see rise). `data-ready="true"` on the SAME `<picture>` is the
// hook `global.css` keys the entrance (and the confetti burst) off.
describe('Vanina gated on real decode (data-ready)', () => {
  it('never carries data-ready on mount — nothing has confirmed the pose is actually paintable yet', () => {
    render(<GameResult lang="es" correct={3} total={3} onPlayAgain={() => {}} />);
    expect(screen.getByTestId('game-result-icon').getAttribute('data-ready')).toBeNull();
  });

  it('flips data-ready to "true" immediately when the image is already complete (e.g. warmed by preloadCharacterPoses)', async () => {
    const complete = vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    try {
      render(<GameResult lang="es" correct={3} total={3} onPlayAgain={() => {}} />);
      await waitFor(() => expect(screen.getByTestId('game-result-icon').getAttribute('data-ready')).toBe('true'));
    } finally {
      complete.mockRestore();
    }
  });

  it('flips data-ready to "true" once img.decode() resolves', async () => {
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: () => Promise.resolve(),
    });
    try {
      render(<GameResult lang="es" correct={3} total={3} onPlayAgain={() => {}} />);
      await waitFor(() => expect(screen.getByTestId('game-result-icon').getAttribute('data-ready')).toBe('true'));
    } finally {
      delete (HTMLImageElement.prototype as { decode?: unknown }).decode;
    }
  });

  it('still flips data-ready to "true" when img.decode() rejects (catch errors -> still ready)', async () => {
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: () => Promise.reject(new Error('decode failed')),
    });
    try {
      render(<GameResult lang="es" correct={3} total={3} onPlayAgain={() => {}} />);
      await waitFor(() => expect(screen.getByTestId('game-result-icon').getAttribute('data-ready')).toBe('true'));
    } finally {
      delete (HTMLImageElement.prototype as { decode?: unknown }).decode;
    }
  });

  it('falls back to ready after a fixed short delay if decode never settles at all (network-stall safety net)', () => {
    vi.useFakeTimers();
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: () => new Promise<void>(() => {}),
    });
    try {
      render(<GameResult lang="es" correct={3} total={3} onPlayAgain={() => {}} />);
      const icon = screen.getByTestId('game-result-icon');
      expect(icon.getAttribute('data-ready')).toBeNull();
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(icon.getAttribute('data-ready')).toBe('true');
    } finally {
      delete (HTMLImageElement.prototype as { decode?: unknown }).decode;
      vi.useRealTimers();
    }
  });

  it('exports OUTCOME_POSE matching characterPoses\' own GAME_RESULT_OUTCOME_POSES list (preload drift guard)', () => {
    expect(new Set(Object.values(OUTCOME_POSE))).toEqual(new Set(GAME_RESULT_OUTCOME_POSES));
  });
});

// Confetti burst, two-phase (owner spec: "deben tener una animacion curva en
// el tiempo simulando la explosion inicial de tirar chispas, y luego la
// caida lenta de los 'papelitos'") — timed to start WITH Vanina's own
// entrance (same data-ready gate), each piece split into an outer (macro
// motion: burst then fall) and inner (continuous paper-flutter) element.
describe('confetti burst timed with Vanina + two-phase motion', () => {
  it('mirrors the same data-ready gate on the confetti layer as on Vanina\'s own picture', () => {
    render(<GameResult lang="es" correct={3} total={3} onPlayAgain={() => {}} />);
    const confetti = screen.getByTestId('game-result-confetti');
    const icon = screen.getByTestId('game-result-icon');
    expect(confetti.getAttribute('data-ready')).toBeNull();
    expect(confetti.getAttribute('data-ready')).toBe(icon.getAttribute('data-ready'));
  });

  it('flips the confetti layer\'s own data-ready once the pose image is ready, same as Vanina', async () => {
    const complete = vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    try {
      render(<GameResult lang="es" correct={3} total={3} onPlayAgain={() => {}} />);
      await waitFor(() => expect(screen.getByTestId('game-result-confetti').getAttribute('data-ready')).toBe('true'));
    } finally {
      complete.mockRestore();
    }
  });

  it('wraps every piece in an outer (motion) element carrying exactly one inner (paper flutter) child', () => {
    render(<GameResult lang="es" correct={3} total={3} onPlayAgain={() => {}} />);
    const pieces = Array.from(screen.getByTestId('game-result-confetti').children) as HTMLElement[];
    expect(pieces.length).toBeGreaterThan(0);
    for (const piece of pieces) {
      expect(piece.children).toHaveLength(1);
      expect(piece.children[0]!.className).toContain('game-result-confetti-piece-inner');
    }
  });

  it('carries the slow-fall phase as its own cqw/cqh custom properties, distinct from the burst (--confetti-dx/dy)', () => {
    render(<GameResult lang="es" correct={3} total={3} onPlayAgain={() => {}} />);
    const pieces = Array.from(screen.getByTestId('game-result-confetti').children) as HTMLElement[];
    expect(pieces.length).toBeGreaterThan(0);
    for (const piece of pieces) {
      expect(piece.style.getPropertyValue('--confetti-fall-dx')).toMatch(/^-?\d+(\.\d+)?cqw$/);
      expect(piece.style.getPropertyValue('--confetti-fall-dy')).toMatch(/^-?\d+(\.\d+)?cqh$/);
      expect(piece.style.getPropertyValue('--confetti-sway-dx')).toMatch(/^-?\d+(\.\d+)?cqw$/);
      expect(piece.style.getPropertyValue('--confetti-sway-dy')).toMatch(/^-?\d+(\.\d+)?cqh$/);
    }
  });
});
