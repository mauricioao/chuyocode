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
 * COMPACT CONTROL (owner build item 3, "compact game switcher"): up to eight
 * tabs used to render as one wrapping row, which on a phone pushed the game
 * itself half a screen down. Below `lg` this renders ONE Wordwall-style
 * "Parejas ▾" trigger that opens a small dropdown list instead; at `lg` and
 * wider a single row is shown exactly like before ("a single row is fine if
 * it fits" — owner spec). Both are the SAME set of mode buttons (same
 * `data-testid`s, same radiogroup), only reshaped/repositioned by Tailwind's
 * `lg:` classes — never a second, duplicate set of buttons — so a test or a
 * screen reader never sees two controls for the one choice.
 */
import { useEffect, useRef, useState } from 'react';
import { ListChecksIcon } from '@phosphor-icons/react/dist/ssr/ListChecks';
import { CardsIcon } from '@phosphor-icons/react/dist/ssr/Cards';
import { ArrowsLeftRightIcon } from '@phosphor-icons/react/dist/ssr/ArrowsLeftRight';
import { ArrowsDownUpIcon } from '@phosphor-icons/react/dist/ssr/ArrowsDownUp';
import { CardsThreeIcon } from '@phosphor-icons/react/dist/ssr/CardsThree';
import { CircleNotchIcon } from '@phosphor-icons/react/dist/ssr/CircleNotch';
import { PuzzlePieceIcon } from '@phosphor-icons/react/dist/ssr/PuzzlePiece';
import { KeyboardIcon } from '@phosphor-icons/react/dist/ssr/Keyboard';
import { CheckCircleIcon } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { PackageIcon } from '@phosphor-icons/react/dist/ssr/Package';
import { BracketsSquareIcon } from '@phosphor-icons/react/dist/ssr/BracketsSquare';
import { CaretDownIcon } from '@phosphor-icons/react/dist/ssr/CaretDown';
import { SquaresFourIcon } from '@phosphor-icons/react/dist/ssr/SquaresFour';
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
  reorder: ArrowsDownUpIcon,
  speak: CardsThreeIcon,
  wheel: CircleNotchIcon,
  anagram: PuzzlePieceIcon,
  hangman: KeyboardIcon,
  truefalse: CheckCircleIcon,
  openbox: PackageIcon,
  cloze: BracketsSquareIcon,
  groupsort: SquaresFourIcon,
};

export default function QuizGameModeSwitcher({ lang, modes, active, onChange }: QuizGameModeSwitcherProps) {
  const t = UI_LABELS[lang].activities.gameModes;
  const labels: Partial<Record<GameMode, string>> = {
    quiz: t.modeQuiz,
    cards: t.modeCards,
    match: t.modeMatch,
    reorder: t.modeReorder,
    speak: t.modeSpeak,
    wheel: t.modeWheel,
    anagram: t.modeAnagram,
    hangman: t.modeHangman,
    truefalse: t.modeTrueFalse,
    openbox: t.modeOpenBox,
    cloze: t.modeCloze,
    groupsort: t.modeGroupSort,
  };

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close the compact dropdown (mobile) on Escape or an outside click — same
  // posture `UserMenu.tsx`'s own dropdown uses.
  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  const ActiveIcon = GAME_MODE_ICONS[active];
  const activeLabel = labels[active];

  return (
    <div ref={containerRef} className="relative flex-none pb-3">
      {/* Compact trigger — phones and anything narrower than `lg` (owner
          build item 3): "Parejas ▾", Wordwall's own "Cambiar plantilla"
          shape. Opens the SAME mode list below as a dropdown. */}
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid="quiz-game-mode-compact-trigger"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm font-medium text-foreground lg:hidden"
      >
        {ActiveIcon && <ActiveIcon aria-hidden="true" />}
        <span>{activeLabel}</span>
        <CaretDownIcon aria-hidden="true" className={cn('transition-transform', open && 'rotate-180')} />
      </button>

      {/* The mode buttons themselves — ONE set, reshaped by `lg:` rather
          than duplicated: a wrapping row at `lg` and up (unchanged from
          before this build item — "a single row is fine if it fits"), or
          (below `lg`) a dropdown panel shown only while `open`. */}
      <div
        data-testid="quiz-game-mode-switcher"
        role="radiogroup"
        aria-label={t.modeQuiz}
        className={cn(
          'flex-col gap-0.5',
          open
            ? 'absolute z-20 mt-1 flex min-w-40 rounded-md border border-border bg-background p-1 shadow-lg'
            : 'hidden',
          'lg:static lg:z-auto lg:mt-0 lg:flex lg:w-auto lg:min-w-0 lg:flex-row lg:flex-wrap lg:items-center lg:gap-1 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none',
        )}
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
              onClick={() => {
                onChange(mode);
                setOpen(false);
              }}
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
    </div>
  );
}
