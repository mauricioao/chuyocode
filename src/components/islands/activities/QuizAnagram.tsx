/**
 * QuizAnagram — "Anagrama" (batch 1's Wordwall "Anagram"), one of the
 * alternate games a `quiz` block's own questions can be replayed as. Only
 * items whose answer is a single letters-only word survive
 * `gameModes.ts`'s `anagramEligible` filter (this component trusts its
 * caller already applied it — see `QuizBlockPractice`); everything else in
 * the block simply never becomes an anagram.
 *
 * One word at a time: its letters are shuffled into a tray of tiles, tapped
 * (or typed on a physical keyboard) into empty slots in order. The prompt
 * itself is the clue, shown above the slots (with `SpeakButton`, same as
 * every other alternate game here). Completing the slots checks itself
 * immediately — correct turns the slots green and offers "Siguiente
 * palabra"; wrong flashes red and clears back to an empty tray, the SAME
 * "flash then auto-reset" shape `QuizMatching`'s own wrong-pair timeout
 * already uses (worth reusing rather than reinventing a third pattern).
 *
 * SELF-CONTAINED, NOT WIRED INTO THE PAGE'S SCORE — same posture as every
 * sibling in this file's family.
 */
import { useEffect, useMemo, useState } from 'react';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import SpeakButton from '@/lib/speech/SpeakButton';
import { seedFromString, shuffleWithSeed, type GameItem } from '@/lib/activities/gameModes';
import type { PromptImageRef } from '@/lib/activities/blocks';
import PromptImage from '@/components/islands/mechanics/PromptImage';
import { BLANK_EMPTY, BLANK_FILLED, CHIP_MATERIAL, CHIP_PLACED } from '@/components/islands/mechanics/chip';
import { SINGLE_CARD, SINGLE_CARD_META } from '@/components/islands/mechanics/singleCard';

export interface QuizAnagramProps {
  lang: Lang;
  /** Already filtered through `anagramEligible` by the caller. */
  items: readonly GameItem[];
  /** Stable per-block seed (the block id) — each word's own tile scramble. */
  seed: string;
  /** This block's own `promptImages` map (owner decision 2026-10-16 follow-up), keyed by slot id — `undefined` = no question images authored, the common case. Shown as a hint above the puzzle; display-only, see `PromptImage`'s own header. */
  promptImages?: Record<string, PromptImageRef>;
}

/** How long a wrong completion stays flagged before the slots auto-clear (ms) — same value `QuizMatching` uses for its own wrong-pair flash. */
const WRONG_FLASH_MS = 600;

interface Tile {
  id: string;
  letter: string;
}

/** `anagramEligible` checks the TRIMMED answer against `isSingleWord`; trim here too so a stray leading/trailing space never becomes its own tile. */
function tilesFor(word: string, seed: string, wordIndex: number): Tile[] {
  const letters = word.trim().toUpperCase().split('').map((letter, index) => ({ id: `${index}`, letter }));
  return shuffleWithSeed(letters, seedFromString(`${seed}:anagram:${wordIndex}`));
}

export default function QuizAnagram({ lang, items, seed, promptImages }: QuizAnagramProps) {
  const t = UI_LABELS[lang].activities.gameModes;

  const [wordIndex, setWordIndex] = useState(0);
  const [placed, setPlaced] = useState<string[]>([]); // tile ids, in slot order
  const [status, setStatus] = useState<'playing' | 'correct' | 'wrong'>('playing');

  const current = items[wordIndex];
  const tiles = useMemo(() => (current ? tilesFor(current.answer, seed, wordIndex) : []), [current, seed, wordIndex]);
  const tilesById = useMemo(() => new Map(tiles.map((tile) => [tile.id, tile])), [tiles]);

  // A different block (or its own eligible-item list changed) — start over.
  useEffect(() => {
    setWordIndex(0);
    setPlaced([]);
    setStatus('playing');
  }, [items]);

  // A wrong completion flashes red, then clears itself.
  useEffect(() => {
    if (status !== 'wrong') return;
    const id = setTimeout(() => {
      setPlaced([]);
      setStatus('playing');
    }, WRONG_FLASH_MS);
    return () => clearTimeout(id);
  }, [status]);

  function placeTile(tileId: string) {
    if (status !== 'playing') return;
    if (placed.includes(tileId)) return;
    const tile = tilesById.get(tileId);
    if (!tile || !current) return;

    const next = [...placed, tileId];
    setPlaced(next);

    if (next.length === tiles.length) {
      const spelled = next.map((id) => tilesById.get(id)?.letter ?? '').join('');
      setStatus(spelled === current.answer.trim().toUpperCase() ? 'correct' : 'wrong');
    }
  }

  function handleBackspace() {
    if (status !== 'playing') return;
    setPlaced((prev) => prev.slice(0, -1));
  }

  function handleNextWord() {
    setWordIndex((prev) => prev + 1);
    setPlaced([]);
    setStatus('playing');
  }

  function handlePlayAgain() {
    setWordIndex(0);
    setPlaced([]);
    setStatus('playing');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (status !== 'playing') return;
    if (e.key === 'Backspace') {
      e.preventDefault();
      handleBackspace();
      return;
    }
    if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
      const wanted = e.key.toUpperCase();
      const nextTile = tiles.find((tile) => tile.letter === wanted && !placed.includes(tile.id));
      if (nextTile) {
        e.preventDefault();
        placeTile(nextTile.id);
      }
    }
  }

  if (items.length === 0) return null;

  if (!current) {
    return (
      <div data-testid="anagram-done" className="flex flex-col items-center gap-4 py-8 text-center">
        <p className="text-xl font-semibold text-foreground">{t.anagramDone}</p>
        <Button type="button" data-testid="anagram-play-again" onClick={handlePlayAgain}>
          {t.anagramPlayAgain}
        </Button>
      </div>
    );
  }

  return (
    <div
      data-testid="quiz-anagram"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="flex flex-col items-center gap-5 rounded-[26px] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div aria-live="polite" role="status" className="sr-only" data-testid="anagram-live-region">
        {status === 'correct' ? t.anagramCorrectMessage : status === 'wrong' ? t.anagramWrongMessage : ''}
      </div>

      <span data-testid="anagram-counter" className={SINGLE_CARD_META}>
        {t.anagramCounterPrefix} {wordIndex + 1} {t.anagramCounterOf} {items.length}
      </span>

      {/* The clue (image above, prompt below — same order as before) on
          the shared stage card; the puzzle itself sits under it on the
          bare stage, like the drag games' own boards. */}
      <div className={SINGLE_CARD}>
        <PromptImage image={promptImages?.[current.id]} />

        <p className="flex items-center gap-2 text-center text-lg font-semibold text-foreground sm:text-xl">
          {current.prompt}
          <SpeakButton text={current.prompt} lang={lang} compact />
        </p>
      </div>

      {/* Slots: the shared dashed blank while empty, a white raised
          placed chip once filled (`chip.ts`) — correct/wrong keep their
          own semantic tints, the only red/green on this stage. */}
      <div data-testid="anagram-slots" className="flex flex-wrap justify-center gap-2 sm:gap-3">
        {tiles.map((_, slotIndex) => {
          const tileId = placed[slotIndex];
          const tile = tileId ? tilesById.get(tileId) : undefined;
          return (
            <div
              key={slotIndex}
              data-testid={`anagram-slot-${slotIndex}`}
              className={cn(
                'flex size-12 items-center justify-center text-xl font-bold uppercase text-foreground',
                tile ? cn(BLANK_FILLED, CHIP_PLACED) : BLANK_EMPTY,
                status === 'correct' && 'border-success-strong bg-success-strong/10 text-success-strong-foreground shadow-none',
                status === 'wrong' && 'animate-pulse border-destructive bg-destructive/10 text-destructive shadow-none motion-reduce:animate-none',
              )}
            >
              {tile?.letter ?? ''}
            </div>
          );
        })}
      </div>

      <div data-testid="anagram-tray" className="flex flex-wrap justify-center gap-2 sm:gap-3">
        {tiles.map((tile) => {
          const used = placed.includes(tile.id);
          return (
            <button
              key={tile.id}
              type="button"
              data-testid={`anagram-tile-${tile.id}`}
              disabled={used || status !== 'playing'}
              onClick={() => placeTile(tile.id)}
              // The drag games' own grey glass chip (`chip.ts`'s
              // `CHIP_MATERIAL`), one letter wide. A used tile keeps its
              // place in the tray but vanishes — `disabled:opacity-0` too,
              // since the chip's own `disabled:opacity-50` would otherwise
              // win over a plain `opacity-0` on a disabled button.
              className={cn(
                CHIP_MATERIAL,
                'size-12 text-xl font-bold uppercase transition-[opacity,translate] hover:-translate-y-0.5 motion-reduce:transition-none',
                used && 'opacity-0 disabled:opacity-0',
              )}
            >
              {tile.letter}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          type="button"
          variant="outline"
          data-testid="anagram-backspace"
          onClick={handleBackspace}
          disabled={status !== 'playing' || placed.length === 0}
          className="h-11 sm:h-8"
        >
          {t.anagramBackspace}
        </Button>
        {status === 'correct' && (
          <Button type="button" data-testid="anagram-next" onClick={handleNextWord} className="h-11 sm:h-8">
            {t.anagramNext}
          </Button>
        )}
      </div>
    </div>
  );
}
