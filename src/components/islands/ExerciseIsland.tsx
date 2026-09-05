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
import { check, type GradeResult } from '@/lib/exerciseGrading';
import {
  getSlotItems,
  type ExerciseResponse,
  type Payload,
  type Slot,
} from '@/lib/exercisePayload';
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
}

const COPY: Record<'es' | 'en', Copy> = {
  es: {
    submit: 'Comprobar',
    submitHint: 'Elegí al menos una respuesta para comprobar.',
    selectPlaceholder: 'Elegí una opción',
    retry: 'Intentar de nuevo',
    // Names what actually happens, so the learner is not afraid of losing the
    // answers they already got right by pressing it.
    fix: 'Corregir las incorrectas',
    correct: 'Correcto',
    incorrect: 'Incorrecto',
    unavailable: 'Esta parte del ejercicio todavía no se puede resolver acá.',
    allCorrect: '¡Todo correcto!',
    someWrong: 'Revisá las respuestas marcadas.',
  },
  en: {
    submit: 'Check',
    submitHint: 'Select at least one answer to check.',
    selectPlaceholder: 'Choose an option',
    retry: 'Try again',
    fix: 'Fix the wrong ones',
    correct: 'Correct',
    incorrect: 'Incorrect',
    unavailable: 'This part of the exercise cannot be answered here yet.',
    allCorrect: 'All correct!',
    someWrong: 'Review the marked answers.',
  },
};

/** Resolve copy for a locale, defaulting to English. */
function copyFor(lang: string): Copy {
  return lang === 'es' ? COPY.es : COPY.en;
}

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
    <section className="flex flex-col gap-6">
      {payload.slots.map((slot) => {
        const Renderer = rendererFor(slot.input);
        const outcome = result?.slots[slot.id];

        return (
          <div key={slot.id} className="flex flex-col gap-2">
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
                    ? 'text-sm font-semibold text-emerald-400'
                    : 'text-sm font-semibold text-destructive'
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
            className="text-base font-semibold text-zinc-100"
          >
            {result.correct ? t.allCorrect : t.someWrong}
          </p>
          <Button
            type="button"
            data-testid="exercise-retry"
            variant="secondary"
            onClick={retry}
            className="w-fit"
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
              className="text-sm text-muted-foreground"
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
            className="w-fit"
          >
            {t.submit}
          </Button>
        </div>
      )}
    </section>
  );
}
