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

export interface QuizAnagramProps {
  lang: Lang;
  /** Already filtered through `anagramEligible` by the caller. */
  items: readonly GameItem[];
  /** Stable per-block seed (the block id) — each word's own tile scramble. */
  seed: string;
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

export default function QuizAnagram({ lang, items, seed }: QuizAnagramProps) {
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
        <p className="text-lg font-medium text-foreground">{t.anagramDone}</p>
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
      className="flex flex-col items-center gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <div aria-live="polite" role="status" className="sr-only" data-testid="anagram-live-region">
        {status === 'correct' ? t.anagramCorrectMessage : status === 'wrong' ? t.anagramWrongMessage : ''}
      </div>

      <span data-testid="anagram-counter" className="text-sm text-muted-foreground tabular-nums">
        {t.anagramCounterPrefix} {wordIndex + 1} {t.anagramCounterOf} {items.length}
      </span>

      <p className="flex items-center gap-2 text-center text-base text-zinc-100">
        {current.prompt}
        <SpeakButton text={current.prompt} lang={lang} compact />
      </p>

      <div data-testid="anagram-slots" className="flex flex-wrap justify-center gap-2">
        {tiles.map((_, slotIndex) => {
          const tileId = placed[slotIndex];
          const tile = tileId ? tilesById.get(tileId) : undefined;
          return (
            <div
              key={slotIndex}
              data-testid={`anagram-slot-${slotIndex}`}
              className={cn(
                'flex size-11 items-center justify-center rounded-md border-2 text-lg font-bold uppercase',
                status === 'correct' && 'border-emerald-500 bg-emerald-500/10 text-emerald-300',
                status === 'wrong' && 'animate-pulse border-destructive bg-destructive/10 text-destructive motion-reduce:animate-none',
                status === 'playing' && 'border-border bg-surface-soft text-zinc-100',
              )}
            >
              {tile?.letter ?? ''}
            </div>
          );
        })}
      </div>

      <div data-testid="anagram-tray" className="flex flex-wrap justify-center gap-2">
        {tiles.map((tile) => {
          const used = placed.includes(tile.id);
          return (
            <button
              key={tile.id}
              type="button"
              data-testid={`anagram-tile-${tile.id}`}
              disabled={used || status !== 'playing'}
              onClick={() => placeTile(tile.id)}
              className={cn(
                'flex size-11 items-center justify-center rounded-md border-2 border-border bg-surface-soft text-lg font-bold uppercase text-zinc-100 transition-opacity hover:border-accent-ink/60',
                used && 'opacity-0',
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
