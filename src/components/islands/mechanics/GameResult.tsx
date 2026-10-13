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
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { characterPoseFallbackSrc, characterPoseSrcSet, characterPoseWidth, type CharacterPoseKey } from '@/content/characterPoses';

export type GameResultOutcome = 'perfect' | 'good' | 'retry';

export interface GameResultGuestInvite {
  /** Same destination the old top banner used — `/{lang}/auth/entrar?mode=signup&next=<current path>`. */
  signUpHref: string;
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
  className?: string;
}

/** All correct -> "perfect"; at least 70% -> "good"; otherwise -> "retry" (owner spec, build item N1). */
function outcomeFor(correct: number, total: number): GameResultOutcome {
  if (total <= 0 || correct >= total) return 'perfect';
  return correct / total >= 0.7 ? 'good' : 'retry';
}

/** Vanina's own reaction pose per outcome tier — see this file's own header. */
const OUTCOME_POSE: Record<GameResultOutcome, CharacterPoseKey> = {
  perfect: 'vanina/celebra',
  good: 'vanina/casi',
  retry: 'vanina/animo',
};

export default function GameResult({
  lang,
  correct,
  total,
  resultWord,
  onPlayAgain,
  onReviewWrong,
  nextHref,
  guest,
  className,
}: GameResultProps) {
  const t = UI_LABELS[lang].activities.gameResult;
  const outcome = outcomeFor(correct, total);
  const headline = outcome === 'perfect' ? t.perfect : outcome === 'good' ? t.good : t.retry;
  const word = resultWord ?? t.defaultWord;
  const showReview = correct < total && Boolean(onReviewWrong);
  const pose = OUTCOME_POSE[outcome];

  return (
    <div
      data-testid="game-result"
      data-outcome={outcome}
      role="status"
      aria-live="polite"
      className={cn('flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center', className)}
    >
      {/* Vanina's reaction — a FIXED, slightly larger box (owner feedback,
          UI round 2: the previous `h-40 w-auto` box read as narrow), never
          shrunk to fit: `object-cover` crops to fill it, keeping the
          master's own proportions (never stretched/distorted) — the SAME
          crop rule every character image follows now (`DeskHelper.astro`'s
          own avatar). `object-[50%_15%]` keeps the head/shoulders in frame
          regardless of a pose's own width (the three outcome poses are not
          all the same aspect ratio), cropping the lower body first.
          Decorative only: the outcome is already in the headline text below
          and in `data-outcome` above. */}
      <picture data-testid="game-result-icon" data-outcome-pose={pose} className="block h-48 w-36 overflow-hidden rounded-xl">
        <source type="image/avif" srcSet={characterPoseSrcSet(pose, 'avif')} />
        <source type="image/webp" srcSet={characterPoseSrcSet(pose, 'webp')} />
        <img
          src={characterPoseFallbackSrc(pose)}
          alt=""
          aria-hidden="true"
          width={characterPoseWidth(pose)}
          height={160}
          decoding="async"
          className="block h-full w-full object-cover object-[50%_15%]"
        />
      </picture>
      {/* Comfortable reading measure for the headline/score/buttons (owner
          feedback, UI round 2: the success state read a bit narrow) —
          independent of the character box above, which keeps its own
          fixed size. */}
      <div className="flex w-full max-w-[30rem] flex-col items-center gap-4">
        <h2 className="text-xl font-semibold text-foreground sm:text-2xl">{headline}</h2>
        <p data-testid="game-result-score" className="text-base text-foreground sm:text-lg">
          {correct} {t.of} {total} {word}
        </p>
        <div className="flex flex-col items-center gap-2">
          {nextHref ? (
            <Button asChild className="min-h-11">
              <a href={nextHref} data-testid="game-result-next">
                {t.nextActivity}
              </a>
            </Button>
          ) : (
            <Button type="button" data-testid="game-result-play-again" className="min-h-11" onClick={onPlayAgain}>
              {t.playAgain}
            </Button>
          )}
          {(showReview || nextHref) && (
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
