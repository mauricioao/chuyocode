/**
 * QuizBlockPractice — one `quiz` block's learner-facing practice view
 * (`/[lang]/ingles/actividades/[id]`, PR C "Preguntas (quiz) block").
 *
 * ALL QUESTIONS VISIBLE AT ONCE, deliberately NOT `ExerciseIsland`'s own
 * stepper: the practice page already has ONE combined Comprobar/Reintentar
 * for the whole activity (worksheet zones AND quiz questions together,
 * `ActivityPracticeIsland`'s own header) — a per-block stepper with its own
 * submit button would compete with that page-level control instead of
 * feeding it. So this component owns no submit state of its own: `response`/
 * `onChange`/`outcomes`/`disabled` are all lifted to `ActivityPracticeIsland`,
 * the same shape `WorksheetPracticePlayer`'s `practice` prop already uses for
 * worksheet zones.
 *
 * REUSES THE MECHANIC RENDERERS DIRECTLY (`mechanics/registry.ts`), same
 * dispatch `ExerciseIsland` uses per step — this is the "all steps at once"
 * layout, not a new renderer. `blocksForStep` (`exerciseBlocks.ts`) still
 * supplies each question's own `prose`/`media` context, unchanged.
 *
 * Answers are NEVER stored here — same rule `ActivityPracticeIsland`'s own
 * header states; `response` is that component's plain, ephemeral state.
 */
import { LightbulbIcon } from '@phosphor-icons/react/dist/ssr/Lightbulb';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import SpeakButton from '@/lib/speech/SpeakButton';
import type { QuizBlock } from '@/lib/activities/blocks';
import type { SlotOutcome } from '@/lib/exerciseGrading';
import { claimedTileIds } from '@/lib/exerciseDrop';
import { blocksForStep } from '@/lib/exerciseBlocks';
import { getSlotItems, poolPlacement, type ExerciseResponse } from '@/lib/exercisePayload';
import { rendererFor } from '@/components/islands/mechanics/registry';
import UnavailableRenderer from '@/components/islands/mechanics/UnavailableRenderer';

export interface QuizBlockPracticeProps {
  lang: Lang;
  block: QuizBlock;
  /** This block's own slice of the page's response map — slot id -> answer. */
  response: ExerciseResponse;
  onChange: (slotId: string, value: string[]) => void;
  /** Slot id -> outcome, present only once the page has graded. Absent entirely = not graded yet. */
  outcomes?: Record<string, SlotOutcome>;
  disabled: boolean;
}

export default function QuizBlockPractice({ lang, block, response, onChange, outcomes, disabled }: QuizBlockPracticeProps) {
  const t = UI_LABELS[lang].activities.player;
  const payload = block.payload;
  const placement = poolPlacement(payload);

  return (
    <div data-testid={`quiz-practice-${block.id}`} className="flex flex-col gap-6">
      {payload.slots.map((slot, index) => {
        const Renderer = rendererFor(slot.input);
        const items = getSlotItems(payload, slot);
        const value = response[slot.id] ?? [];
        const outcome = outcomes?.[slot.id];
        // Context (`prose`/`media`) authored around this question — the
        // `row` block itself is filtered out, same as `ExerciseIsland`'s own
        // `stepBlocks` for one step.
        const contextBlocks = blocksForStep(payload, index).filter((b) => b.kind !== 'row');

        return (
          <div key={slot.id} data-testid={`quiz-slot-${slot.id}`} className="flex flex-col gap-2">
            {contextBlocks.map((contextBlock) => {
              if (contextBlock.kind === 'prose') {
                return (
                  <div key={contextBlock.id} className="flex items-start gap-2">
                    <p className="text-sm text-zinc-300">{contextBlock.text}</p>
                    <SpeakButton text={contextBlock.text} lang={lang} compact />
                  </div>
                );
              }
              if (contextBlock.kind === 'media') {
                return (
                  <div key={contextBlock.id} className="flex flex-col gap-2">
                    {contextBlock.image && (
                      <img
                        src={contextBlock.image}
                        alt={contextBlock.alt ?? ''}
                        className="max-h-64 w-full rounded-md object-contain"
                      />
                    )}
                    {contextBlock.audio && <audio controls src={contextBlock.audio} className="w-full" />}
                  </div>
                );
              }
              return null;
            })}

            {/* D4 "Escuchar/Listen": one SpeakButton per question, same
                placement rule as `ExerciseIsland`'s own per-step one. */}
            <SpeakButton text={slot.label} lang={lang} />

            {Renderer ? (
              <Renderer
                slot={slot}
                items={items}
                value={value}
                onChange={(next) => onChange(slot.id, next)}
                disabled={disabled}
                placeholder={t.choicePlaceholder}
                claimed={slot.input === 'drop' ? claimedTileIds(payload, response, slot.id) : undefined}
                lang={lang}
                poolPlacement={placement}
              />
            ) : (
              <UnavailableRenderer slot={slot} message={t.quizUnavailable} />
            )}

            {outcome && outcome !== 'unavailable' && (
              <span data-testid={`quiz-slot-result-${slot.id}`} className="sr-only">
                {outcome === 'correct' ? t.correct : t.incorrect}
              </span>
            )}

            {/* D5 "¿Por qué?": only once graded AND only while THIS
                question is incorrect — never before checking, never for a
                correct answer. Inline under the question (no popover here,
                unlike the worksheet zone: a quiz question already has the
                room a tiny drawn zone does not). */}
            {slot.explanation && outcome === 'incorrect' && (
              <div
                data-testid={`quiz-slot-explanation-${slot.id}`}
                className="flex items-start gap-1.5 rounded-md border border-border bg-muted/40 p-2 text-sm text-foreground"
              >
                <LightbulbIcon aria-hidden="true" weight="fill" className="mt-0.5 shrink-0 text-amber-400" />
                <p>{slot.explanation}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
