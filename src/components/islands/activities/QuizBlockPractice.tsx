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
 *
 * GAME MODES (D1, "Una actividad, muchos juegos"): the same slots also drive
 * `QuizGameModeSwitcher` plus the two alternate games it can switch to —
 * `deriveGameItems`/`availableGameModes` (`gameModes.ts`) turn this block's
 * `payload.slots` into `GameItem`s and the modes worth offering. `mode`/
 * `onModeChange` are lifted to `ActivityPracticeIsland`, same shape as
 * `response`/`onChange`, so a block's chosen mode survives this component
 * unmounting on a tab switch and so the footer can show its Comprobar hint.
 * Switching AWAY from `quiz` never touches `response`: the quiz-mode inputs
 * below simply stop mounting, and the alternate games never write into it.
 */
import { useMemo } from 'react';
import { LightbulbIcon } from '@phosphor-icons/react/dist/ssr/Lightbulb';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import SpeakButton from '@/lib/speech/SpeakButton';
import type { QuizBlock } from '@/lib/activities/blocks';
import type { SlotOutcome } from '@/lib/exerciseGrading';
import { claimedTileIds } from '@/lib/exerciseDrop';
import { blocksForStep } from '@/lib/exerciseBlocks';
import { getSlotItems, poolPlacement, type ExerciseResponse } from '@/lib/exercisePayload';
import {
  deriveGameItems,
  availableGameModes,
  anagramEligible,
  hangmanEligible,
  deriveTrueFalseItems,
  seedFromString,
  type GameMode,
} from '@/lib/activities/gameModes';
import { rendererFor } from '@/components/islands/mechanics/registry';
import UnavailableRenderer from '@/components/islands/mechanics/UnavailableRenderer';
import QuizGameModeSwitcher from './QuizGameModeSwitcher';
import QuizFlashcards from './QuizFlashcards';
import QuizMatching from './QuizMatching';
import QuizSpeakingCards from './QuizSpeakingCards';
import QuizWheel from './QuizWheel';
import QuizAnagram from './QuizAnagram';
import QuizHangman from './QuizHangman';
import QuizTrueFalse from './QuizTrueFalse';
import QuizOpenBox from './QuizOpenBox';

export interface QuizBlockPracticeProps {
  lang: Lang;
  block: QuizBlock;
  /** This block's own slice of the page's response map — slot id -> answer. */
  response: ExerciseResponse;
  onChange: (slotId: string, value: string[]) => void;
  /** Slot id -> outcome, present only once the page has graded. Absent entirely = not graded yet. */
  outcomes?: Record<string, SlotOutcome>;
  disabled: boolean;
  /** This block's active game mode. Defaults to `'quiz'` — every caller written before D1 keeps rendering exactly as before. */
  mode?: GameMode;
  /** Report a new mode for this block. Defaults to a no-op, matching `mode`'s own default. */
  onModeChange?: (mode: GameMode) => void;
}

/** Modes this component can actually render. */
const SUPPORTED_MODES: readonly GameMode[] = [
  'quiz',
  'cards',
  'match',
  'speak',
  'wheel',
  'anagram',
  'hangman',
  'truefalse',
  'openbox',
];

export default function QuizBlockPractice({
  lang,
  block,
  response,
  onChange,
  outcomes,
  disabled,
  mode = 'quiz',
  onModeChange = () => {},
}: QuizBlockPracticeProps) {
  const t = UI_LABELS[lang].activities.player;
  const payload = block.payload;
  const placement = poolPlacement(payload);

  const gameItems = useMemo(() => deriveGameItems(payload), [payload]);
  const modes = useMemo(
    () => availableGameModes(gameItems, payload).filter((m) => SUPPORTED_MODES.includes(m)),
    [gameItems, payload],
  );
  // A mode this block no longer offers (edited down since it was chosen)
  // falls back to `quiz` rather than rendering nothing.
  const effectiveMode = modes.includes(mode) ? mode : 'quiz';

  if (
    effectiveMode === 'cards' ||
    effectiveMode === 'match' ||
    effectiveMode === 'speak' ||
    effectiveMode === 'wheel' ||
    effectiveMode === 'anagram' ||
    effectiveMode === 'hangman' ||
    effectiveMode === 'truefalse' ||
    effectiveMode === 'openbox'
  ) {
    return (
      <div data-testid={`quiz-practice-${block.id}`} className="flex flex-col gap-3">
        {modes.length > 1 && (
          <QuizGameModeSwitcher lang={lang} modes={modes} active={effectiveMode} onChange={onModeChange} />
        )}
        {effectiveMode === 'cards' && <QuizFlashcards lang={lang} items={gameItems} seed={block.id} />}
        {effectiveMode === 'match' && <QuizMatching lang={lang} items={gameItems} seed={block.id} />}
        {effectiveMode === 'speak' && <QuizSpeakingCards lang={lang} items={gameItems} seed={block.id} />}
        {effectiveMode === 'wheel' && <QuizWheel lang={lang} items={gameItems} seed={block.id} />}
        {effectiveMode === 'anagram' && (
          <QuizAnagram lang={lang} items={anagramEligible(gameItems)} seed={block.id} />
        )}
        {effectiveMode === 'hangman' && <QuizHangman lang={lang} items={hangmanEligible(gameItems)} />}
        {effectiveMode === 'truefalse' && (
          <QuizTrueFalse lang={lang} items={deriveTrueFalseItems(payload, seedFromString(block.id))} />
        )}
        {effectiveMode === 'openbox' && <QuizOpenBox lang={lang} items={gameItems} />}
      </div>
    );
  }

  return (
    <div data-testid={`quiz-practice-${block.id}`} className="flex flex-col gap-6">
      {modes.length > 1 && (
        <QuizGameModeSwitcher lang={lang} modes={modes} active={effectiveMode} onChange={onModeChange} />
      )}
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
