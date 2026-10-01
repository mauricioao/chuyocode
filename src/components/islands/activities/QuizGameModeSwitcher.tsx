/**
 * QuizGameModeSwitcher — the segmented control that swaps a `quiz` block
 * between its games (D1, "Una actividad, muchos juegos"): "Preguntas"
 * (the block's own, always-authored form), "Tarjetas" (flashcards) and
 * "Parejas" (matching). Only the modes {@link GameMode} actually available
 * for THIS block are rendered — `QuizBlockPractice` derives that list via
 * `availableGameModes`, so a two-question block never offers "Parejas" only
 * to fail it.
 *
 * PRESENTATION ONLY: which mode is active, and remembering it per block
 * while the learner stays on the page, both live in the caller
 * (`ActivityPracticeIsland`) — the same lifted-state shape `quizResponses`
 * already uses, so the footer's Comprobar hint can read the active mode too.
 *
 * Visually mirrors `ActivityPracticeIsland`'s own block tab row (same
 * active/inactive classes) so a learner reads both as "a row of switches",
 * not two different controls.
 */
import { ListChecksIcon } from '@phosphor-icons/react/dist/ssr/ListChecks';
import { CardsIcon } from '@phosphor-icons/react/dist/ssr/Cards';
import { ArrowsLeftRightIcon } from '@phosphor-icons/react/dist/ssr/ArrowsLeftRight';
import { CardsThreeIcon } from '@phosphor-icons/react/dist/ssr/CardsThree';
import { CircleNotchIcon } from '@phosphor-icons/react/dist/ssr/CircleNotch';
import { PuzzlePieceIcon } from '@phosphor-icons/react/dist/ssr/PuzzlePiece';
import { KeyboardIcon } from '@phosphor-icons/react/dist/ssr/Keyboard';
import { CheckCircleIcon } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { PackageIcon } from '@phosphor-icons/react/dist/ssr/Package';
import type { GameMode } from '@/lib/activities/gameModes';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export interface QuizGameModeSwitcherProps {
  lang: Lang;
  /** Modes available for this block, in display order — always includes `quiz`. */
  modes: readonly GameMode[];
  active: GameMode;
  onChange: (mode: GameMode) => void;
}

// Partial, not `Record<GameMode, ...>`: the switch template keeps growing
// (D1 "cards"/"match" first, then batch 1's six Wordwall-style games), one
// mode wired in at a time, one commit per mode. Requiring every `GameMode`
// key here would force this file to change the moment `gameModes.ts` adds a
// new union member, even for a mode this component cannot render yet.
// Exported for `QuizLivePreview.tsx`'s own "Estas preguntas se usan en N
// juegos" badge (owner build item 3) — same icon per mode everywhere a game
// mode is named, rather than a second icon map drifting from this one.
export const GAME_MODE_ICONS: Partial<Record<GameMode, typeof ListChecksIcon>> = {
  quiz: ListChecksIcon,
  cards: CardsIcon,
  match: ArrowsLeftRightIcon,
  speak: CardsThreeIcon,
  wheel: CircleNotchIcon,
  anagram: PuzzlePieceIcon,
  hangman: KeyboardIcon,
  truefalse: CheckCircleIcon,
  openbox: PackageIcon,
};

export default function QuizGameModeSwitcher({ lang, modes, active, onChange }: QuizGameModeSwitcherProps) {
  const t = UI_LABELS[lang].activities.gameModes;
  const labels: Partial<Record<GameMode, string>> = {
    quiz: t.modeQuiz,
    cards: t.modeCards,
    match: t.modeMatch,
    speak: t.modeSpeak,
    wheel: t.modeWheel,
    anagram: t.modeAnagram,
    hangman: t.modeHangman,
    truefalse: t.modeTrueFalse,
    openbox: t.modeOpenBox,
  };

  return (
    <div
      data-testid="quiz-game-mode-switcher"
      role="radiogroup"
      aria-label={t.modeQuiz}
      className="flex flex-none flex-wrap items-center gap-1 pb-3"
    >
      {modes.map((mode) => {
        const Icon = GAME_MODE_ICONS[mode];
        const label = labels[mode];
        // A mode not yet wired into this switcher (its own icon/label pair
        // not added here yet) simply does not render a tab — never a blank
        // or mislabeled one.
        if (!Icon || !label) return null;
        const isActive = mode === active;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={isActive}
            data-testid={`quiz-game-mode-${mode}`}
            onClick={() => onChange(mode)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
