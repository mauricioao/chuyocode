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
import { useId, useState } from 'react';
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
  retry: string;
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
    retry: 'Intentar de nuevo',
    correct: 'Correcto',
    incorrect: 'Incorrecto',
    unavailable: 'Esta parte del ejercicio todavía no se puede resolver acá.',
    allCorrect: '¡Todo correcto!',
    someWrong: 'Revisá las respuestas marcadas.',
  },
  en: {
    submit: 'Check',
    submitHint: 'Select at least one answer to check.',
    retry: 'Try again',
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

  /**
   * Grade locally. The resolver is registry-backed on purpose: a slot we could
   * not RENDER must not be graded, or the learner would be marked wrong for an
   * answer we never let them give.
   */
  function grade() {
    setResult(check(payload, response, comparatorForRenderable));
  }

  function reset() {
    setResult(null);
    setResponse({});
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
            onClick={reset}
            className="w-fit"
          >
            {t.retry}
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
