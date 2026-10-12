/**
 * QuizMatching — "Parejas" (the `match` template's game), the big
 * drag-and-drop matching board (game-feel pass, owner spec: "quiero esa
 * cara y movilidad que permite Wordwall... nuestros juegos deben ser igual
 * grandes"). Prompts sit in one tall column, each with its own empty slot;
 * the shuffled answers sit in a tray below as large tiles. Drag a tile onto
 * a prompt's slot (or, on touch/keyboard, tap one tile then tap a slot) —
 * a placed tile can be dragged, or tapped, back out. "Comprobar" grades the
 * current attempt once: correct pairs settle green, wrong ones bounce back
 * to the tray, and the board then shows a calm final score with
 * "Reintentar" — no further retries of a single wrong pair, no timer, no
 * leaderboard (owner spec: "mantenlo simple").
 *
 * SELF-CONTAINED, NOT WIRED INTO THE PAGE'S SCORE — same posture as every
 * other alternate game here: a "Parejas" round is local component state,
 * gone on unmount, and never touches `quizResponses`/`quizResults`.
 *
 * GAME-FEEL ENGINE (`mechanics/gameFeel.tsx`, shared with the next
 * drag-based templates): a `DragOverlay` tile tracks the pointer, lifted
 * (scale + shadow) via `liftedTileClassName`, with an eased snap/return via
 * `gameDropAnimation`; the tray reflows remaining tiles with `useFlip`. Both
 * fall back to instant, unscaled moves under `prefers-reduced-motion`.
 * `gameSounds.ts` supplies the five cues (pick-up/drop/correct/wrong/
 * finish), gated by the shared mute toggle (`GameSoundToggle`, sound ON by
 * default, persisted in `localStorage`).
 *
 * dnd-kit's `KeyboardSensor` stays wired for parity with `DropRenderer.tsx`,
 * but the PRACTICAL keyboard path is tap-to-place: every tray tile, placed
 * tile and empty slot is a real `<button>`, reachable by Tab and activated
 * by Space/Enter, exactly like `DropRenderer`'s own mobile-layout tap
 * gesture — which also makes this board fully operable without ever
 * starting a dnd-kit drag at all.
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
import { BLANK_EMPTY, BLANK_FILLED, CHIP_PLACED, CHIP_STAGE } from '@/components/islands/mechanics/chip';
import {
  FLOATING_CHECK_BAR_CLASS,
  FLOATING_CHECK_BAR_EDITOR_OFFSET,
  PROMPT_SCALE,
  STAGE_BOTTOM_RESERVE_CLASS,
  STAGE_TWO_COL_GRID,
  TILE_MIN_HEIGHT_SCALE,
} from '@/components/islands/mechanics/scale';

/** Past this many pairs, the prompt list switches to {@link STAGE_TWO_COL_GRID} on a wide stage — see that token's own header. */
const MANY_PAIRS_THRESHOLD = 4;

export interface QuizMatchingProps {
  lang: Lang;
  items: readonly GameItem[];
  /** Stable per-block seed (the block id) — `shuffleWithSeed`'s own input for the tray and "Reiniciar". */
  seed: string;
  /** True only inside the activity editor's own live preview (`QuizLivePreview`) — offsets the floating Comprobar/Reintentar further left so it clears `EditorSideToolbar`'s docked rail (build item 5). Defaults to `false` for every practice/full-screen caller, which has no such toolbar. */
  editorOffset?: boolean;
}

/** How long correct/wrong settle visually before the board switches to the final result (ms). */
const SETTLE_MS = 500;

/** The droppable slot id for a given prompt — a fixed suffix so `onDragEnd` can resolve it back to a prompt id. */
const SLOT_SUFFIX = '::slot';
function slotIdFor(promptId: string): string {
  return `${promptId}${SLOT_SUFFIX}`;
}
function promptIdFromSlot(dropId: string): string | null {
  return dropId.endsWith(SLOT_SUFFIX) ? dropId.slice(0, -SLOT_SUFFIX.length) : null;
}

type Phase = 'playing' | 'checking' | 'done';

/**
 * Screen-reader sentences for the board's drag gesture — LOCAL, not
 * `UI_LABELS`, same reasoning `DropRenderer.tsx`'s own `DROP_COPY` gives:
 * whole sentences read once on focus, not short chrome labels.
 */
interface MatchCopy {
  instructions: string;
  pickedUp: (tile: string) => string;
  over: (tile: string, prompt: string) => string;
  dropped: (tile: string, prompt: string) => string;
  displaced: (tile: string) => string;
  returned: (tile: string) => string;
  cancelled: (tile: string) => string;
}

const MATCH_COPY: Record<'es' | 'en', MatchCopy> = {
  es: {
    instructions:
      'Para colocar una ficha con el teclado: presionar Espacio o Enter para tomarla, las flechas para moverla, y Espacio o Enter otra vez para soltarla. Escape cancela el movimiento. También se puede tocar una ficha y luego tocar una casilla.',
    pickedUp: (tile) => `Ficha ${tile} tomada.`,
    over: (tile, prompt) => `Ficha ${tile} sobre la casilla de "${prompt}".`,
    dropped: (tile, prompt) => `Ficha ${tile} colocada en la casilla de "${prompt}".`,
    displaced: (tile) => `La ficha ${tile} vuelve a las fichas disponibles.`,
    returned: (tile) => `Ficha ${tile} sin colocar. Vuelve a las fichas disponibles.`,
    cancelled: (tile) => `Movimiento cancelado. La ficha ${tile} vuelve a las fichas disponibles.`,
  },
  en: {
    instructions:
      'To place a tile with the keyboard: press Space or Enter to pick it up, the arrow keys to move it, and Space or Enter again to drop it. Escape cancels the move. A tile can also be tapped, then a slot tapped to place it.',
    pickedUp: (tile) => `Tile ${tile} picked up.`,
    over: (tile, prompt) => `Tile ${tile} over the slot for "${prompt}".`,
    dropped: (tile, prompt) => `Tile ${tile} placed in the slot for "${prompt}".`,
    displaced: (tile) => `Tile ${tile} returns to the available tiles.`,
    returned: (tile) => `Tile ${tile} was not placed. It returns to the available tiles.`,
    cancelled: (tile) => `Move cancelled. Tile ${tile} returns to the available tiles.`,
  },
};

function shuffledTray(items: readonly GameItem[], seed: string, round: number): string[] {
  return shuffleWithSeed(
    items.map((item) => item.id),
    seedFromString(`${seed}:match:${round}`),
  );
}

/**
 * Shared grey-glass-capsule tile, every sibling drag mechanic's own recipe
 * (`mechanics/chip.ts`) — a tray tile sits at rest, hugging its own label;
 * `className` below layers {@link CHIP_PLACED} on once it is placed or
 * tap-picked, and `MatchSlot` adds `w-full` ITSELF only for the tile that
 * has actually landed in a slot (so the chip fills the target it was
 * dropped into, same as `DropRenderer`'s own filled box) — never here,
 * where it would force every tray tile to one shared fixed width again
 * (owner bug: "agua" clipped off a 390px tray because every chip, short or
 * long, was stretched to the same ~245px box).
 */
const TILE_BASE = CHIP_STAGE;

interface MatchTileProps {
  id: string;
  label: string;
  disabled: boolean;
  picked: boolean;
  dragging: boolean;
  reducedMotion: boolean;
  onClick: () => void;
  ariaLabel?: string;
  className?: string;
}

/** A draggable tile — a real `<button>`, usable by drag, tap-to-place and the keyboard alike. */
function MatchTile({ id, label, disabled, picked, dragging, reducedMotion, onClick, ariaLabel, className }: MatchTileProps) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id, disabled });

  return (
    <button
      type="button"
      ref={setNodeRef}
      data-flip-id={id}
      data-testid={`matching-tile-${id}`}
      disabled={disabled}
      onClick={onClick}
      {...attributes}
      {...listeners}
      // AFTER the spreads, deliberately: dnd-kit's own `attributes` already
      // sets `aria-pressed` (true only while a REAL drag is in flight,
      // `undefined` otherwise), which would silently erase ours if it came
      // first — same reasoning `DropRenderer.tsx`'s own `PoolTile` documents.
      // Tap-picked and mid-drag are the same ARIA concept from a screen
      // reader's point of view, so this merges both rather than picking one.
      aria-pressed={picked || dragging}
      aria-label={ariaLabel}
      className={cn(
        TILE_BASE,
        'touch-none',
        dragging && 'opacity-40',
        picked && !dragging && cn(CHIP_PLACED, 'ring-2 ring-ring'),
        gameTileTransitionClassName(reducedMotion),
        className,
      )}
    >
      {label}
    </button>
  );
}

interface MatchSlotProps {
  promptId: string;
  tile: GameItem | null;
  locked: boolean;
  wrong: boolean;
  disabled: boolean;
  canPlacePicked: boolean;
  onPlacePicked: () => void;
  onRemove: () => void;
  reducedMotion: boolean;
  dragging: boolean;
  emptyLabel: string;
  removeLabel: string;
}

/** The drop target next to a prompt — empty (a tap target once a tile is picked) or holding a tile (a tap target to remove it). */
function MatchSlot({
  promptId,
  tile,
  locked,
  wrong,
  disabled,
  canPlacePicked,
  onPlacePicked,
  onRemove,
  reducedMotion,
  dragging,
  emptyLabel,
  removeLabel,
}: MatchSlotProps) {
  const { isOver, setNodeRef } = useDroppable({ id: slotIdFor(promptId), disabled: disabled || locked });

  return (
    <span
      ref={setNodeRef}
      data-testid={`matching-slot-${promptId}`}
      data-over={isOver ? 'true' : undefined}
      data-filled={tile ? 'true' : undefined}
      className={cn(
        'inline-flex min-w-32 flex-1 sm:min-w-48',
        TILE_MIN_HEIGHT_SCALE,
        tile ? cn('items-stretch', BLANK_FILLED) : cn('items-center justify-center', BLANK_EMPTY),
        isOver && !locked && 'border-ring bg-accent/30',
        !tile && canPlacePicked && 'border-ring bg-accent/20',
        locked && 'border-success-strong bg-success-strong/10',
        wrong && 'animate-pulse border-destructive bg-destructive/10 motion-reduce:animate-none',
      )}
    >
      {tile ? (
        <MatchTile
          id={tile.id}
          label={tile.answer}
          disabled={disabled || locked}
          picked={false}
          dragging={dragging}
          reducedMotion={reducedMotion}
          onClick={onRemove}
          ariaLabel={`${removeLabel} ${tile.answer}`}
          // `w-full`: the ONE place a chip is stretched — a tile that has
          // landed in its slot fills that target completely, same as
          // `DropRenderer`'s own filled box (`TILE_BASE` itself never
          // forces a width, see that token's own header).
          className={cn('border-0 w-full', CHIP_PLACED, locked && 'text-success-strong-foreground')}
        />
      ) : (
        <button
          type="button"
          data-testid={`matching-slot-button-${promptId}`}
          aria-label={emptyLabel}
          onClick={onPlacePicked}
          disabled={disabled || !canPlacePicked}
          // `min-h-11` (44px) is a FLOOR, not decoration (bug found while
          // auditing tap-to-place): `h-full` on a flex item with no own
          // content percentage-resolves to 0 against this span's own
          // `auto` height (the min-height CLAMP that visually sizes the
          // span is not a `height` the percentage can resolve against), so
          // this empty-slot tap target silently had ZERO hit area — every
          // mouse/touch tap on an empty slot missed. `DropRenderer`'s own
          // empty box never hit this because its hint text gives the
          // button real content to size from; this one has none. The
          // floor also satisfies the owner's own "≥44px tap target" bar.
          className="flex h-full min-h-11 w-full items-center justify-center bg-transparent p-0"
        />
      )}
    </span>
  );
}

export default function QuizMatching({ lang, items, seed, editorOffset = false }: QuizMatchingProps) {
  const t = UI_LABELS[lang].activities.gameModes;
  const reducedMotion = usePrefersReducedMotion();
  const sound = useGameSound();
  const copy = lang === 'es' ? MATCH_COPY.es : MATCH_COPY.en;

  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const total = items.length;

  const [round, setRound] = useState(0);
  const [trayOrder, setTrayOrder] = useState<string[]>(() => shuffledTray(items, seed, 0));
  const [placements, setPlacements] = useState<Record<string, string>>({});
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('playing');
  const [lockedCorrect, setLockedCorrect] = useState<ReadonlySet<string>>(new Set());
  const [wrongFlash, setWrongFlash] = useState<ReadonlySet<string>>(new Set());
  const [finalScore, setFinalScore] = useState(0);
  const settleTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const trayRef = useRef<HTMLUListElement | null>(null);

  function resetTo(nextRound: number) {
    if (settleTimeout.current) clearTimeout(settleTimeout.current);
    setRound(nextRound);
    setTrayOrder(shuffledTray(items, seed, nextRound));
    setPlacements({});
    setPickedId(null);
    setActiveId(null);
    setPhase('playing');
    setLockedCorrect(new Set());
    setWrongFlash(new Set());
    setFinalScore(0);
  }

  // A different block (or its own item list changed) — start a fresh round.
  useEffect(() => {
    resetTo(0);
    // Deliberately keyed on `items` alone, not `seed` — see the original
    // file's own note: a different block always brings a different item
    // list too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  useEffect(() => () => {
    if (settleTimeout.current) clearTimeout(settleTimeout.current);
  }, []);

  const placedIds = useMemo(() => new Set(Object.values(placements)), [placements]);
  const trayIds = trayOrder.filter((id) => !placedIds.has(id));
  useFlip(trayRef, trayIds.join(','), reducedMotion);

  const sensors = useGameDndSensors();
  const playing = phase === 'playing';

  function itemFor(id: string | number): GameItem | null {
    return byId.get(String(id)) ?? null;
  }

  function placeTile(targetPromptId: string, tileId: string) {
    setPlacements((prev) => {
      const next: Record<string, string> = {};
      for (const [promptId, value] of Object.entries(prev)) {
        if (value !== tileId) next[promptId] = value;
      }
      next[targetPromptId] = tileId;
      return next;
    });
  }

  function removePlacementOf(tileId: string) {
    setPlacements((prev) => {
      let changed = false;
      const next: Record<string, string> = {};
      for (const [promptId, value] of Object.entries(prev)) {
        if (value === tileId) {
          changed = true;
        } else {
          next[promptId] = value;
        }
      }
      return changed ? next : prev;
    });
  }

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(String(active.id));
    sound.play('pickUp');
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    const item = itemFor(active.id);
    if (!item) return;
    const promptId = over ? promptIdFromSlot(String(over.id)) : null;
    if (!promptId || lockedCorrect.has(promptId)) {
      removePlacementOf(item.id);
      return;
    }
    placeTile(promptId, item.id);
    sound.play('drop');
  }

  function handleDragCancel() {
    setActiveId(null);
  }

  /**
   * Spoken feedback for the whole gesture — computed independently of the
   * handlers above, from the SAME pre-update `placements`/`lockedCorrect`
   * closures, same reasoning `DropRenderer.tsx`'s own `announcements` gives:
   * the displacement sentence is only true relative to what the slot holds
   * RIGHT NOW, before `onDragEnd` applies the change.
   */
  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      const item = itemFor(active.id);
      return item ? copy.pickedUp(item.answer) : undefined;
    },
    onDragOver: ({ active, over }) => {
      const item = itemFor(active.id);
      const promptId = over ? promptIdFromSlot(String(over.id)) : null;
      if (!item || !promptId) return undefined;
      const prompt = byId.get(promptId);
      return copy.over(item.answer, prompt?.prompt ?? promptId);
    },
    onDragEnd: ({ active, over }) => {
      const item = itemFor(active.id);
      if (!item) return undefined;
      if (!over) return copy.returned(item.answer);
      const promptId = promptIdFromSlot(String(over.id));
      if (!promptId || lockedCorrect.has(promptId)) return copy.returned(item.answer);
      const displacedId = placements[promptId];
      const prompt = byId.get(promptId);
      const head = copy.dropped(item.answer, prompt?.prompt ?? promptId);
      const evicted = displacedId && displacedId !== item.id ? byId.get(displacedId) : null;
      return evicted ? `${head} ${copy.displaced(evicted.answer)}` : head;
    },
    onDragCancel: ({ active }) => {
      const item = itemFor(active.id);
      return item ? copy.cancelled(item.answer) : undefined;
    },
  };

  const screenReaderInstructions: ScreenReaderInstructions = { draggable: copy.instructions };

  function handleTrayTileClick(id: string) {
    if (!playing) return;
    setPickedId((current) => (current === id ? null : id));
  }

  function handleSlotPlace(promptId: string) {
    if (!playing || !pickedId) return;
    placeTile(promptId, pickedId);
    sound.play('drop');
    setPickedId(null);
  }

  function handleSlotRemove(promptId: string) {
    if (!playing) return;
    const tileId = placements[promptId];
    if (!tileId) return;
    removePlacementOf(tileId);
    sound.play('pickUp');
  }

  function handleCheck() {
    if (!playing) return;
    const correctIds = new Set(
      Object.entries(placements)
        .filter(([promptId, tileId]) => promptId === tileId)
        .map(([promptId]) => promptId),
    );
    const wrongIds = new Set(Object.keys(placements).filter((promptId) => !correctIds.has(promptId)));

    setLockedCorrect(correctIds);
    setFinalScore(correctIds.size);
    setPhase('checking');
    setWrongFlash(wrongIds);
    if (correctIds.size > 0) sound.play('correct');
    if (wrongIds.size > 0) sound.play('wrong');

    const settleMs = reducedMotion ? 0 : SETTLE_MS;
    settleTimeout.current = setTimeout(() => {
      setPlacements((prev) => {
        const next: Record<string, string> = {};
        for (const [promptId, tileId] of Object.entries(prev)) {
          if (!wrongIds.has(promptId)) next[promptId] = tileId;
        }
        return next;
      });
      setWrongFlash(new Set());
      setPhase('done');
      sound.play('finish');
    }, settleMs);
  }

  function handleReset() {
    resetTo(round + 1);
  }

  if (total === 0) return null;

  const activeItem = activeId ? byId.get(activeId) : undefined;
  /** Past {@link MANY_PAIRS_THRESHOLD}, every row/gap tightens a notch (on top of the two-column grid) — the closer this board gets to the authored 8-pair ceiling, the less room a smaller stage (1280x720) has to spare. */
  const manyPairs = items.length > MANY_PAIRS_THRESHOLD;

  return (
    <div data-testid="quiz-matching" className="flex min-h-0 flex-1 flex-col gap-4">
      {/* `flex-none`: a tidy chrome row that NEVER shrinks (visual-polish-2
          pass, owner bug: with no floor, this row got squeezed by the
          board's own overflow and "Reiniciar" painted over the first
          prompt's slot instead of sitting in its own row above it). */}
      <div data-testid="matching-controls" className="flex flex-none items-center justify-end gap-1">
        <GameSoundToggle
          muted={sound.muted}
          onToggle={sound.toggleMuted}
          labelMute={t.matchSoundMute}
          labelUnmute={t.matchSoundUnmute}
        />
        <Button type="button" variant="outline" size="sm" data-testid="matching-reset" onClick={handleReset}>
          {t.matchReset}
        </Button>
      </div>

      {/* FLOATING COMPROBAR (build item 5): Comprobar/Reintentar now float at
          the stage's own bottom-right, outside both the "playing"/"done"
          branches below so it never moves or disappears when the phase
          switches — see `scale.ts`'s own `FLOATING_CHECK_BAR_CLASS` header. */}
      <div
        data-testid="matching-actions"
        className={cn(FLOATING_CHECK_BAR_CLASS, editorOffset && FLOATING_CHECK_BAR_EDITOR_OFFSET)}
      >
        {phase === 'done' ? (
          <Button type="button" data-testid="matching-retry" className="min-h-11" onClick={handleReset}>
            {t.matchRetry}
          </Button>
        ) : (
          <Button type="button" data-testid="matching-check" className="min-h-11" onClick={handleCheck} disabled={!playing}>
            {t.matchCheck}
          </Button>
        )}
      </div>

      {phase === 'done' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center">
          <p
            data-testid="matching-result"
            aria-live="polite"
            className="text-xl font-medium text-foreground sm:text-2xl"
          >
            {finalScore} {t.matchResultOf} {total} {t.matchResultCorrect}
          </p>
        </div>
      ) : (
        <DndContext
          id={`dnd-matching-${seed}`}
          sensors={sensors}
          collisionDetection={closestCenter}
          accessibility={{ announcements, screenReaderInstructions }}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          {/* `justify-center`: a short board (a handful of pairs) centers in
              the stage's own available height instead of pinning to the top
              and leaving the rest of a tall/full-screen stage empty (visual-
              polish pass). Only THIS outer row is centered, never the
              scrollable div below — centering an overflowing `overflow-y-
              auto` box clips its own start edge out of scroll reach in
              Chromium (no "safe" alignment on `justify-center`), which would
              silently strand the top prompt rows off-screen. */}
          <div className="flex min-h-0 flex-1 flex-col justify-center gap-3">
            {/* `min-h-0`: lets this shrink (via its default `flex-shrink:
                1`) below its own content height once the board doesn't fit,
                so IT scrolls instead of the stage around it — the action row
                below, `flex-none`, then always keeps its own full size and
                is never pushed out of view (visual-polish-2 pass, owner bug:
                "Comprobar" sat below the fold on a 5-pair board; up to 8
                pairs is the authored ceiling). */}
            <div
              className={cn(
                'flex min-h-0 flex-col overflow-y-auto',
                manyPairs ? 'gap-4' : 'gap-6',
                STAGE_BOTTOM_RESERVE_CLASS,
              )}
            >
              <div
                data-testid="matching-prompts"
                className={cn('grid', manyPairs ? 'gap-2' : 'gap-3', manyPairs ? STAGE_TWO_COL_GRID : 'grid-cols-1')}
              >
              {items.map((item) => {
                const tileId = placements[item.id];
                const tile = tileId ? (byId.get(tileId) ?? null) : null;
                const locked = lockedCorrect.has(item.id);
                const wrong = wrongFlash.has(item.id);
                return (
                  <div
                    key={item.id}
                    data-testid={`matching-prompt-${item.id}`}
                    // Soft surface, never a hard-bordered card (UI-kit
                    // refactor, owner spec: "muy cuadrada") — `bg-card` +
                    // `shadow-elevation-1` at radius 20, same material the
                    // desk's own flat (non-glass) surfaces use. Correct
                    // settles as a tint + ring, never a border, so the shape
                    // itself never grows a visible edge.
                    className={cn(
                      'flex flex-wrap items-center gap-3 rounded-[20px] bg-card shadow-elevation-1 p-3 sm:gap-4',
                      manyPairs ? 'sm:p-3' : 'sm:p-4',
                      locked && 'ring-2 ring-success-strong bg-success-strong/10',
                    )}
                  >
                    <p className={cn('min-w-0 flex-1 font-medium text-foreground', PROMPT_SCALE)}>{item.prompt}</p>
                    <MatchSlot
                      promptId={item.id}
                      tile={tile}
                      locked={locked}
                      wrong={wrong}
                      disabled={!playing}
                      canPlacePicked={pickedId !== null}
                      onPlacePicked={() => handleSlotPlace(item.id)}
                      onRemove={() => handleSlotRemove(item.id)}
                      reducedMotion={reducedMotion}
                      dragging={activeId === tileId}
                      emptyLabel={t.matchEmptySlot}
                      removeLabel={t.matchRemovePrefix}
                    />
                  </div>
                );
              })}
              </div>

              <ul
                ref={trayRef}
                data-testid="matching-tray"
                aria-label={t.matchTrayLabel}
                // Always `flex-wrap`, never a horizontal scroller (owner
                // bug: below `sm` this used to be `overflow-x-auto` with
                // wrapping opt-in only from `sm` up, which is what clipped
                // "agua" off the edge of a 390px tray with no visible
                // scrollbar to hint it was there). Wrapping is correct at
                // every width down to 320px once each tile hugs its own
                // label instead of sharing one fixed basis — see `TILE_BASE`.
                className="flex list-none flex-wrap gap-3 p-0 pb-2"
              >
                {trayIds.map((id) => {
                  const item = byId.get(id);
                  if (!item) return null;
                  return (
                    <li key={id} className="shrink-0">
                      <MatchTile
                        id={id}
                        label={item.answer}
                        disabled={!playing}
                        picked={pickedId === id}
                        dragging={activeId === id}
                        reducedMotion={reducedMotion}
                        onClick={() => handleTrayTileClick(id)}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          <DragOverlay dropAnimation={gameDropAnimation(reducedMotion)}>
            {activeItem ? (
              <div className={cn(TILE_BASE, 'pointer-events-none', liftedTileClassName(reducedMotion))}>
                {activeItem.answer}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
