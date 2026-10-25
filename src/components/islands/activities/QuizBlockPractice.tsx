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
import { useEffect, useMemo, type ReactNode } from 'react';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { FadeImage } from '@/components/ui/fade-image';
import SpeakButton from '@/lib/speech/SpeakButton';
import { preloadCharacterPoses } from '@/content/characterPoses';
import type { QuizBlock } from '@/lib/activities/blocks';
import type { SlotOutcome } from '@/lib/exerciseGrading';
import { claimedTileIds } from '@/lib/exerciseDrop';
import { blocksForStep } from '@/lib/exerciseBlocks';
import { getSlotItems, poolPlacement, type ExerciseResponse } from '@/lib/exercisePayload';
import {
  deriveGameItems,
  availableGameModes,
  modesForBlock,
  anagramEligible,
  hangmanEligible,
  reorderEligible,
  deriveTrueFalseItems,
  seedFromString,
  type GameMode,
} from '@/lib/activities/gameModes';
import { rendererFor } from '@/components/islands/mechanics/registry';
import UnavailableRenderer from '@/components/islands/mechanics/UnavailableRenderer';
import SlotExplanation from '@/components/islands/mechanics/SlotExplanation';
import PromptImage from '@/components/islands/mechanics/PromptImage';
import QuizGameModeSwitcher from './QuizGameModeSwitcher';
import QuizFlashcards from './QuizFlashcards';
import QuizMatching from './QuizMatching';
import QuizReorder from './QuizReorder';
import QuizSpeakingCards from './QuizSpeakingCards';
import QuizWheel from './QuizWheel';
import QuizAnagram from './QuizAnagram';
import QuizHangman from './QuizHangman';
import QuizTrueFalse from './QuizTrueFalse';
import QuizOpenBox from './QuizOpenBox';
import QuizCloze from './QuizCloze';
import QuizGroupSort from './QuizGroupSort';
import type { GameResultGuestInvite } from '@/components/islands/mechanics/GameResult';
import { ACTIVITY_SHEET_CLASS } from '@/components/islands/mechanics/chip';

/**
 * The one white "sheet" every big-stage mould's own board (tray + targets)
 * sits on (activity-templates-polish pass, design doc
 * `docs/PROPUESTA-PLANTILLAS-2026-10-23.md` §d). The actual class name
 * (`ACTIVITY_SHEET_CLASS`) lives in `mechanics/chip.ts` and each mould
 * applies it to its own inline wrapper div directly — NOT by importing this
 * component, which would be circular (this file already imports every
 * mould to render it). This component exists for the one caller that sits
 * above that cycle (documentation/parity only today).
 *
 * Deliberately wraps ONLY the board/tray content, never the chrome row or
 * the floating Comprobar (`scale.ts`'s `FLOATING_CHECK_BAR_CLASS`, still
 * `position: fixed` against the stage, unaffected by this wrapper since it
 * sets no `transform`/`contain`/`filter` of its own) — it must read
 * correctly on both the plain grey canvas and a chosen backdrop (S1/S2's own
 * stage work), so it is its own small opaque card rather than part of the
 * stage chrome.
 */
export function ActivitySheet({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div data-testid="activity-sheet" className={cn(ACTIVITY_SHEET_CLASS, className)}>
      {children}
    </div>
  );
}

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
  /** Threaded straight through to the four drag templates' own `GameResult` — set only by the practice page, never by the editor preview (build item N1). */
  nextHref?: string;
  /** Threaded straight through to the four drag templates' own `GameResult` — set only by the practice page, for an anonymous visitor (build item N1). */
  guest?: GameResultGuestInvite;
}

/** Modes this component can actually render. */
const SUPPORTED_MODES: readonly GameMode[] = [
  'quiz',
  'cards',
  'match',
  'reorder',
  'speak',
  'wheel',
  'anagram',
  'hangman',
  'truefalse',
  'openbox',
  'cloze',
  'groupsort',
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
  nextHref,
  guest,
}: QuizBlockPracticeProps) {
  const t = UI_LABELS[lang].activities.player;
  const payload = block.payload;
  const placement = poolPlacement(payload);

  // Warms the 3 GameResult outcome poses the instant a template activity
  // mounts (bugfix; owner report: "Vanina aparece de golpe") — long before
  // any round actually ends, regardless of which game mode this block
  // starts in. This component renders all four drag templates (below), so
  // mounting it once already covers both the player and the editor
  // preview (`ActivityPreviewFrame`); `preloadCharacterPoses` is itself
  // idempotent, so multiple quiz blocks on one page each calling this is a
  // no-op after the first.
  useEffect(() => {
    preloadCharacterPoses();
  }, []);

  const gameItems = useMemo(() => deriveGameItems(payload), [payload]);
  const modes = useMemo(
    () =>
      modesForBlock(availableGameModes(gameItems, payload), block.template).filter((m) => SUPPORTED_MODES.includes(m)),
    [gameItems, payload, block.template],
  );
  // A mode this block no longer offers (edited down since it was chosen)
  // falls back to `quiz` rather than rendering nothing.
  const effectiveMode = modes.includes(mode) ? mode : 'quiz';

  if (
    effectiveMode === 'cards' ||
    effectiveMode === 'match' ||
    effectiveMode === 'reorder' ||
    effectiveMode === 'speak' ||
    effectiveMode === 'wheel' ||
    effectiveMode === 'anagram' ||
    effectiveMode === 'hangman' ||
    effectiveMode === 'truefalse' ||
    effectiveMode === 'openbox' ||
    effectiveMode === 'cloze' ||
    effectiveMode === 'groupsort'
  ) {
    // The four big drag-and-drop games (visual-polish pass) stretch to fill
    // their stage — `flex-1 min-h-0` — so a short board/sentence can center
    // itself in the real available height instead of sizing to its own
    // content and leaving the rest of the stage empty; every other game
    // mode here (Tarjetas/Ruleta/Anagrama/…) keeps its original shrink-to-
    // fit sizing, unaffected by this pass.
    //
    // Single-card kit pass: those single-card games still size to their own
    // content, but now sit CENTRED in the stage height left under the
    // switcher, like the big games do — the wrapper grows (`flex-1`, never
    // `min-h-0`: it may still grow past the stage, so the stage's own
    // scroll keeps working) and the game takes `my-auto`, which centres
    // without ever pushing a taller game's top out of reach (unlike
    // `justify-center`, auto margins collapse to 0 on overflow).
    const isBigStageGame =
      effectiveMode === 'match' ||
      effectiveMode === 'reorder' ||
      effectiveMode === 'cloze' ||
      effectiveMode === 'groupsort';
    return (
      <div
        data-testid={`quiz-practice-${block.id}`}
        className={cn('flex flex-1 flex-col gap-3', isBigStageGame && 'min-h-0')}
      >
        {modes.length > 1 && (
          <QuizGameModeSwitcher lang={lang} modes={modes} active={effectiveMode} onChange={onModeChange} />
        )}
        {!isBigStageGame && (
          <div className="my-auto flex flex-col">
            {effectiveMode === 'cards' && (
              <QuizFlashcards lang={lang} items={gameItems} seed={block.id} promptImages={block.promptImages} />
            )}
            {effectiveMode === 'speak' && (
              <QuizSpeakingCards lang={lang} items={gameItems} seed={block.id} promptImages={block.promptImages} />
            )}
            {effectiveMode === 'wheel' && (
              <QuizWheel lang={lang} items={gameItems} seed={block.id} promptImages={block.promptImages} />
            )}
            {effectiveMode === 'anagram' && (
              <QuizAnagram
                lang={lang}
                items={anagramEligible(gameItems)}
                seed={block.id}
                promptImages={block.promptImages}
              />
            )}
            {effectiveMode === 'hangman' && (
              <QuizHangman lang={lang} items={hangmanEligible(gameItems)} promptImages={block.promptImages} />
            )}
            {effectiveMode === 'truefalse' && (
              <QuizTrueFalse
                lang={lang}
                items={deriveTrueFalseItems(payload, seedFromString(block.id))}
                promptImages={block.promptImages}
              />
            )}
            {effectiveMode === 'openbox' && (
              <QuizOpenBox lang={lang} items={gameItems} promptImages={block.promptImages} />
            )}
          </div>
        )}
        {/* `match`/`reorder`/`cloze`/`groupsort` are built from PAIRS,
            SENTENCES or GROUPS rather than one question at a time — there is
            no single "prompt" card to show this question's own context
            image against, so these four intentionally never render it
            (owner decision 2026-10-16 follow-up, "Varios juegos" image
            scope). `PromptImage`'s own header repeats this for anyone
            landing there first. */}
        {effectiveMode === 'match' && (
          <QuizMatching
            lang={lang}
            items={gameItems}
            seed={block.id}
            nextHref={nextHref}
            guest={guest}
          />
        )}
        {effectiveMode === 'reorder' && (
          <QuizReorder
            lang={lang}
            items={reorderEligible(gameItems)}
            seed={block.id}
            nextHref={nextHref}
            guest={guest}
          />
        )}
        {effectiveMode === 'cloze' && (
          <QuizCloze
            lang={lang}
            payload={payload}
            seed={block.id}
            nextHref={nextHref}
            guest={guest}
          />
        )}
        {effectiveMode === 'groupsort' && (
          <QuizGroupSort
            lang={lang}
            payload={payload}
            seed={block.id}
            nextHref={nextHref}
            guest={guest}
          />
        )}
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
                    <p className="text-sm text-muted-foreground-subtle">{contextBlock.text}</p>
                    <SpeakButton text={contextBlock.text} lang={lang} compact />
                  </div>
                );
              }
              if (contextBlock.kind === 'media') {
                return (
                  <div key={contextBlock.id} className="flex flex-col gap-2">
                    {contextBlock.image && (
                      <FadeImage
                        src={contextBlock.image}
                        alt={contextBlock.alt ?? ''}
                        className="max-h-64 w-full rounded-md object-contain"
                        placeholderClassName="h-40 w-full rounded-md"
                      />
                    )}
                    {contextBlock.audio && <audio controls src={contextBlock.audio} className="w-full" />}
                  </div>
                );
              }
              return null;
            })}

            {/* This question's own DISPLAY-ONLY context image (owner
                decision 2026-10-16, `blocks.ts`'s `QuizBlock.promptImages`)
                — shown above the prompt, not interactive, never through the
                worksheet camera/zoom/stage layer. `undefined` = none, the
                common case. Shared `PromptImage` (`mechanics/PromptImage.tsx`)
                — every slot is visible at once in THIS mode, so it keeps its
                own per-slot `data-testid` rather than the shared default. */}
            <PromptImage image={block.promptImages?.[slot.id]} data-testid={`quiz-slot-prompt-image-${slot.id}`} />

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
              <SlotExplanation text={slot.explanation} testId={`quiz-slot-explanation-${slot.id}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
