/**
 * QuizReorder — "Reordenar" (the `reorder` template's game): one sentence at
 * a time, its words scrambled into large tiles in a tray; the learner drags
 * (or taps) each word into a line, in order, to rebuild the sentence. Mirrors
 * `QuizMatching.tsx`'s own big-stage, game-feel posture (owner spec: "esa
 * cara y movilidad que permite Wordwall"), at WORD granularity instead of
 * pairs — the same idea `QuizAnagram.tsx` already applies at LETTER
 * granularity for a single word.
 *
 * ONE SENTENCE AT A TIME, "1 de N" WITH ‹ ›: unlike `QuizMatching`'s single
 * board holding every pair at once, a long sentence already fills the big
 * stage on its own, so this steps through sentences instead of stacking them.
 * Every sentence's own tray/line state is kept (a dictionary keyed by
 * sentence index), so navigating back with ‹ shows exactly what was left
 * there, not a blank slate.
 *
 * TAP-TO-APPEND, NOT PICK-THEN-PLACE: unlike `QuizMatching`'s two-step tap
 * gesture (there are several slots to choose from), there is only ONE place a
 * tray tile can go — the end of the line — so a single tap/click places it
 * immediately. Tapping a placed tile sends it back to the tray. Dragging a
 * tray tile anywhere onto the line does the same as a tap; this board never
 * asks the learner to drop onto a specific position.
 *
 * SELF-CHECKING, PER SENTENCE ("Comprobar" build item, one Comprobar):
 * `gameModes.ts`'s `SELF_CHECKING_GAME_MODES` includes `'reorder'`, so the
 * page-level combined Comprobar never shows a second one beside this board's
 * own. A correct check settles green and advances to the next sentence (or
 * the final result, on the last one); a wrong check flags the misplaced
 * tiles — which stay in the line, fixable by tapping them back out and
 * re-adding the tray tiles in the right order — rather than evicting them the
 * way `QuizMatching` evicts a wrong PAIR.
 *
 * SHARES THE GAME-FEEL ENGINE (`mechanics/gameFeel.tsx`) and `gameSounds.ts`
 * verbatim with `QuizMatching`/`QuizAnagram` — same lifted-tile look, eased
 * drop, tray reflow, and five sound cues, gated by the same shared mute
 * toggle.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  useDraggable,
  useDroppable,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  type ScreenReaderInstructions,
} from '@dnd-kit/core';
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr/CaretLeft';
import { CaretRightIcon } from '@phosphor-icons/react/dist/ssr/CaretRight';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { seedFromString, shuffleWithSeed, type GameItem } from '@/lib/activities/gameModes';
import { useGameSound } from '@/lib/activities/gameSounds';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import {
  GameSoundToggle,
  gameDropAnimation,
  gameTileTransitionClassName,
  liftedTileClassName,
  useFlip,
  useGameDndSensors,
} from '@/components/islands/mechanics/gameFeel';

export interface QuizReorderProps {
  lang: Lang;
  /** Already filtered through `reorderEligible` by the caller — every item's answer is a sentence of >= 2 words. */
  items: readonly GameItem[];
  /** Stable per-block seed (the block id) — the tray's own shuffle and "Reiniciar". */
  seed: string;
}

/** How long a settled correct sentence stays visible before advancing (ms) — same value `QuizMatching` uses for its own settle. */
const SETTLE_MS = 500;

/** One word of one sentence, with its ORIGINAL (correct) position baked into its id — `${sentenceIndex}-w${wordIndex}`, so checking is a plain id-sequence comparison regardless of repeated words. */
interface WordTile {
  id: string;
  word: string;
}

function tokenize(sentence: string): string[] {
  return sentence.trim().split(/\s+/).filter(Boolean);
}

function tilesFor(sentenceIndex: number, sentence: string): WordTile[] {
  return tokenize(sentence).map((word, i) => ({ id: `${sentenceIndex}-w${i}`, word }));
}

/** A deterministic shuffle that is NEVER the original (correct) order — a sentence must always start scrambled. */
function shuffledOrder(ids: readonly string[], seed: number): string[] {
  if (ids.length < 2) return [...ids];
  const order = shuffleWithSeed(ids, seed);
  if (order.every((id, i) => id === ids[i])) {
    [order[0], order[1]] = [order[1]!, order[0]!];
  }
  return order;
}

type Phase = 'playing' | 'done';

interface ReorderCopy {
  instructions: string;
  pickedUp: (word: string) => string;
  over: (word: string) => string;
  placed: (word: string) => string;
  returned: (word: string) => string;
  cancelled: (word: string) => string;
}

const REORDER_COPY: Record<'es' | 'en', ReorderCopy> = {
  es: {
    instructions:
      'Para colocar una palabra con el teclado: presionar Espacio o Enter para tomarla, y Espacio o Enter otra vez para soltarla al final de la oración. Escape cancela el movimiento. También se puede tocar una palabra para agregarla, y tocar una palabra ya colocada para quitarla.',
    pickedUp: (word) => `Palabra ${word} tomada.`,
    over: (word) => `Palabra ${word} sobre la oración.`,
    placed: (word) => `Palabra ${word} agregada a la oración.`,
    returned: (word) => `Palabra ${word} sin colocar. Vuelve a las palabras disponibles.`,
    cancelled: (word) => `Movimiento cancelado. La palabra ${word} vuelve a las palabras disponibles.`,
  },
  en: {
    instructions:
      'To place a word with the keyboard: press Space or Enter to pick it up, and Space or Enter again to drop it at the end of the sentence. Escape cancels the move. A word can also be tapped to add it, and a placed word tapped to remove it.',
    pickedUp: (word) => `Word ${word} picked up.`,
    over: (word) => `Word ${word} over the sentence.`,
    placed: (word) => `Word ${word} added to the sentence.`,
    returned: (word) => `Word ${word} was not placed. It returns to the available words.`,
    cancelled: (word) => `Move cancelled. Word ${word} returns to the available words.`,
  },
};

/** Shared visual base for every word tile — same "big stage" scale `QuizMatching`'s own `TILE_BASE` uses. */
const TILE_BASE =
  'inline-flex min-h-14 items-center justify-center rounded-md border border-input bg-card px-4 py-3 text-center font-medium text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 text-lg sm:text-xl lg:text-2xl';

interface WordTileButtonProps {
  id: string;
  label: string;
  disabled: boolean;
  dragging: boolean;
  wrong: boolean;
  reducedMotion: boolean;
  draggable: boolean;
  onClick: () => void;
  ariaLabel?: string;
}

function WordTileButton({ id, label, disabled, dragging, wrong, reducedMotion, draggable, onClick, ariaLabel }: WordTileButtonProps) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id, disabled: disabled || !draggable });

  return (
    <button
      type="button"
      ref={draggable ? setNodeRef : undefined}
      data-flip-id={id}
      data-testid={`reorder-tile-${id}`}
      disabled={disabled}
      onClick={onClick}
      {...(draggable ? attributes : {})}
      {...(draggable ? listeners : {})}
      aria-pressed={dragging}
      aria-label={ariaLabel}
      className={cn(
        TILE_BASE,
        draggable && 'touch-none',
        dragging && 'opacity-40',
        wrong && 'animate-pulse border-destructive bg-destructive/10 text-destructive motion-reduce:animate-none',
        gameTileTransitionClassName(reducedMotion),
      )}
    >
      {label}
    </button>
  );
}

export default function QuizReorder({ lang, items, seed }: QuizReorderProps) {
  const t = UI_LABELS[lang].activities.gameModes;
  const reducedMotion = usePrefersReducedMotion();
  const sound = useGameSound();
  const copy = lang === 'es' ? REORDER_COPY.es : REORDER_COPY.en;

  const sentences = useMemo(
    () => items.map((item, i) => tilesFor(i, item.answer)),
    [items],
  );
  const total = sentences.length;

  const [round, setRound] = useState(0);
  const [index, setIndex] = useState(0);
  const [placements, setPlacements] = useState<Record<number, string[]>>({});
  const [wrongFlash, setWrongFlash] = useState<Record<number, ReadonlySet<string>>>({});
  const [solved, setSolved] = useState<ReadonlySet<number>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('playing');
  const [settling, setSettling] = useState<ReadonlySet<number>>(new Set());
  const settleTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const trayRef = useRef<HTMLUListElement | null>(null);

  const trayOrders = useMemo(
    () =>
      sentences.map((tiles, i) =>
        shuffledOrder(
          tiles.map((tile) => tile.id),
          seedFromString(`${seed}:reorder:${round}:${i}`),
        ),
      ),
    [sentences, seed, round],
  );

  function resetAll() {
    if (settleTimeout.current) clearTimeout(settleTimeout.current);
    setRound((r) => r + 1);
    setIndex(0);
    setPlacements({});
    setWrongFlash({});
    setSolved(new Set());
    setActiveId(null);
    setPhase('playing');
    setSettling(new Set());
  }

  // A different block (or its own item list changed) — start fresh.
  useEffect(() => {
    setIndex(0);
    setPlacements({});
    setWrongFlash({});
    setSolved(new Set());
    setActiveId(null);
    setPhase('playing');
    setSettling(new Set());
    // Deliberately keyed on `items` alone, same reasoning `QuizMatching`
    // documents at its own reset effect: a different block always brings a
    // different sentence list too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  useEffect(() => () => {
    if (settleTimeout.current) clearTimeout(settleTimeout.current);
  }, []);

  if (total === 0) return null;

  const tiles = sentences[index] ?? [];
  const tileById = new Map(tiles.map((tile) => [tile.id, tile]));
  const correctSequence = tiles.map((tile) => tile.id);
  const currentPlacements = placements[index] ?? [];
  const placedSet = new Set(currentPlacements);
  const currentWrong = wrongFlash[index] ?? new Set<string>();
  const trayIds = (trayOrders[index] ?? []).filter((id) => !placedSet.has(id));
  const isSolved = solved.has(index);
  const isSettling = settling.has(index);
  const locked = isSolved || isSettling;
  const isComplete = currentPlacements.length === tiles.length && tiles.length > 0;

  useFlip(trayRef, trayIds.join(','), reducedMotion);
  const sensors = useGameDndSensors();

  function itemWord(id: string | number): string | null {
    return tileById.get(String(id))?.word ?? null;
  }

  function appendTile(tileId: string) {
    if (locked) return;
    if (placedSet.has(tileId)) return;
    setPlacements((prev) => ({ ...prev, [index]: [...(prev[index] ?? []), tileId] }));
    setWrongFlash((prev) => {
      if (!prev[index]) return prev;
      const next = { ...prev };
      delete next[index];
      return next;
    });
    sound.play('drop');
  }

  function removeTile(tileId: string) {
    if (locked) return;
    setPlacements((prev) => ({ ...prev, [index]: (prev[index] ?? []).filter((id) => id !== tileId) }));
    setWrongFlash((prev) => {
      if (!prev[index]) return prev;
      const next = { ...prev };
      delete next[index];
      return next;
    });
    sound.play('pickUp');
  }

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(String(active.id));
    sound.play('pickUp');
  }

  const LINE_DROP_ID = `reorder-line-${index}`;

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    if (locked) return;
    const tileId = String(active.id);
    if (over?.id === LINE_DROP_ID) appendTile(tileId);
  }

  function handleDragCancel() {
    setActiveId(null);
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      const word = itemWord(active.id);
      return word ? copy.pickedUp(word) : undefined;
    },
    onDragOver: ({ active, over }) => {
      const word = itemWord(active.id);
      return word && over?.id === LINE_DROP_ID ? copy.over(word) : undefined;
    },
    onDragEnd: ({ active, over }) => {
      const word = itemWord(active.id);
      if (!word) return undefined;
      return over?.id === LINE_DROP_ID ? copy.placed(word) : copy.returned(word);
    },
    onDragCancel: ({ active }) => {
      const word = itemWord(active.id);
      return word ? copy.cancelled(word) : undefined;
    },
  };
  const screenReaderInstructions: ScreenReaderInstructions = { draggable: copy.instructions };

  function handleCheck() {
    if (locked || !isComplete) return;
    const wrongIds = new Set(
      currentPlacements.flatMap((tileId, i) => (tileId === correctSequence[i] ? [] : [tileId])),
    );

    if (wrongIds.size > 0) {
      setWrongFlash((prev) => ({ ...prev, [index]: wrongIds }));
      sound.play('wrong');
      return;
    }

    sound.play('correct');
    setSolved((prev) => new Set(prev).add(index));
    setSettling((prev) => new Set(prev).add(index));

    const settleMs = reducedMotion ? 0 : SETTLE_MS;
    settleTimeout.current = setTimeout(() => {
      setSettling((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
      if (index + 1 < total) {
        setIndex(index + 1);
      } else {
        setPhase('done');
        sound.play('finish');
      }
    }, settleMs);
  }

  const { isOver, setNodeRef: setLineRef } = useDroppable({ id: LINE_DROP_ID, disabled: locked });

  if (phase === 'done') {
    return (
      <div data-testid="quiz-reorder" className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="flex items-center justify-end gap-1">
          <GameSoundToggle
            muted={sound.muted}
            onToggle={sound.toggleMuted}
            labelMute={t.reorderSoundMute}
            labelUnmute={t.reorderSoundUnmute}
          />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center">
          <p
            data-testid="reorder-result"
            aria-live="polite"
            className="text-xl font-medium text-foreground sm:text-2xl"
          >
            {solved.size} {t.reorderResultOf} {total} {t.reorderResultCorrect}
          </p>
          <Button type="button" data-testid="reorder-retry" className="min-h-11" onClick={resetAll}>
            {t.reorderRetry}
          </Button>
        </div>
      </div>
    );
  }

  const activeWord = activeId ? itemWord(activeId) : null;

  return (
    <div data-testid="quiz-reorder" className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          data-testid="reorder-prev"
          aria-label={t.reorderPrev}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
        >
          <CaretLeftIcon aria-hidden="true" />
        </Button>
        <span data-testid="reorder-position" className="text-sm font-medium text-muted-foreground">
          {index + 1} {t.reorderSentenceOf} {total}
        </span>
        <div className="flex items-center gap-1">
          <GameSoundToggle
            muted={sound.muted}
            onToggle={sound.toggleMuted}
            labelMute={t.reorderSoundMute}
            labelUnmute={t.reorderSoundUnmute}
          />
          <Button type="button" variant="outline" size="icon-sm" data-testid="reorder-next" aria-label={t.reorderNext} onClick={() => setIndex((i) => Math.min(total - 1, i + 1))} disabled={index === total - 1}>
            <CaretRightIcon aria-hidden="true" />
          </Button>
        </div>
      </div>

      <DndContext
        id={`dnd-reorder-${seed}`}
        sensors={sensors}
        collisionDetection={closestCenter}
        accessibility={{ announcements, screenReaderInstructions }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-6">
          <ol
            ref={setLineRef}
            data-testid={`reorder-line-${index}`}
            aria-label={t.reorderLineLabel}
            className={cn(
              'flex min-h-20 list-none flex-wrap items-center gap-2 rounded-lg border-2 border-dashed border-input bg-surface-soft p-3 sm:gap-3',
              isOver && !locked && 'border-ring bg-accent/20',
              isSolved && 'border-success-strong bg-success-strong/10',
            )}
          >
            {currentPlacements.length === 0 && (
              <li aria-hidden="true" className="text-sm text-muted-foreground">
                {t.reorderLineEmpty}
              </li>
            )}
            {currentPlacements.map((tileId) => {
              const tile = tileById.get(tileId);
              if (!tile) return null;
              return (
                <li key={tileId}>
                  <WordTileButton
                    id={tileId}
                    label={tile.word}
                    disabled={locked}
                    dragging={false}
                    wrong={currentWrong.has(tileId)}
                    reducedMotion={reducedMotion}
                    draggable={false}
                    onClick={() => removeTile(tileId)}
                    ariaLabel={`${t.reorderRemovePrefix} ${tile.word}`}
                  />
                </li>
              );
            })}
          </ol>

          <ul
            ref={trayRef}
            data-testid="reorder-tray"
            aria-label={t.reorderTrayLabel}
            className="flex list-none flex-wrap gap-3 overflow-x-auto p-0 pb-2 sm:overflow-visible"
          >
            {trayIds.map((id) => {
              const tile = tileById.get(id);
              if (!tile) return null;
              return (
                <li key={id} className="shrink-0">
                  <WordTileButton
                    id={id}
                    label={tile.word}
                    disabled={locked}
                    dragging={activeId === id}
                    wrong={false}
                    reducedMotion={reducedMotion}
                    draggable
                    onClick={() => appendTile(id)}
                  />
                </li>
              );
            })}
          </ul>

          <div className="flex justify-end">
            <Button
              type="button"
              data-testid="reorder-check"
              className="min-h-11"
              onClick={handleCheck}
              disabled={locked || !isComplete}
            >
              {t.reorderCheck}
            </Button>
          </div>
        </div>

        <DragOverlay dropAnimation={gameDropAnimation(reducedMotion)}>
          {activeWord ? (
            <div className={cn(TILE_BASE, 'pointer-events-none', liftedTileClassName(reducedMotion))}>{activeWord}</div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
