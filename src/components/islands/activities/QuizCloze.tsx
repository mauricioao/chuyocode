/**
 * QuizCloze — "Completar la frase" (the `cloze` template's game): one
 * sentence at a time, every one of its blanks shown INLINE in the running
 * text as its own drop target, with a single shared word bank below —
 * every blank word across the WHOLE activity plus the author's distractors,
 * shuffled together, so a word may serve one sentence and confuse another
 * (Wordwall-like, owner spec). Mirrors `QuizReorder.tsx`'s own big-stage,
 * one-sentence-at-a-time posture ("1 de N" with ‹ ›) and `QuizMatching.tsx`'s
 * own multi-target board (several independent drop zones at once) —
 * combined, since a cloze sentence can have more than one blank.
 *
 * REUSES THE REAL `drop` MECHANIC'S OWN STATE RULES (`exerciseDrop.ts`)
 * rather than re-deriving them: this game's whole state is one
 * `ExerciseResponse` exactly like the real exercise island keeps, so
 * `claimedTileIds`/`availableTiles`/`placeTile` already express "a tile
 * claimed by any blank across the whole activity is not in the tray" with
 * zero duplicated logic.
 *
 * TAP-TO-PLACE, SAME GESTURE AS `DropRenderer.tsx`: tap a tray tile to pick
 * it up, tap an empty blank to place it there, tap a FILLED blank (with
 * nothing picked) to send its word back to the tray. Dragging a tray tile
 * onto a blank does the same as picking it up and tapping that blank.
 *
 * SELF-CHECKING, PER SENTENCE: `gameModes.ts`'s `SELF_CHECKING_GAME_MODES`
 * includes `'cloze'`, so the page-level combined Comprobar never shows a
 * second one beside this board's own. A correct check settles green and
 * advances (or shows the final result on the last sentence); a wrong check
 * flags the misplaced blanks — which stay filled, fixable by placing a new
 * tile over them — rather than evicting them.
 *
 * SHARES THE GAME-FEEL ENGINE (`mechanics/gameFeel.tsx`) and `gameSounds.ts`
 * verbatim with `QuizMatching`/`QuizReorder` — same lifted-tile look, eased
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
import type { ExerciseResponse, Payload, PoolItem } from '@/lib/exercisePayload';
import { availableTiles, claimedTileIds, placeTile } from '@/lib/exerciseDrop';
import { deriveClozeGameSentences } from '@/lib/activities/clozeSentences';
import { seedFromString, shuffleWithSeed } from '@/lib/activities/gameModes';
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
import {
  TILE_MIN_HEIGHT_SCALE,
  TILE_PADDING_X_SCALE,
  TILE_PADDING_Y_SCALE,
  TILE_TEXT_SCALE,
} from '@/components/islands/mechanics/scale';

export interface QuizClozeProps {
  lang: Lang;
  /** The whole block's own payload — every blank's answer lives in `payload.slots`, every tile (blanks + distractors) in its shared pool. */
  payload: Payload;
  /** Stable per-block seed (the block id) — the tray's own shuffle and "Reiniciar". */
  seed: string;
}

/** How long a settled correct sentence stays visible before advancing (ms) — same value `QuizMatching`/`QuizReorder` use for their own settle. */
const SETTLE_MS = 500;

/** `useDroppable` id prefix for one blank — `${BLANK_DROP_PREFIX}${slotId}`. */
const BLANK_DROP_PREFIX = 'cloze-blank-';

type Phase = 'playing' | 'done';

interface ClozeCopy {
  instructions: string;
  pickedUp: (word: string) => string;
  over: (word: string) => string;
  placed: (word: string) => string;
  returned: (word: string) => string;
  cancelled: (word: string) => string;
}

const CLOZE_COPY: Record<'es' | 'en', ClozeCopy> = {
  es: {
    instructions:
      'Para colocar una palabra con el teclado: presionar Espacio o Enter para tomarla, y Espacio o Enter otra vez sobre el espacio en blanco para soltarla ahí. Escape cancela el movimiento. También se puede tocar una palabra para tomarla y tocar un espacio en blanco para colocarla, o tocar un espacio ya lleno para quitarla.',
    pickedUp: (word) => `Palabra ${word} tomada.`,
    over: (word) => `Palabra ${word} sobre un espacio en blanco.`,
    placed: (word) => `Palabra ${word} colocada.`,
    returned: (word) => `Palabra ${word} sin colocar. Vuelve a las palabras disponibles.`,
    cancelled: (word) => `Movimiento cancelado. La palabra ${word} vuelve a las palabras disponibles.`,
  },
  en: {
    instructions:
      'To place a word with the keyboard: press Space or Enter to pick it up, and Space or Enter again over a blank to drop it there. Escape cancels the move. A word can also be tapped to pick it up and a blank tapped to place it, or an already filled blank tapped to remove it.',
    pickedUp: (word) => `Word ${word} picked up.`,
    over: (word) => `Word ${word} over a blank.`,
    placed: (word) => `Word ${word} placed.`,
    returned: (word) => `Word ${word} was not placed. It returns to the available words.`,
    cancelled: (word) => `Move cancelled. Word ${word} returns to the available words.`,
  },
};

/** Shared visual base for one word tile — the shared "big stage" scale (`mechanics/scale.ts`), same recipe every sibling game uses. */
const TILE_BASE = cn(
  'inline-flex items-center justify-center rounded-md border border-input bg-card text-center font-medium text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
  TILE_MIN_HEIGHT_SCALE,
  TILE_PADDING_X_SCALE,
  TILE_PADDING_Y_SCALE,
  TILE_TEXT_SCALE,
);

interface ClozeTileButtonProps {
  id: string;
  label: string;
  disabled: boolean;
  dragging: boolean;
  picked: boolean;
  reducedMotion: boolean;
  onClick: () => void;
}

function ClozeTileButton({ id, label, disabled, dragging, picked, reducedMotion, onClick }: ClozeTileButtonProps) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id, disabled });

  return (
    <button
      type="button"
      ref={setNodeRef}
      data-flip-id={id}
      data-testid={`cloze-tile-${id}`}
      disabled={disabled}
      onClick={onClick}
      {...attributes}
      {...listeners}
      aria-pressed={dragging || picked}
      className={cn(
        TILE_BASE,
        'touch-none',
        dragging && 'opacity-40',
        picked && !dragging && 'ring-2 ring-ring',
        gameTileTransitionClassName(reducedMotion),
      )}
    >
      {label}
    </button>
  );
}

interface ClozeBlankBoxProps {
  slotId: string;
  tile: PoolItem | null;
  disabled: boolean;
  wrong: boolean;
  canPlacePicked: boolean;
  reducedMotion: boolean;
  onClick: () => void;
  emptyLabel: string;
  removeLabel: string;
}

function ClozeBlankBox({
  slotId,
  tile,
  disabled,
  wrong,
  canPlacePicked,
  reducedMotion,
  onClick,
  emptyLabel,
  removeLabel,
}: ClozeBlankBoxProps) {
  const { isOver, setNodeRef } = useDroppable({ id: `${BLANK_DROP_PREFIX}${slotId}`, disabled });

  return (
    <button
      type="button"
      ref={setNodeRef}
      data-testid={`cloze-blank-${slotId}`}
      data-filled={tile ? 'true' : undefined}
      data-over={isOver ? 'true' : undefined}
      onClick={onClick}
      disabled={disabled}
      aria-label={tile ? removeLabel : emptyLabel}
      className={cn(
        'mx-1 inline-flex min-w-24 items-center justify-center rounded-md border align-middle font-medium',
        TILE_MIN_HEIGHT_SCALE,
        TILE_PADDING_X_SCALE,
        TILE_PADDING_Y_SCALE,
        TILE_TEXT_SCALE,
        tile ? 'border-input bg-card text-foreground' : 'border-dashed border-input bg-surface-soft text-muted-foreground',
        isOver && !disabled && 'border-ring bg-accent/20',
        !tile && canPlacePicked && !disabled && 'border-ring bg-accent/10',
        wrong && 'animate-pulse border-destructive bg-destructive/10 text-destructive motion-reduce:animate-none',
        gameTileTransitionClassName(reducedMotion),
      )}
    >
      {tile ? (tile.text ?? tile.id) : '___'}
    </button>
  );
}

export default function QuizCloze({ lang, payload, seed }: QuizClozeProps) {
  const t = UI_LABELS[lang].activities.gameModes;
  const reducedMotion = usePrefersReducedMotion();
  const sound = useGameSound();
  const copy = lang === 'es' ? CLOZE_COPY.es : CLOZE_COPY.en;

  const sentences = useMemo(() => deriveClozeGameSentences(payload), [payload]);
  const total = sentences.length;

  const bySlotId = useMemo(() => new Map(payload.slots.map((s) => [s.id, s])), [payload]);
  const poolName = useMemo(() => payload.slots.find((s) => s.input === 'drop')?.pool, [payload]);
  const poolItems = useMemo<PoolItem[]>(() => (poolName ? (payload.pools[poolName] ?? []) : []), [payload, poolName]);
  const itemById = useMemo(() => new Map(poolItems.map((item) => [item.id, item])), [poolItems]);

  const [round, setRound] = useState(0);
  const [index, setIndex] = useState(0);
  const [response, setResponse] = useState<ExerciseResponse>({});
  const [wrongSlots, setWrongSlots] = useState<ReadonlySet<string>>(new Set());
  const [solved, setSolved] = useState<ReadonlySet<number>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('playing');
  const [settling, setSettling] = useState<ReadonlySet<number>>(new Set());
  const settleTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const trayRef = useRef<HTMLUListElement | null>(null);

  function resetAll() {
    if (settleTimeout.current) clearTimeout(settleTimeout.current);
    setRound((r) => r + 1);
    setIndex(0);
    setResponse({});
    setWrongSlots(new Set());
    setSolved(new Set());
    setActiveId(null);
    setPickedId(null);
    setPhase('playing');
    setSettling(new Set());
  }

  // A different block (or its own content changed) — start fresh.
  useEffect(() => {
    setIndex(0);
    setResponse({});
    setWrongSlots(new Set());
    setSolved(new Set());
    setActiveId(null);
    setPickedId(null);
    setPhase('playing');
    setSettling(new Set());
    // Deliberately keyed on `payload` alone, same reasoning `QuizMatching`/
    // `QuizReorder` document at their own reset effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload]);

  useEffect(
    () => () => {
      if (settleTimeout.current) clearTimeout(settleTimeout.current);
    },
    [],
  );

  const trayOrder = useMemo(
    () => shuffleWithSeed(poolItems.map((item) => item.id), seedFromString(`${seed}:cloze:${round}`)),
    [poolItems, seed, round],
  );

  if (total === 0) return null;

  const sentence = sentences[index]!;
  const isSolved = solved.has(index);
  const isSettling = settling.has(index);
  const locked = isSolved || isSettling;
  const isComplete = sentence.blankSlotIds.every((slotId) => (response[slotId]?.length ?? 0) > 0);

  const availableIds = new Set(
    availableTiles(poolItems, [], claimedTileIds(payload, response, '')).map((item) => item.id),
  );
  const trayIds = trayOrder.filter((id) => availableIds.has(id));

  useFlip(trayRef, trayIds.join(','), reducedMotion);
  const sensors = useGameDndSensors();

  function wordFor(id: string | number): string | null {
    return itemById.get(String(id))?.text ?? null;
  }

  function place(slotId: string, tileId: string) {
    if (locked) return;
    const current = response[slotId] ?? [];
    const { value } = placeTile(current, tileId);
    setResponse((prev) => ({ ...prev, [slotId]: value }));
    setWrongSlots((prev) => {
      if (!prev.has(slotId)) return prev;
      const next = new Set(prev);
      next.delete(slotId);
      return next;
    });
    setPickedId(null);
    sound.play('drop');
  }

  function clearBlank(slotId: string) {
    if (locked) return;
    setResponse((prev) => ({ ...prev, [slotId]: [] }));
    setWrongSlots((prev) => {
      if (!prev.has(slotId)) return prev;
      const next = new Set(prev);
      next.delete(slotId);
      return next;
    });
    sound.play('pickUp');
  }

  function handleTrayTileClick(tileId: string) {
    if (locked) return;
    setPickedId((prev) => (prev === tileId ? null : tileId));
  }

  function handleBlankClick(slotId: string) {
    if (locked) return;
    if (pickedId) {
      place(slotId, pickedId);
      return;
    }
    if ((response[slotId]?.length ?? 0) > 0) clearBlank(slotId);
  }

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(String(active.id));
    sound.play('pickUp');
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    if (locked) return;
    const overId = over?.id !== undefined ? String(over.id) : null;
    if (!overId?.startsWith(BLANK_DROP_PREFIX)) return;
    place(overId.slice(BLANK_DROP_PREFIX.length), String(active.id));
  }

  function handleDragCancel() {
    setActiveId(null);
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      const word = wordFor(active.id);
      return word ? copy.pickedUp(word) : undefined;
    },
    onDragOver: ({ active, over }) => {
      const word = wordFor(active.id);
      const overId = over?.id !== undefined ? String(over.id) : null;
      return word && overId?.startsWith(BLANK_DROP_PREFIX) ? copy.over(word) : undefined;
    },
    onDragEnd: ({ active, over }) => {
      const word = wordFor(active.id);
      if (!word) return undefined;
      const overId = over?.id !== undefined ? String(over.id) : null;
      return overId?.startsWith(BLANK_DROP_PREFIX) ? copy.placed(word) : copy.returned(word);
    },
    onDragCancel: ({ active }) => {
      const word = wordFor(active.id);
      return word ? copy.cancelled(word) : undefined;
    },
  };
  const screenReaderInstructions: ScreenReaderInstructions = { draggable: copy.instructions };

  function handleCheck() {
    if (locked || !isComplete) return;
    const wrong = new Set<string>();
    for (const slotId of sentence.blankSlotIds) {
      const slot = bySlotId.get(slotId);
      const given = response[slotId]?.[0];
      if (!slot || given !== slot.answer[0]) wrong.add(slotId);
    }

    if (wrong.size > 0) {
      setWrongSlots(wrong);
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

  if (phase === 'done') {
    return (
      <div data-testid="quiz-cloze" className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="flex items-center justify-end gap-1">
          <GameSoundToggle
            muted={sound.muted}
            onToggle={sound.toggleMuted}
            labelMute={t.clozeSoundMute}
            labelUnmute={t.clozeSoundUnmute}
          />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center">
          <p data-testid="cloze-result" aria-live="polite" className="text-xl font-medium text-foreground sm:text-2xl">
            {solved.size} {t.clozeResultOf} {total} {t.clozeResultCorrect}
          </p>
          <Button type="button" data-testid="cloze-retry" className="min-h-11" onClick={resetAll}>
            {t.clozeRetry}
          </Button>
        </div>
      </div>
    );
  }

  const activeWord = activeId ? wordFor(activeId) : null;

  return (
    <div data-testid="quiz-cloze" className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          data-testid="cloze-prev"
          aria-label={t.clozePrev}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
        >
          <CaretLeftIcon aria-hidden="true" />
        </Button>
        <span data-testid="cloze-position" className="text-sm font-medium text-muted-foreground">
          {index + 1} {t.clozeSentenceOf} {total}
        </span>
        <div className="flex items-center gap-1">
          <GameSoundToggle
            muted={sound.muted}
            onToggle={sound.toggleMuted}
            labelMute={t.clozeSoundMute}
            labelUnmute={t.clozeSoundUnmute}
          />
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            data-testid="cloze-next"
            aria-label={t.clozeNext}
            onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
            disabled={index === total - 1}
          >
            <CaretRightIcon aria-hidden="true" />
          </Button>
        </div>
      </div>

      <DndContext
        id={`dnd-cloze-${seed}`}
        sensors={sensors}
        collisionDetection={closestCenter}
        accessibility={{ announcements, screenReaderInstructions }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {/* `justify-center`: one sentence at a time is naturally short —
            center it in the stage's own available height instead of
            pinning to the top and leaving the rest empty (visual-polish
            pass), same reasoning `QuizMatching`'s own content wrapper
            documents. */}
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-6">
          <p
            // `cloze-game-sentence-*`, not `cloze-sentence-*`: `ClozeEditor.tsx`'s
            // own authoring row already owns that prefix (its bracket-text
            // input), and this game can render right beside it in
            // `QuizLivePreview` — two different elements must never share one
            // test id.
            data-testid={`cloze-game-sentence-${sentence.seq}`}
            className={cn(
              'rounded-lg border-2 border-dashed border-input bg-surface-soft p-4 leading-loose font-medium text-foreground',
              TILE_TEXT_SCALE,
              isSolved && 'border-success-strong bg-success-strong/10',
            )}
          >
            {sentence.segments.map((seg, i) => {
              if (seg.kind === 'text') return <span key={i}>{seg.text}</span>;
              const slotId = seg.slotId as string;
              const tileId = response[slotId]?.[0];
              const tile = tileId ? (itemById.get(tileId) ?? null) : null;
              return (
                <ClozeBlankBox
                  key={slotId}
                  slotId={slotId}
                  tile={tile}
                  disabled={locked}
                  wrong={wrongSlots.has(slotId)}
                  canPlacePicked={pickedId !== null}
                  reducedMotion={reducedMotion}
                  onClick={() => handleBlankClick(slotId)}
                  emptyLabel={t.clozeBlankEmpty}
                  removeLabel={`${t.clozeRemovePrefix} ${tile?.text ?? ''}`.trim()}
                />
              );
            })}
          </p>

          <ul
            ref={trayRef}
            data-testid="cloze-tray"
            aria-label={t.clozeTrayLabel}
            className="flex list-none flex-wrap gap-3 overflow-x-auto p-0 pb-2 sm:overflow-visible"
          >
            {trayIds.map((id) => {
              const item = itemById.get(id);
              if (!item) return null;
              return (
                <li key={id} className="shrink-0">
                  <ClozeTileButton
                    id={id}
                    label={item.text ?? item.id}
                    disabled={locked}
                    dragging={activeId === id}
                    picked={pickedId === id}
                    reducedMotion={reducedMotion}
                    onClick={() => handleTrayTileClick(id)}
                  />
                </li>
              );
            })}
          </ul>

          <div className="flex justify-end">
            <Button
              type="button"
              data-testid="cloze-check"
              className="min-h-11"
              onClick={handleCheck}
              disabled={locked || !isComplete}
            >
              {t.clozeCheck}
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
