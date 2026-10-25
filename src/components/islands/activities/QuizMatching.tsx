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
  GameDragOverlay,
  GameSoundToggle,
  dragCursorClassName,
  gameCollisionDetection,
  gameDropAnimation,
  gameTileTransitionClassName,
  liftedTileClassName,
  useFlip,
  useGameDndSensors,
  useGrabCursor,
} from '@/components/islands/mechanics/gameFeel';
import { ACTIVITY_SHEET_CLASS, BLANK_EMPTY, BLANK_FILLED, stageChipColorClass } from '@/components/islands/mechanics/chip';
import { GradeMark, gradeAriaSuffix, gradeSummary, type GradeState } from '@/components/islands/mechanics/CheckMark';
import {
  FLOATING_CHECK_BAR_CLASS,
  PROMPT_SCALE,
  STAGE_BOTTOM_RESERVE_CLASS,
  STAGE_CONTENT_MEASURE,
  STAGE_SAFE_INSET_CLASS,
  STAGE_TWO_COL_GRID,
  TILE_MIN_HEIGHT_SCALE,
} from '@/components/islands/mechanics/scale';
import GameResult, { type GameResultGuestInvite } from '@/components/islands/mechanics/GameResult';

/** Past this many pairs, the prompt list switches to {@link STAGE_TWO_COL_GRID} on a wide stage — see that token's own header. */
const MANY_PAIRS_THRESHOLD = 4;

export interface QuizMatchingProps {
  lang: Lang;
  items: readonly GameItem[];
  /** Stable per-block seed (the block id) — `shuffleWithSeed`'s own input for the tray and "Reiniciar". */
  seed: string;
  /** Threaded straight through to `GameResult` — set only by the practice page, never by the editor preview (build item N1). */
  nextHref?: string;
  /** Threaded straight through to `GameResult` — set only by the practice page, for an anonymous visitor (build item N1). */
  guest?: GameResultGuestInvite;
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
 * Shared colour-filled capsule tile, `mechanics/chip.ts`'s own
 * `stageChipColorClass` — a tray tile sits at rest, hugging its own label,
 * filled from the shared tile palette by its own stable tray-order position
 * (owner spec: coloured, always varied, kept on placement — see
 * `colorIndexById`'s own comment below). `MatchSlot` adds `w-full` ITSELF
 * only for the tile that has actually landed in a slot (so the chip fills
 * the target it was dropped into, same as `DropRenderer`'s own filled box)
 * — never here, where it would force every tray tile to one shared fixed
 * width again (owner bug: "agua" clipped off a 390px tray because every
 * chip, short or long, was stretched to the same ~245px box).
 */

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
  /** This tile's own stable position in the shuffled tray order — see `colorIndexById`'s own comment below for why colour belongs to the item, never the slot. */
  colorIndex: number;
}

/** A draggable tile — a real `<button>`, usable by drag, tap-to-place and the keyboard alike. */
function MatchTile({ id, label, disabled, picked, dragging, reducedMotion, onClick, ariaLabel, className, colorIndex }: MatchTileProps) {
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
        stageChipColorClass(colorIndex),
        // Fix-round (visual bug audit): once grading starts every tile goes
        // `disabled` (no more interaction) — the shared `CHIP_SHAPE` also
        // ties a pale `disabled:opacity-50` to that same native state, which
        // read as "turned off" instead of graded. `disabled:opacity-100`
        // keeps every chip at full tray colour; the 2px ring + ✓/✕ mark
        // stay the only correctness signal (same idiom `QuizHangman.tsx`/
        // `QuizTrueFalse.tsx` already use for their own graded chips).
        'touch-none disabled:opacity-100',
        dragCursorClassName(true, dragging),
        dragging && 'opacity-40',
        // Picked (tap-selected, not yet placed): a ring only — never
        // `CHIP_PLACED`'s white fill, which would hide the chip's own
        // colour the moment it is tapped (owner spec: a chip keeps its
        // colour, the ring is enough to say "this one is picked").
        picked && !dragging && 'ring-2 ring-inset ring-ring',
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
  /** The placed tile's own stable colour index (see `colorIndexById`'s own comment) — `0` when `tile` is `null` (unused). */
  tileColorIndex: number;
  locked: boolean;
  wrong: boolean;
  /** Coordinator follow-up to UX audit finding 3: true while `matching-missing-notice` is showing AND this slot is one of the still-empty ones — briefly draws the eye to where to place next, same `animate-pulse`/`motion-reduce` idiom {@link wrong} already uses. */
  highlightEmpty: boolean;
  disabled: boolean;
  canPlacePicked: boolean;
  onPlacePicked: () => void;
  onRemove: () => void;
  reducedMotion: boolean;
  dragging: boolean;
  emptyLabel: string;
  removeLabel: string;
  lang: 'es' | 'en';
}

/** The drop target next to a prompt — empty (a tap target once a tile is picked) or holding a tile (a tap target to remove it). */
function MatchSlot({
  promptId,
  tile,
  tileColorIndex,
  locked,
  wrong,
  highlightEmpty,
  disabled,
  canPlacePicked,
  onPlacePicked,
  onRemove,
  reducedMotion,
  dragging,
  emptyLabel,
  removeLabel,
  lang,
}: MatchSlotProps) {
  const { isOver, setNodeRef } = useDroppable({ id: slotIdFor(promptId), disabled: disabled || locked });
  // UX audit F10 ("Al comprobar"): correct/wrong must not rely on colour
  // alone — `grade` drives the ✓/✕ badge AND the accessible-name suffix
  // below, on top of this slot's own existing `locked`/`wrong` colour.
  const grade: GradeState | undefined = locked ? 'correct' : wrong ? 'wrong' : undefined;

  return (
    <span
      ref={setNodeRef}
      data-testid={`matching-slot-${promptId}`}
      data-over={isOver ? 'true' : undefined}
      data-filled={tile ? 'true' : undefined}
      className={cn(
        'relative inline-flex min-w-32 flex-1 sm:min-w-48',
        TILE_MIN_HEIGHT_SCALE,
        tile ? cn('items-stretch', BLANK_FILLED) : cn('items-center justify-center', BLANK_EMPTY),
        // Active (activity-templates-polish pass, proposal §d: "hueco con
        // ficha encima" — the one active-well treatment, used both mid-drag
        // and for "this slot would receive the picked tile"): solid
        // sky-deep border + `--well-active-bg`, replacing the old ad-hoc
        // `border-ring`/`bg-accent/*` opacities.
        ((isOver && !locked) || (!tile && canPlacePicked)) &&
          'border-solid border-pop-sky-deep bg-[var(--well-active-bg)]',
        // Correct/incorrect: a 2px INSET ring (never a literal border, which
        // would nudge the box) in `--success`/`--destructive`, over the
        // matching pastel `--color-pop-green`/`--color-pop-red` tint
        // (proposal §d's own table).
        locked && 'ring-2 ring-inset ring-success bg-pop-green/28',
        wrong && 'animate-pulse ring-2 ring-inset ring-destructive bg-pop-red/10 motion-reduce:animate-none',
        highlightEmpty && 'animate-pulse border-ring ring-2 ring-ring/40 motion-reduce:animate-none',
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
          ariaLabel={`${removeLabel} ${tile.answer}${gradeAriaSuffix(lang, grade)}`}
          colorIndex={tileColorIndex}
          // `w-full`: the ONE place a chip is stretched — a tile that has
          // landed in its slot fills that target completely, same as
          // `DropRenderer`'s own filled box (`stageChipColorClass` itself
          // never forces a width, see `chip.ts`'s own header). A placed tile
          // keeps its own colour (owner spec) — `locked` adds a ring, never
          // a white `CHIP_PLACED` fill that would hide it.
          className={cn('border-0 w-full', locked && 'ring-2 ring-inset ring-success-strong')}
        />
      ) : (
        <button
          type="button"
          data-testid={`matching-slot-button-${promptId}`}
          aria-label={emptyLabel}
          onClick={onPlacePicked}
          // Drag-feel pass, real-browser finding: NEVER the native
          // `disabled` attribute for "nothing picked" (`!canPlacePicked`) —
          // only `disabled` itself (grading in progress) still disables it
          // natively, which is fine since no drag is possible by then. A
          // browser refuses to dispatch `mousedown`/`mouseup`/`click` to a
          // `disabled` form control AT ALL, even one the pointer happens to
          // release over mid-drag — so a real mouse/touch drag released
          // squarely on an empty slot (the ordinary case: `pickedId`, tap-
          // to-place's own state, is never set by a drag) silently never
          // reached `onDragEnd`, leaving the tile stuck mid-drag. `aria-
          // disabled` keeps the same "unavailable" signal for assistive
          // tech and `handleSlotPlace` already no-ops when `pickedId` is
          // null, so a tap here still safely does nothing either way.
          disabled={disabled}
          aria-disabled={!canPlacePicked || undefined}
          // Tab order (MINOR a11y finding): `aria-disabled` alone does not
          // drop a button out of the tab sequence the way the native
          // `disabled` attribute above would have, so this stayed a tab
          // stop even with nothing picked to place. `-1` only while that's
          // true; `0` (the ordinary tab stop) the instant `canPlacePicked`
          // flips, matching `aria-disabled` itself.
          tabIndex={canPlacePicked ? 0 : -1}
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
      {grade && <GradeMark state={grade} />}
    </span>
  );
}

export default function QuizMatching({ lang, items, seed, nextHref, guest }: QuizMatchingProps) {
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
  // UX audit F10: the one polite live-region sentence after "Comprobar" —
  // see `CheckMark.tsx`'s own `gradeSummary` header for the exact wording.
  const [announcement, setAnnouncement] = useState('');
  // Coordinator review of ac75119 (UX audit finding 3 follow-up): the
  // sr-only `announcement` above said "Te faltan N por ubicar." but a
  // SIGHTED student taps "Comprobar" and sees nothing happen — this is the
  // SAME message, kept as real visible DOM content next to the floating
  // "Comprobar" button, so the empty-slots notice is actually readable, not
  // only exposed to a screen reader.
  const [missingNotice, setMissingNotice] = useState('');
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
    setAnnouncement('');
    setMissingNotice('');
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

  /**
   * Each item's own stable colour — its fixed index in `trayOrder` (owner
   * spec: "siempre variadas" — cycling through `palette.ts`'s own six-colour
   * set, never repeating between the three/however-many items actually in
   * play) rather than the item's position in `trayIds` (which shrinks/
   * reindexes every time a tile is placed) — so a chip keeps the SAME
   * colour once it lands in its slot, exactly the way the owner asked a
   * student to be able to track a tile by colour.
   */
  const colorIndexById = useMemo(() => new Map(trayOrder.map((id, index) => [id, index])), [trayOrder]);
  function colorIndexFor(id: string): number {
    return colorIndexById.get(id) ?? 0;
  }

  const sensors = useGameDndSensors();
  useGrabCursor(activeId !== null);
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
    // UX audit finding 3: a placement always clears the "Te faltan..."
    // notice below — the one thing that could make it stale. Both the
    // sr-only announcement and its visible twin clear together.
    setAnnouncement('');
    setMissingNotice('');
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
    // UX audit finding 3 (RECORRIDO-2026-10-15.md #3): "Comprobar" used to
    // grade (and silently end) the round even with slots still empty,
    // counting each one as wrong. Refuse to grade instead, announce how
    // many are left, and keep playing — same posture Reorder/Cloze/
    // GroupSort already have via their own disabled "Comprobar" button.
    const missing = total - Object.keys(placements).length;
    if (missing > 0) {
      const message = t.matchMissingSlots(missing);
      setAnnouncement(message);
      setMissingNotice(message);
      return;
    }
    setMissingNotice('');
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
    setAnnouncement(gradeSummary(lang, correctIds.size, wrongIds.size) ?? '');
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

  /**
   * "Repasar las que fallé" (build item N1): unlike every other reset here,
   * this one touches NOTHING — `handleCheck`'s own settle timeout already
   * left `lockedCorrect`/`placements` holding only the correct pairs (wrong
   * ones evicted back into `trayOrder`, which `trayIds` re-derives from on
   * every render), so simply leaving "done" re-mounts the SAME board with
   * the correct pairs already locked in place and the wrong tiles back in
   * the tray. Pressing "Comprobar" again reaches `handleCheck`, which keeps
   * accumulating into `lockedCorrect` rather than overwriting it.
   */
  function handleReviewWrong() {
    setPhase('playing');
  }

  if (total === 0) return null;

  const activeItem = activeId ? byId.get(activeId) : undefined;
  /** Past {@link MANY_PAIRS_THRESHOLD}, every row/gap tightens a notch (on top of the two-column grid) — the closer this board gets to the authored 8-pair ceiling, the less room a smaller stage (1280x720) has to spare. */
  const manyPairs = items.length > MANY_PAIRS_THRESHOLD;

  return (
    <div data-testid="quiz-matching" className="flex min-h-0 flex-1 flex-col gap-4">
      <div aria-live="polite" role="status" className="sr-only" data-testid="matching-live-region">
        {announcement}
      </div>
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
        {/* Hidden on the result screen (owner review, build item N1
            follow-up): it would duplicate GameResult's own "Jugar de
            nuevo" — the sound toggle stays, same posture every other
            template's own control row already has. */}
        {phase !== 'done' && (
          <Button type="button" variant="outline" size="sm" data-testid="matching-reset" onClick={handleReset}>
            {t.matchReset}
          </Button>
        )}
      </div>

      {/* FLOATING COMPROBAR (build item 5): outside both the "playing"/"done"
          branches below so it never moves while playing — see `scale.ts`'s
          own `FLOATING_CHECK_BAR_CLASS` header. Gone once "done": `GameResult`
          below owns every action on the result screen (build item N1). */}
      {phase !== 'done' && (
        <div
          data-testid="matching-actions"
          className={FLOATING_CHECK_BAR_CLASS}
        >
          {/* Coordinator follow-up to UX audit finding 3: `missingNotice`
              used to reach ONLY the sr-only `matching-live-region` — a
              sighted student tapping "Comprobar" saw nothing happen. Real
              visible content next to the button itself, `flex-wrap`'s own
              row (wraps above the button on a narrow stage, same as "just
              above or to the left"). Ink text on the card surface (never
              the yellow `--primary` the button itself uses) so it reads at
              a glance. */}
          {missingNotice && (
            // `aria-hidden`: purely the VISIBLE twin — the sr-only
            // `matching-live-region` above already announces this exact
            // sentence once; a screen reader must not hear it twice.
            <span
              data-testid="matching-missing-notice"
              aria-hidden="true"
              className="rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground shadow-elevation-1"
            >
              {missingNotice}
            </span>
          )}
          <Button type="button" data-testid="matching-check" className="min-h-11" onClick={handleCheck} disabled={!playing}>
            {t.matchCheck}
          </Button>
        </div>
      )}

      {phase === 'done' ? (
        <GameResult
          lang={lang}
          correct={finalScore}
          total={total}
          resultWord={t.matchResultCorrect}
          onPlayAgain={handleReset}
          onReviewWrong={finalScore < total ? handleReviewWrong : undefined}
          nextHref={nextHref}
          guest={guest}
        />
      ) : (
        <DndContext
          id={`dnd-matching-${seed}`}
          sensors={sensors}
          collisionDetection={gameCollisionDetection}
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
              data-testid="matching-stage-scroll"
              className={cn('flex min-h-0 flex-col overflow-y-auto', STAGE_BOTTOM_RESERVE_CLASS, STAGE_SAFE_INSET_CLASS)}
            >
              {/* THE SHEET (activity-templates-polish pass, proposal §d):
                  one white card holding tray + board, shared material with
                  the other three moulds (`ACTIVITY_SHEET_CLASS`,
                  `mechanics/chip.ts`) — see that token's own header for why
                  this is an inline div rather than an imported component. */}
              <div
                data-testid="activity-sheet"
                // `activity-sheet--wide` only past the many-pairs threshold
                // (visual bug audit: the 2-column board below collided with
                // itself inside the default 760px cap — see
                // `.activity-sheet--wide`, `global.css`).
                className={cn(
                  ACTIVITY_SHEET_CLASS,
                  manyPairs && 'activity-sheet--wide',
                  'flex flex-col',
                  manyPairs ? 'gap-4' : 'gap-6',
                )}
              >
              {/* THE TRAY, ABOVE THE PAIRS (UI pass, owner spec: "mover las
                  opciones arriba" — the owner's own screenshot drew it moved
                  into the empty space above the board). A DOM-order move,
                  not just visual: this `ul` now renders FIRST in this
                  `flex-col` stage, before `matching-prompts` below, so
                  keyboard/tab order and the visual stack agree. Same
                  `STAGE_CONTENT_MEASURE` cap as the prompts column below, so
                  the tray is centred over the SAME board width, never wider. */}
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
                // label instead of sharing one fixed basis — see
                // `stageChipColorClass`'s own header (`chip.ts`).
                className={cn(
                  'flex list-none flex-wrap gap-3 p-0 pb-2',
                  // Matches the wider `activity-sheet--wide` cap above once
                  // many-paired, so the tray stays centred over the SAME
                  // board width as the (also widened) pairs grid below.
                  manyPairs ? 'mx-auto w-full max-w-[960px]' : STAGE_CONTENT_MEASURE,
                )}
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
                        colorIndex={colorIndexFor(id)}
                      />
                    </li>
                  );
                })}
              </ul>

              <div
                data-testid="matching-prompts"
                className={cn(
                  'grid',
                  // Visual bug audit: `gap-2` (8px) was BOTH the row gap and
                  // the gap between the 2 pair-columns — too tight for the
                  // latter, read as a collision rather than a column break.
                  // Split so the column gap gets its own, clearly bigger
                  // value; `gap-x-*` is a no-op until `@lg:grid-cols-2`
                  // above actually lays out 2 columns.
                  manyPairs ? 'gap-y-2 gap-x-6' : 'gap-3',
                  manyPairs ? STAGE_TWO_COL_GRID : 'grid-cols-1',
                  // Same widened cap as `activity-sheet--wide` above — the
                  // default 760px measure left each of the 2 pair-columns
                  // too narrow for its own `[prompt | well]` row.
                  manyPairs ? 'mx-auto w-full max-w-[960px]' : STAGE_CONTENT_MEASURE,
                )}
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
                    // ROW ANATOMY (activity-templates-polish pass, proposal
                    // §d: "lista agrupada en la lámina... sin tarjeta por
                    // fila" — replaces the UI-kit refactor's own per-row
                    // card). A CSS grid, not flex-wrap: two EQUAL columns
                    // (term | slot), `gap-4` (16px) between them. Below the
                    // row's own 420px container width (`@[420px]:`, reading
                    // the SAME `@container` ancestor `STAGE_TWO_COL_GRID`
                    // above does, not the viewport) the term stacks above the
                    // slot instead of squeezing two columns into a
                    // phone-width row. No card/shadow/radius any more — every
                    // row now floats directly on the shared `.activity-sheet`
                    // (below), separated by `.pair-row`'s own inset hairline
                    // (`global.css`) instead; correct/incorrect now settles
                    // on the SLOT itself ({@link MatchSlot}), never the row.
                    className="pair-row grid grid-cols-1 @[420px]:grid-cols-2 items-center gap-4 py-3 pr-2 pl-4"
                  >
                    <p className={cn('min-w-0 font-medium text-foreground', PROMPT_SCALE)}>{item.prompt}</p>
                    <MatchSlot
                      promptId={item.id}
                      tile={tile}
                      tileColorIndex={tileId ? colorIndexFor(tileId) : 0}
                      locked={locked}
                      wrong={wrong}
                      highlightEmpty={Boolean(missingNotice) && !tile}
                      disabled={!playing}
                      canPlacePicked={pickedId !== null}
                      onPlacePicked={() => handleSlotPlace(item.id)}
                      onRemove={() => handleSlotRemove(item.id)}
                      reducedMotion={reducedMotion}
                      dragging={activeId === tileId}
                      emptyLabel={t.matchEmptySlot}
                      removeLabel={t.matchRemovePrefix}
                      lang={lang}
                    />
                  </div>
                );
              })}
              </div>
              </div>
            </div>
          </div>

          <GameDragOverlay dropAnimation={gameDropAnimation(reducedMotion)} activeId={activeId}>
            {activeItem ? (
              <div
                className={cn(
                  stageChipColorClass(colorIndexFor(activeItem.id)),
                  'pointer-events-none',
                  liftedTileClassName(reducedMotion),
                )}
              >
                {activeItem.answer}
              </div>
            ) : null}
          </GameDragOverlay>
        </DndContext>
      )}
    </div>
  );
}
