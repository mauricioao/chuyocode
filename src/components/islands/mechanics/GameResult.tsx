/**
 * GameResult — the ONE shared end-of-round screen for every self-checking
 * drag template (`QuizMatching`/`QuizReorder`/`QuizCloze`/`QuizGroupSort`),
 * replacing each one's own "N de N" + "Reintentar" dead end (UX audit F2,
 * `UX-INGLES.md` 6.3, build item N1). Structure, states and copy are owned
 * here; every color/shadow/radius comes straight from the UI kit's existing
 * tokens/classes (`Button`, `text-success-strong`, …) — nothing new.
 *
 * OUTCOME BY SCORE, not a fixed "well done": all correct -> "¡Perfecto!";
 * at least 70% -> "¡Muy bien!"; otherwise -> "¡Casi! Sigue practicando".
 * `data-outcome` carries this (`perfect`/`good`/`retry`) so a later pass can
 * hook a character's reaction to it (Vanina) — this component does not
 * render any character itself.
 *
 * ONE PRIMARY ACTION: "Otra actividad" (a real link to `nextHref`) when the
 * host supplies one — only the practice page does, pointed at the community
 * catalog filtered by this activity's own level; otherwise "Jugar de nuevo"
 * IS the primary action. The editor preview and any other host pass neither
 * `nextHref` nor `guest`, so they only ever see the one "Jugar de nuevo"
 * button.
 *
 * "Repasar las que fallé" is the HOST's call, not this component's: it only
 * renders when `onReviewWrong` is actually supplied AND the round ended
 * with mistakes (`correct < total`) — a mechanic that cannot end with
 * mistakes (every one of the other three self-checking games only ever
 * reaches "done" at 100%, unlike `QuizMatching`'s single-shot check) never
 * passes a handler, so the button never renders there regardless of score.
 *
 * GUEST INVITE: the host passes `guest` only on the practice page, for an
 * anonymous visitor — this is also where the OLD page-top guest banner now
 * lives (UX-INGLES.md 6.3: "El aviso de invitado sale de la parte de arriba
 * y pasa a la pantalla final").
 *
 * VANINA REACTS TO THE OUTCOME (visual-polish pass, owner-approved cast
 * split, DIRECCION-VISUAL.md §4.2 "reacciona a Comprobar" — replacing the
 * generic colored check/retry icon this doc comment used to describe here):
 * `perfect` (all correct) -> `celebra`; `good` (≥70%) -> `casi`; `retry`
 * (<70%, including a first attempt that failed outright) -> `animo`. Pure
 * black-ink line art (DIRECCION-VISUAL.md §4.1), decorative only — `alt=""`
 * + `aria-hidden`, the outcome is already carried in the headline text and
 * `data-outcome` for anything that needs it programmatically.
 *
 * SECONDARY ACTIONS JUST USE `variant="link"` (UI round 2): it used to
 * resolve to `text-primary`, light yellow in the `ingles` theme and
 * unreadable on the white stage (fails the kit's 4.5:1 rule,
 * `DIRECCION-VISUAL.md` 3.1) — these two buttons locally overrode the
 * color with `text-accent-ink` to work around it. The shared `Button`'s
 * `link` variant itself now renders `text-accent-ink` inside the `ingles`
 * theme (`button.tsx`), so that local override is redundant and gone; the
 * guest "Crear cuenta" link below keeps its own explicit `text-accent-ink`
 * since it is a plain `<a>`, not a `Button`.
 */
import type { CSSProperties } from 'react';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { formatElapsedTime } from '@/lib/formatElapsedTime';
import { Button } from '@/components/ui/button';
import { characterPoseFallbackSrc, characterPoseSrcSet, characterPoseWidth, type CharacterPoseKey } from '@/content/characterPoses';

export type GameResultOutcome = 'perfect' | 'good' | 'retry';

export interface GameResultGuestInvite {
  /** Same destination the old top banner used — `/{lang}/auth/entrar?mode=signup&next=<current path>`. */
  signUpHref: string;
}

/**
 * One extra `variant="link"` action in the SAME row as "Jugar de nuevo"/
 * "Repasar las que fallé" — e.g. the worksheet result overlay's own
 * "Revisar respuestas" (closes the dialog so the marked sheet is visible).
 * A generic slot rather than a worksheet-specific prop: any future host can
 * reuse it for its own one extra action, without `GameResult` knowing what
 * it does.
 */
export interface GameResultSecondaryAction {
  label: string;
  onClick: () => void;
}

export interface GameResultProps {
  lang: Lang;
  correct: number;
  total: number;
  /** This template's own wording for "correct"/"placed" (e.g. "correctas" vs "bien ubicados") — falls back to the shared word when omitted. */
  resultWord?: string;
  onPlayAgain: () => void;
  /** Only ever rendered when the round ended with mistakes (`correct < total`) — omit entirely for a mechanic that cannot end that way. */
  onReviewWrong?: () => void;
  /** Set only by the practice page — the community catalog filtered by this activity's level. */
  nextHref?: string;
  /** Set only by the practice page, for an anonymous visitor. */
  guest?: GameResultGuestInvite;
  /**
   * How long this attempt took, in milliseconds (worksheet result overlay,
   * owner bug report: "con todos los indicadores de cuanto tiempo
   * tardaste") — renders as a "Tiempo: 1 min 23 s" line via the pure
   * `formatElapsedTime`. Omitted entirely (every caller before this one)
   * renders no time line at all.
   */
  elapsedMs?: number;
  /** One extra secondary action, rendered in the same row as "Jugar de nuevo"/"Repasar las que fallé" — see {@link GameResultSecondaryAction}. */
  secondaryAction?: GameResultSecondaryAction;
  className?: string;
}

/** All correct -> "perfect"; at least 70% -> "good"; otherwise -> "retry" (owner spec, build item N1). */
function outcomeFor(correct: number, total: number): GameResultOutcome {
  if (total <= 0 || correct >= total) return 'perfect';
  return correct / total >= 0.7 ? 'good' : 'retry';
}

/**
 * Vanina's own reaction pose per outcome tier — must match each outcome's
 * OWN headline, not just its score tier (owner feedback, UI round 2: "casi"
 * — hand on head, oops face — showed for "good"/"¡Muy bien!", contradicting
 * the text). `perfect` -> `celebra`; `good` ("¡Muy bien!") -> `pulgar-
 * arriba`; `retry` ("¡Casi! Sigue practicando") -> `casi`.
 */
const OUTCOME_POSE: Record<GameResultOutcome, CharacterPoseKey> = {
  perfect: 'vanina/celebra',
  good: 'vanina/pulgar-arriba',
  retry: 'vanina/casi',
};

/**
 * Confetti burst (visual-polish pass, owner spec: "confetti que sale de los
 * costados" timed to land as Vanina pops up) — `perfect`/`good` only, never
 * `retry` (a near-miss is not a celebration). Small pieces shooting from the
 * result area's own left/right edges, inward and up, then falling and
 * fading — pure CSS (`global.css`'s own `.game-result-confetti-piece`
 * keyframe), gated behind `prefers-reduced-motion: no-preference` there, no
 * new dependency.
 */
const CONFETTI_OUTCOMES: ReadonlySet<GameResultOutcome> = new Set(['perfect', 'good']);

/** ~20 pieces per side (owner spec: "≈18-24") — a floor, not an exact budget. */
const CONFETTI_PIECES_PER_SIDE = 20;

/** The 6-colour tray palette (`--color-tile-1..6`, `global.css`) — decorative accents, never the red/green pair reserved for ✓/✕ (`glass-desk-ui` skill). */
const CONFETTI_COLOR_VARS = [
  '--color-tile-1',
  '--color-tile-2',
  '--color-tile-3',
  '--color-tile-4',
  '--color-tile-5',
  '--color-tile-6',
] as const;

/**
 * Deterministic per-piece params, pure arithmetic over `index` — never
 * `Math.random()` at render, which would mismatch between the server- and
 * client-rendered markup and break hydration. Expressed as `--confetti-*`
 * custom properties the shared `.game-result-confetti-piece` keyframe reads
 * (same "set a custom property per instance, one shared keyframe" posture
 * `deskWindowManager.ts`'s own `--desk-window-manager-from` already uses).
 */
function confettiPieceStyle(index: number, side: 'left' | 'right'): CSSProperties {
  const travel = 55 + ((index * 17) % 45); // 55-99% — shoots inward, toward the centre.
  const rise = 55 + ((index * 23) % 70); // 55-124% upward.
  const rotate = (index % 2 === 0 ? 1 : -1) * (140 + ((index * 59) % 260));
  const duration = 1500 + ((index * 29) % 500); // 1.5-2s (owner spec).
  // Slight delay so the burst lands as Vanina pops up (owner spec), staggered per piece.
  const delay = 220 + (index % CONFETTI_PIECES_PER_SIDE) * 18;
  const bottom = 4 + ((index * 11) % 28); // 4-31% up the edge.
  const dx = side === 'left' ? travel : -travel;
  const colorVar = CONFETTI_COLOR_VARS[index % CONFETTI_COLOR_VARS.length];
  return {
    [side]: '2%',
    bottom: `${bottom}%`,
    backgroundColor: `var(${colorVar})`,
    '--confetti-dx': `${dx}%`,
    '--confetti-dy': `-${rise}%`,
    '--confetti-rotate': `${rotate}deg`,
    '--confetti-duration': `${duration}ms`,
    '--confetti-delay': `${delay}ms`,
  } as CSSProperties;
}

interface ConfettiPiece {
  id: string;
  style: CSSProperties;
}

function buildConfettiPieces(): ConfettiPiece[] {
  const pieces: ConfettiPiece[] = [];
  for (const side of ['left', 'right'] as const) {
    for (let i = 0; i < CONFETTI_PIECES_PER_SIDE; i += 1) {
      pieces.push({ id: `${side}-${i}`, style: confettiPieceStyle(i, side) });
    }
  }
  return pieces;
}

export default function GameResult({
  lang,
  correct,
  total,
  resultWord,
  onPlayAgain,
  onReviewWrong,
  nextHref,
  guest,
  elapsedMs,
  secondaryAction,
  className,
}: GameResultProps) {
  const t = UI_LABELS[lang].activities.gameResult;
  const outcome = outcomeFor(correct, total);
  const headline = outcome === 'perfect' ? t.perfect : outcome === 'good' ? t.good : t.retry;
  const word = resultWord ?? t.defaultWord;
  const showReview = correct < total && Boolean(onReviewWrong);
  const pose = OUTCOME_POSE[outcome];
  const showConfetti = CONFETTI_OUTCOMES.has(outcome);
  const confettiPieces = showConfetti ? buildConfettiPieces() : [];

  return (
    <div
      data-testid="game-result"
      data-outcome={outcome}
      role="status"
      aria-live="polite"
      className={cn(
        'relative flex flex-1 flex-col items-center justify-center gap-4 overflow-hidden py-10 text-center',
        className,
      )}
    >
      {/* Confetti burst — see `buildConfettiPieces`/`CONFETTI_OUTCOMES` own
          header above and `.game-result-confetti-piece`'s keyframe in
          `global.css`. Absolutely positioned over the WHOLE result area
          (not just the edge Vanina peeks from — the owner spec has it
          shoot from both sides), `aria-hidden` + `pointer-events-none`:
          purely decorative, never reachable/blocking. */}
      {showConfetti && (
        <div data-testid="game-result-confetti" aria-hidden="true" className="game-result-confetti pointer-events-none absolute inset-0 overflow-hidden">
          {confettiPieces.map((piece) => (
            <span key={piece.id} className="game-result-confetti-piece" style={piece.style} />
          ))}
        </div>
      )}
      {/* Vanina's reaction — "Toasty!"-style pop-in from the result area's
          OWN bottom-left edge (visual-polish pass, owner spec: "sale desde
          abajo a la izquierda... la mitad de la imagen visible... se
          queda", unlike Toasty she never leaves again). Anchored `absolute
          bottom-0`, then `translateY(50%)` (`.game-result-vanina`,
          `global.css`) pushes the bottom half past the root's own
          `overflow-hidden` edge — only the UPPER half stays visible, which
          is the crop the owner asked for, never a shrink (the "never
          shrink to fit" rule — `object-cover` stays reserved for a
          fixed-SHAPE frame like `DeskHelper.astro`'s own circular avatar;
          this is a free-standing figure, cropped by the edge, not
          squeezed). A fixed HEIGHT per breakpoint, `width: auto`, same
          "never letterbox or crop by shrinking" posture as before — just a
          bit LARGER now (h-64, half visible once cropped ≈ h-32) so the
          peek still reads at a glance. Decorative only: the outcome is
          already in the headline text below and in `data-outcome` above. */}
      <picture
        data-testid="game-result-icon"
        data-outcome-pose={pose}
        className="game-result-vanina pointer-events-none absolute bottom-0 left-4 z-10 block h-64 w-auto sm:left-6 max-[400px]:h-52"
      >
        <source type="image/avif" srcSet={characterPoseSrcSet(pose, 'avif')} />
        <source type="image/webp" srcSet={characterPoseSrcSet(pose, 'webp')} />
        <img
          src={characterPoseFallbackSrc(pose)}
          alt=""
          aria-hidden="true"
          width={characterPoseWidth(pose)}
          height={256}
          decoding="async"
          className="block h-64 w-auto max-[400px]:h-52"
        />
      </picture>
      {/* The centred results column — headline/score/buttons — now the
          ONLY thing in the middle (Vanina moved to the edge above). Same
          comfortable reading measure as before (owner feedback, UI round
          2: the success state read a bit narrow), plus enough bottom
          padding that her half-visible figure at bottom-left never
          overlaps "Otra actividad"/"Jugar de nuevo" at a narrow (360-390px)
          width. */}
      <div data-testid="game-result-content" className="relative z-20 flex w-full max-w-[30rem] flex-col items-center gap-4 pb-16 sm:pb-4">
        <h2 className="text-xl font-semibold text-foreground sm:text-2xl">{headline}</h2>
        <p data-testid="game-result-score" className="text-base text-foreground sm:text-lg">
          {correct} {t.of} {total} {word}
        </p>
        {typeof elapsedMs === 'number' && (
          <p data-testid="game-result-time" className="text-sm text-muted-foreground">
            {t.time}: {formatElapsedTime(elapsedMs)}
          </p>
        )}
        <div className="flex flex-col items-center gap-2">
          {nextHref ? (
            <Button asChild className="min-h-11">
              {/* "Otra actividad" bugfix (owner report): inside a desk
                  window, this used to be a plain in-iframe navigation —
                  the host's own click-race defensive net
                  (`deskWindowManager.ts`) then opened the community route
                  as a SEPARATE window and bounced this frame back onto its
                  own href, leaving the finished activity window open,
                  reloading, behind it. `data-desk-open-window="replace"`
                  is the embedded-side opener's own marker
                  (`@lib/ui/deskWindow.ts#initDeskOpenWindowLinks`): it asks
                  the host to open/focus the community window AND close
                  THIS one. Outside a desk window (standalone page, mobile,
                  guest) the attribute is inert — it stays the exact plain
                  link it always was. */}
              <a href={nextHref} data-testid="game-result-next" data-desk-open-window="replace">
                {t.nextActivity}
              </a>
            </Button>
          ) : (
            <Button type="button" data-testid="game-result-play-again" className="min-h-11" onClick={onPlayAgain}>
              {t.playAgain}
            </Button>
          )}
          {(showReview || nextHref || secondaryAction) && (
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
              {showReview && (
                <Button
                  type="button"
                  variant="link"
                  data-testid="game-result-review"
                  className="min-h-11 px-2"
                  onClick={onReviewWrong}
                >
                  {t.reviewWrong}
                </Button>
              )}
              {nextHref && (
                <Button
                  type="button"
                  variant="link"
                  data-testid="game-result-play-again"
                  className="min-h-11 px-2"
                  onClick={onPlayAgain}
                >
                  {t.playAgain}
                </Button>
              )}
              {secondaryAction && (
                <Button
                  type="button"
                  variant="link"
                  data-testid="game-result-secondary-action"
                  className="min-h-11 px-2"
                  onClick={secondaryAction.onClick}
                >
                  {secondaryAction.label}
                </Button>
              )}
            </div>
          )}
        </div>
        {guest && (
          <p data-testid="game-result-guest-banner" className="mt-2 text-xs text-muted-foreground">
            {t.guestInvite}{' '}
            <a
              href={guest.signUpHref}
              data-testid="game-result-guest-sign-up-link"
              className="font-medium text-accent-ink hover:underline"
            >
              {t.guestSignUp}
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
