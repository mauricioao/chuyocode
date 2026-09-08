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
 * IT OWNS NO VOCABULARY — same rule as `ExerciseIsland`'s badges (RULE 1). The
 * `.astro` page resolves `label` from `UI_LABELS` and hands over a plain string,
 * which keeps the i18n module out of the client bundle AND keeps the copy inside
 * the map that the site-wide neutral-Spanish guard actually walks. A local COPY
 * map here would sit outside that guard's reach.
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
  /** Accessible name, resolved from `UI_LABELS` by the page. */
  label: string;
}

export default function LikeButton({
  exerciseId,
  count: initialCount,
  liked: initialLiked,
  label,
}: LikeButtonProps) {
  const [count, setCount] = useState(initialCount);
  const [liked, setLiked] = useState(initialLiked);
  const [pending, setPending] = useState(false);

  async function like() {
    // Guarded here rather than by `disabled`, on purpose: disabling the element
    // that was just clicked drops focus to `<body>` (the browser's rule for
    // disabled elements — the same trap documented on the exercise stepper).
    // `aria-disabled` below states the same thing without moving focus.
    if (liked || pending) return;

    // Captured BEFORE the optimistic write so the undo restores the number the
    // server last confirmed, not a value derived from the guess.
    const confirmed = count;
    setLiked(true);
    setPending(true);
    setCount(confirmed + 1);

    try {
      const res = await fetch(likeEndpoint(exerciseId), { method: 'POST' });
      const body = res.ok ? await res.json() : null;

      // 🔴 THE OPTIMISTIC UPDATE IS A GUESS AND IS TREATED AS ONE. A number in
      // the response is the truth and REPLACES the guess — which is also how a
      // click inside the dedup window quietly undoes itself, since the server
      // answers the unchanged total. Anything else means the counter did not
      // move, so the guess is rolled back entirely: the button must never keep
      // showing a like that was never recorded.
      if (typeof body?.count === 'number') {
        setCount(body.count);
      } else {
        setCount(confirmed);
        setLiked(false);
      }
    } catch {
      // Offline, aborted, or a malformed body. Same rule: nothing was recorded,
      // so nothing is claimed. The button becomes clickable again.
      setCount(confirmed);
      setLiked(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={like}
      aria-pressed={liked}
      aria-disabled={liked || pending}
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
          and silence the count — the one part of this control that changes. */}
      <span className="sr-only">{label}</span>
      {/* `tabular-nums` so the control does not resize as the number grows. */}
      <span className="tabular-nums">{count}</span>
    </Button>
  );
}
