/**
 * ExerciseIsland — the interactive half of an exercise page.
 *
 * Hydrated with `client:load`. It holds the learner's in-progress answers,
 * grades them on submit, and shows per-slot feedback.
 *
 * DELIBERATELY STATELESS beyond this mount: no fetch, no storage, no accounts.
 * Feedback is ephemeral and client-side, so reloading the page starts over —
 * that is the product decision, not a gap (docs/exercise-model.md, "Non-goals").
 * The answer key ships in the payload and is readable in DevTools; there is no
 * score to protect.
 *
 * Copy lives in a LOCAL map rather than `UI_LABELS`: islands are React and must
 * not pull the Astro-side i18n module into the client bundle (see AdModal.tsx).
 */
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { claimedTileIds } from '@/lib/exerciseDrop';
import { check, type GradeResult } from '@/lib/exerciseGrading';
import {
  getSlotItems,
  type ExerciseResponse,
  type Payload,
  type Slot,
} from '@/lib/exercisePayload';
import {
  formatRemaining,
  hasExpired,
  shouldTick,
  tick,
  TICK_MS,
} from '@/lib/exerciseTimer';
import UnavailableRenderer from './mechanics/UnavailableRenderer';
import { comparatorForRenderable, rendererFor } from './mechanics/registry';

export interface ExerciseIslandProps {
  /** Active locale; drives all copy. Falls back to English for unknown values. */
  lang: string;
  /** The validated payload for this exercise. */
  payload: Payload;
}

interface Copy {
  submit: string;
  submitHint: string;
  /** Empty option of a `select` slot — the "nothing chosen yet" state. */
  selectPlaceholder: string;
  /** Everything was right: the button starts the whole exercise over. */
  retry: string;
  /** Something was wrong: the button clears ONLY the wrong slots. */
  fix: string;
  correct: string;
  incorrect: string;
  unavailable: string;
  allCorrect: string;
  someWrong: string;
  /** Prefix for the countdown, shown only on the rare timed exercise. */
  timeLeft: string;
}

/**
 * REGISTER (standing project rule): neutral Spanish, no voseo. Instructions use
 * the infinitive — `Revisar`, not `Revisá` — and nothing addresses the learner
 * in the second person, which removes the tú/vos fork instead of picking a side
 * of it. The site is not Argentina-specific. Guarded by a test in
 * `ExerciseIsland.test.tsx`.
 *
 * Exported for that guard: the island deliberately keeps its copy local rather
 * than importing `UI_LABELS`, so this map is the only place the guard can read.
 */
export const COPY: Record<'es' | 'en', Copy> = {
  es: {
    submit: 'Comprobar',
    submitHint: 'Elegir al menos una respuesta para comprobar.',
    selectPlaceholder: 'Elegir una opción',
    retry: 'Intentar de nuevo',
    // The verb alone. The verdict directly above already names which answers
    // were wrong, so "Corregir las incorrectas" made the button repeat it — and
    // a button that reads like a sentence stops looking like a button.
    fix: 'Corregir',
    correct: 'Correcto',
    incorrect: 'Incorrecto',
    unavailable: 'Esta parte del ejercicio todavía no se puede resolver aquí.',
    allCorrect: '¡Todo correcto!',
    someWrong: 'Revisar las respuestas marcadas.',
    timeLeft: 'Tiempo restante',
  },
  en: {
    submit: 'Check',
    submitHint: 'Select at least one answer to check.',
    selectPlaceholder: 'Choose an option',
    retry: 'Try again',
    fix: 'Fix',
    correct: 'Correct',
    incorrect: 'Incorrect',
    unavailable: 'This part of the exercise cannot be answered here yet.',
    allCorrect: 'All correct!',
    someWrong: 'Review the marked answers.',
    timeLeft: 'Time left',
  },
};

/** Resolve copy for a locale, defaulting to English. */
function copyFor(lang: string): Copy {
  return lang === 'es' ? COPY.es : COPY.en;
}

/**
 * The submit / retry button, sized for an exercise rather than for a form.
 *
 * `w-fit` stays: a full-width primary button at this width would read as a page
 * action, and the exercise already has exactly one thing to press. The explicit
 * height and padding override the `Button` variant's own — the shared `lg` size
 * is `h-9`, which is a toolbar button, not the control that ends an activity.
 * `cn()` inside `Button` runs these through tailwind-merge, so the later values
 * win cleanly instead of fighting the variant.
 */
const ACTION_BUTTON = 'h-12 w-fit px-8 text-lg sm:h-14 sm:px-10 sm:text-xl';

/**
 * The slots the learner was actually OFFERED — those whose mechanic shipped.
 *
 * Same structural invariant `comparatorForRenderable` enforces for grading: a
 * slot we could not DRAW must not drive the UI either. An exercise made only of
 * unshipped mechanics is therefore never submittable, because there is nothing
 * the learner could have answered.
 */
function answerableSlots(payload: Payload): Slot[] {
  return payload.slots.filter((slot) => rendererFor(slot.input) !== null);
}

/**
 * Has the learner answered at least ONE slot they could actually answer?
 *
 * Deliberately "at least one", NOT "all": partial submission of a multi-slot
 * exercise stays legitimate. This gates only the NON-ATTEMPT. Submitting an
 * untouched exercise is not a mistake to be marked `Incorrect` — it is not an
 * attempt at all, and grading it punishes the learner for our own affordance.
 */
export function hasSubmittableAnswer(
  payload: Payload,
  response: ExerciseResponse,
): boolean {
  return answerableSlots(payload).some(
    (slot) => (response[slot.id]?.length ?? 0) > 0,
  );
}

/**
 * Drop the answers a grading run marked `incorrect`, keeping everything else.
 *
 * The whole point of the partial retry: a learner who got four of five right
 * must not be made to redo all five. Only what was actually wrong is cleared.
 *
 * WHY CLEAR THE WRONG ONE RATHER THAN LEAVE IT FOR EDITING. Its `Incorrect`
 * verdict disappears together with the grading result, so keeping the value
 * would leave a just-rejected answer sitting in an unmarked field — and because
 * a non-empty answer satisfies {@link hasSubmittableAnswer}, the learner could
 * re-submit the identical wrong answer with one click and get the identical
 * verdict. Clearing makes the remaining work visible and forces a real second
 * attempt. It is also the only rule that behaves the same across every
 * mechanic: "edit your typo" means nothing to a radio group or a dropdown,
 * where a wrong answer is a wrong pick, not a misspelling.
 *
 * `unavailable` is deliberately NOT cleared. That slot was never OFFERED — its
 * mechanic ships no control — so its entry is not a mistake the learner made,
 * and they would have no way to re-enter it (docs/exercise-model.md, "Why this
 * cannot break existing exercises").
 *
 * Pure: returns a new object and never mutates its input.
 */
export function clearIncorrectAnswers(
  response: ExerciseResponse,
  result: GradeResult,
): ExerciseResponse {
  const next: ExerciseResponse = {};
  for (const [slotId, answer] of Object.entries(response)) {
    if (result.slots[slotId] === 'incorrect') continue;
    next[slotId] = answer;
  }
  return next;
}

/**
 * The id of the first `incorrect` slot in DOCUMENT order, or `null`.
 *
 * Walks `payload.slots`, NOT `result.slots`. The result is a plain object keyed
 * by slot id, so iterating it walks insertion order — which is not the order
 * the learner reads. Only the payload defines the on-screen sequence, and the
 * island renders it verbatim. Getting this wrong sends focus to a field
 * somewhere below the one the learner should fix first, silently.
 */
export function firstIncorrectSlotId(
  payload: Payload,
  result: GradeResult,
): string | null {
  const slot = payload.slots.find((s) => result.slots[s.id] === 'incorrect');
  return slot?.id ?? null;
}

export default function ExerciseIsland({ lang, payload }: ExerciseIslandProps) {
  const t = copyFor(lang);

  const [response, setResponse] = useState<ExerciseResponse>({});
  // `null` until the learner submits: absence of a result IS the "not graded yet"
  // state, so there is no separate flag to keep in sync.
  const [result, setResult] = useState<GradeResult | null>(null);

  const graded = result !== null;
  const canSubmit = hasSubmittableAnswer(payload, response);
  // A bare `disabled` button explains nothing to a screen reader, so the reason
  // ships as visible text in reading order. It is withheld when NOTHING is
  // renderable: "pick an answer" would be a lie, and the per-slot unavailable
  // notice is the honest explanation in that case.
  const showHint = !canSubmit && answerableSlots(payload).length > 0;
  const hintId = useId();

  // Slot id -> its primary focusable control, populated by the renderers.
  const controls = useRef(new Map<string, HTMLElement | null>());
  // The slot focus should move to on the NEXT commit. State, not a ref, because
  // it has to drive an effect (see below).
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);

  /**
   * Move focus only AFTER the render that re-enabled the controls.
   *
   * Doing it inline in the click handler would be a silent no-op: React batches
   * the state updates, so the control is still `disabled` at that point and
   * `focus()` on a disabled element does nothing — with nothing thrown and
   * nothing logged. jsdom would not report it either.
   */
  useEffect(() => {
    if (pendingFocus === null) return;
    const node = controls.current.get(pendingFocus);
    // A mechanic may register no control at all. Falling through is the honest
    // outcome — the learner is already unlocked — and it must never throw.
    if (node && typeof node.focus === 'function') node.focus();
    setPendingFocus(null);
  }, [pendingFocus]);

  /**
   * Seconds left, or `null` for the overwhelmingly common untimed exercise.
   *
   * Seeded from the payload and never re-seeded: `useState`'s initial value is
   * read once per mount, which is exactly the lifetime a countdown should have.
   * Remounting starts the clock over, matching the island's existing rule that
   * everything here is ephemeral.
   */
  const [remaining, setRemaining] = useState<number | null>(
    payload.timer?.seconds ?? null,
  );

  /**
   * Has the countdown already ended this exercise?
   *
   * BE HONEST ABOUT WHAT THIS IS: today it is defence in depth, not the thing
   * that makes the countdown fire once. The effect below depends on `remaining`
   * alone, and `remaining` freezes at `0` forever once the clock is spent, so
   * React never re-runs it and the single shot is already structural. Deleting
   * this ref right now changes no observable behaviour — that was measured, not
   * assumed.
   *
   * It stays because of the specific edit it survives. `retry()` sets `result`
   * back to `null`, so `graded` returns to false while `remaining` is still `0`.
   * The moment anyone widens the dependency array to include `graded` — which is
   * exactly what `react-hooks/exhaustive-deps` tells you to do — the effect
   * re-runs in that state and re-grades the learner's freshly cleared answers
   * the instant they ask for another attempt. A verdict they never submitted, on
   * an exercise they had not re-answered, with nothing thrown.
   *
   * A REF and not state, because it is a latch: it must not cause a render, and
   * it must survive the very transition that re-arms the condition.
   */
  const autoGraded = useRef(false);

  const counting = shouldTick(remaining, graded);

  /**
   * The one interval. Cleared on unmount and whenever counting stops, so a
   * learner who navigates away mid-exercise leaves nothing running.
   *
   * Keyed on `counting` rather than on `remaining`, so the interval is created
   * once per run instead of being torn down and rebuilt every second — which
   * would also reset the phase each tick and make the last second arbitrarily
   * long.
   */
  useEffect(() => {
    if (!counting) return;
    const id = setInterval(() => {
      setRemaining((left) => (left === null ? null : tick(left)));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [counting]);

  /**
   * Time is up: grade through the SAME path the button uses.
   *
   * Deliberately calls `grade()` rather than reimplementing it. A second call to
   * `check` here would be a second definition of "what counts as an answer", and
   * the two would drift the first time either side changed — with the timed path
   * being the one nobody manually tests.
   */
  useEffect(() => {
    if (remaining === null || !hasExpired(remaining)) return;
    if (autoGraded.current) return;
    autoGraded.current = true;
    grade();
    // `remaining` ALONE, deliberately. `grade` is recreated every render, so
    // depending on it would re-run this effect on every keystroke; `graded` and
    // `response` would re-run it after a retry. The latch above is what keeps
    // widening this list from becoming a bug rather than merely wasteful.
  }, [remaining]);

  /**
   * Grade locally. The resolver is registry-backed on purpose: a slot we could
   * not RENDER must not be graded, or the learner would be marked wrong for an
   * answer we never let them give.
   */
  function grade() {
    setResult(check(payload, response, comparatorForRenderable));
  }

  /**
   * The post-grading button. ONE control, two honest behaviours:
   *
   *  - everything correct -> there is nothing to fix, so start over completely;
   *  - something wrong    -> keep what was right, clear only what was wrong,
   *                          and put the cursor on the first thing to redo.
   *
   * The label changes with the behaviour, so the button never lies about what
   * pressing it will cost the learner.
   */
  function retry() {
    if (!result) return;

    if (result.correct) {
      setResponse({});
      setResult(null);
      return;
    }

    setResponse((prev) => clearIncorrectAnswers(prev, result));
    setPendingFocus(firstIncorrectSlotId(payload, result));
    setResult(null);
  }

  return (
    // `gap-8` rather than `gap-6`: at display scale the slots themselves are
    // taller, and the old spacing let two questions read as one block.
    <section className="flex flex-col gap-8">
      {/* Rendered only for the rare timed exercise. `remaining` is `null` both
          when no timer was authored and when a malformed one was dropped at the
          payload boundary, so there is ONE condition here, not two. */}
      {remaining !== null && (
        <p
          data-testid="exercise-timer"
          // `role="timer"` carries an implicit `aria-live="off"`, which is the
          // point of using it: a polite live region would make a screen reader
          // interrupt itself every single second and render the exercise
          // unusable by ear. The value stays queryable on demand instead.
          role="timer"
          className="text-base font-semibold text-zinc-100 tabular-nums sm:text-lg"
        >
          {t.timeLeft} {formatRemaining(remaining)}
        </p>
      )}

      {payload.slots.map((slot) => {
        const Renderer = rendererFor(slot.input);
        const outcome = result?.slots[slot.id];

        return (
          <div key={slot.id} className="flex flex-col gap-3">
            {Renderer ? (
              <Renderer
                slot={slot}
                items={getSlotItems(payload, slot)}
                value={response[slot.id] ?? []}
                onChange={(next) =>
                  setResponse((prev) => ({ ...prev, [slot.id]: next }))
                }
                disabled={graded}
                // Passed to EVERY renderer and ignored by the ones that have no
                // empty state. Uniform props are what keep the dispatch above
                // free of a branch per mechanic.
                placeholder={t.selectPlaceholder}
                // WHY THE ISLAND COMPUTES THIS AND NOT THE RENDERER. A pool is
                // SHARED across slots, so "which tiles are still free" is a fact
                // about the WHOLE response — and the response lives here. A
                // renderer only ever sees its own `value`, so it cannot know
                // that the tile it is about to offer is already sitting in the
                // question above it. Without this, two `drop` slots reading one
                // pool each offer the same tile and the learner can answer with
                // it twice; nothing throws and nothing logs.
                claimed={claimedTileIds(payload, response, slot.id)}
                // Chrome copy is localized. `drop` is the first mechanic whose
                // copy is whole SENTENCES (screen-reader announcements) rather
                // than one label, so `placeholder` could not carry it.
                lang={lang}
                // A fresh closure per render, so React detaches and reattaches
                // this ref on every commit. Harmless here: the map is only ever
                // READ from an effect, which runs after the commit has settled.
                focusRef={(node) => controls.current.set(slot.id, node)}
              />
            ) : (
              <UnavailableRenderer slot={slot} message={t.unavailable} />
            )}

            {/* Only a slot that was actually graded gets a verdict. */}
            {(outcome === 'correct' || outcome === 'incorrect') && (
              <p
                data-testid={`slot-feedback-${slot.id}`}
                className={
                  outcome === 'correct'
                    ? 'text-base font-semibold text-emerald-400 sm:text-lg'
                    : 'text-base font-semibold text-destructive sm:text-lg'
                }
              >
                {outcome === 'correct' ? t.correct : t.incorrect}
              </p>
            )}
          </div>
        );
      })}

      {graded ? (
        <div className="flex flex-col gap-3">
          <p
            data-testid="exercise-verdict"
            role="status"
            className="text-lg font-semibold text-zinc-100 sm:text-xl"
          >
            {result.correct ? t.allCorrect : t.someWrong}
          </p>
          <Button
            type="button"
            data-testid="exercise-retry"
            variant="secondary"
            onClick={retry}
            className={ACTION_BUTTON}
          >
            {result.correct ? t.retry : t.fix}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {showHint && (
            <p
              id={hintId}
              data-testid="exercise-submit-hint"
              className="text-base text-muted-foreground"
            >
              {t.submitHint}
            </p>
          )}
          <Button
            type="button"
            data-testid="exercise-submit"
            onClick={grade}
            // A real attribute, not a dimmed style: an unanswered exercise is a
            // non-attempt, and grading it would mark the learner `Incorrect` for
            // a mistake they never made.
            disabled={!canSubmit}
            aria-describedby={showHint ? hintId : undefined}
            className={ACTION_BUTTON}
          >
            {t.submit}
          </Button>
        </div>
      )}
    </section>
  );
}
