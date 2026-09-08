/**
 * LikeButton — the one interactive control behind the exercise like counter.
 *
 * DELIBERATELY ITS OWN ISLAND, and NOT folded into `ExerciseIsland`. Two
 * reasons, and neither is stylistic:
 *   1. It is an unrelated concern. `ExerciseIsland` holds the learner's answers
 *      and grades them with no network at all (docs/exercise-model.md,
 *      "Non-goals"); this one does nothing but a single POST. Merging them would
 *      put a fetch inside the component whose defining property is that it has
 *      none.
 *   2. `ExerciseIsland` is already large. A page-level counter has no business
 *      re-rendering with every keystroke of an answer, and every byte added
 *      there is hydrated on the critical path of the actual exercise.
 *
 * COPY IS LOCAL, and that is a deliberate change from the single-string version
 * this replaces. A toggle needs TWO names — one per direction — and which one
 * applies is a fact about component state, not about the page. Threading a pair
 * of strings down so the component can pick between them puts the decision in
 * the wrong place; the page would be shipping vocabulary for a state it cannot
 * see. Same reasoning as `ExerciseIsland` and `AdModal`, which own their chrome
 * for the same reason.
 *
 * 🔴 THE COST OF THAT, AND HOW IT IS PAID. A local map sits OUTSIDE the
 * site-wide neutral-Spanish sweep, which only walks `UI_LABELS`. So {@link COPY}
 * is EXPORTED and swept explicitly from `LikeButton.test.tsx`, exactly as
 * `AdModal.COPY` is. An unexported map here would quietly leave this island's
 * Spanish ungoverned.
 *
 * NOT RENDERED AT ALL when the SSR count is unknown — that decision lives on the
 * Astro side, so a Supabase outage ships no JavaScript for this rather than
 * hydrating a button that cannot work. `count` is therefore always a number
 * here, and the component has no "unknown" branch to get wrong.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The lucide `Heart` path, at its 24px viewBox.
 *
 * ICONS ARE DATA IN THIS PROJECT, never `lucide-react` component imports (the
 * standing rule behind `skillIcons.ts` and `arrowControl.ts`). Copied VERBATIM
 * from `node_modules/lucide-react/dist/esm/icons/heart.mjs`, lucide-react
 * v1.27.0, ISC licensed — named so a reviewer can diff it.
 *
 * It stays a module constant here rather than moving to `src/lib`: the two
 * modules that live there do so because an `.astro` component needed the
 * geometry and Astro cannot render a React component. This glyph has exactly one
 * consumer, and a shared module for it would be indirection without a second
 * caller.
 *
 * TRADEOFF, STATED PLAINLY: copied geometry does not follow a `lucide-react`
 * upgrade. Same accepted risk as `skillIcons.ts`.
 */
const HEART_PATH =
  'M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5';

/**
 * The button's own chrome, in both locales.
 *
 * TWO NAMES, ONE PER DIRECTION, and the name describes THE ACTION THE PRESS WILL
 * PERFORM rather than the current state. `aria-pressed` already carries the
 * state, so the pair reads coherently to a screen reader: "Me gusta, not
 * pressed" before, "Quitar me gusta, pressed" after. It also gives voice-control
 * users something to say that matches what they want to happen.
 *
 * Neutral, impersonal Spanish: an infinitive for the action, no voseo, no
 * regional forms. `es` is swept by `findVoseo` from this component's test file
 * — see the file header for why that sweep has to be explicit here.
 */
export const COPY = {
  es: { like: 'Me gusta', unlike: 'Quitar me gusta' },
  en: { like: 'Like', unlike: 'Remove like' },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

/** Resolve copy for a locale, defaulting to English — same rule as the island. */
function copyFor(lang: string): Copy {
  return lang === 'es' ? COPY.es : COPY.en;
}

/** Where the counter is written. The ONLY writer is the server (see the route). */
export function likeEndpoint(exerciseId: string): string {
  return `/api/me-gusta/${encodeURIComponent(exerciseId)}`;
}

export interface LikeButtonProps {
  /** The exercise's primary key. Also the dedup cookie's key, server-side. */
  exerciseId: string;
  /** The count rendered on the server. Never `null` — see the file header. */
  count: number;
  /** Whether this browser already liked it, read from the dedup cookie on SSR. */
  liked: boolean;
  /** Locale for {@link COPY}. Unknown values fall back to English. */
  lang: string;
}

export default function LikeButton({
  exerciseId,
  count: initialCount,
  liked: initialLiked,
  lang,
}: LikeButtonProps) {
  const [count, setCount] = useState(initialCount);
  const [liked, setLiked] = useState(initialLiked);
  const [pending, setPending] = useState(false);
  const t = copyFor(lang);

  async function toggle() {
    // Guarded here rather than by `disabled`, on purpose: disabling the element
    // that was just clicked drops focus to `<body>` (the browser's rule for
    // disabled elements — the same trap documented on the exercise stepper).
    // `aria-disabled` below states the same thing without moving focus.
    //
    // ONLY `pending` GUARDS NOW. The old version also refused when `liked` was
    // already true, because there was no second thing a press could mean. Being
    // liked is now precisely the state in which a press is most meaningful.
    if (pending) return;

    // Both captured BEFORE the optimistic write, so an undo restores what the
    // server last confirmed rather than something derived from the guess.
    const confirmed = count;
    const wasLiked = liked;

    setLiked(!wasLiked);
    setPending(true);
    // `Math.max` here is presentation only — it stops the OPTIMISTIC number
    // flashing -1 for one paint if the server's count was already stale at 0.
    // The counter's real floor is a clamp inside the RPC and a CHECK constraint
    // behind it; a guess in the browser could never have enforced anything.
    setCount(wasLiked ? Math.max(confirmed - 1, 0) : confirmed + 1);

    try {
      const res = await fetch(likeEndpoint(exerciseId), { method: 'POST' });
      const body = res.ok ? await res.json() : null;

      // 🔴 THE OPTIMISTIC UPDATE IS A GUESS AND IS TREATED AS ONE. A number in
      // the response is the truth and REPLACES the guess — which is also how the
      // button absorbs a like somebody else added while this request was in
      // flight. Anything else means the counter did not move, so BOTH halves of
      // the guess are rolled back: the button must never show a like that was
      // never recorded, nor drop one that was never removed.
      if (typeof body?.count === 'number') {
        setCount(body.count);
      } else {
        setCount(confirmed);
        setLiked(wasLiked);
      }
    } catch {
      // Offline, aborted, or a malformed body. Same rule: nothing was recorded,
      // so nothing is claimed. The button becomes clickable again.
      setCount(confirmed);
      setLiked(wasLiked);
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={toggle}
      aria-pressed={liked}
      aria-disabled={pending}
      aria-busy={pending}
      data-testid="exercise-like"
      className={cn(liked && 'text-accent')}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        // Filled once liked: the state has to be visible without colour alone,
        // which a hue change on a thin outline would not achieve.
        fill={liked ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={HEART_PATH} />
      </svg>
      {/* The accessible name is composed from the VISIBLE text plus this, rather
          than from an `aria-label`. An `aria-label` would override the content
          and silence the count — the one part of this control that changes.
          The word itself names the NEXT action, so the control announces what
          pressing it does; `aria-pressed` above says where it currently is. */}
      <span className="sr-only">{liked ? t.unlike : t.like}</span>
      {/* `tabular-nums` so the control does not resize as the number grows. */}
      <span className="tabular-nums">{count}</span>
    </Button>
  );
}
