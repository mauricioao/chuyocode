/**
 * QuizGroupSort — "Ordenar por grupos" (the `groupsort` template's game):
 * every item shuffled into a tray at the bottom, the groups shown as large
 * labelled boxes the learner drags (or taps) each item into. Mirrors
 * `QuizMatching.tsx`'s own big-stage, game-feel posture, at BOARD
 * granularity instead of per-prompt slots — the whole activity is one board,
 * there is no "next sentence" to step through.
 *
 * ONE GROUP BOX CAN HOLD SEVERAL TILES, unlike `QuizMatching`'s one-tile-per-
 * slot `MatchSlot`: `placements` here maps an ITEM id to the GROUP id it
 * currently sits in, so a group box simply renders every item whose
 * placement matches its own id.
 *
 * ONE "COMPROBAR" FOR THE WHOLE BOARD, MULTI-ATTEMPT (unlike `QuizMatching`'s
 * single-shot board): pressing it grades every item not already confirmed
 * correct — a correct one settles green and LOCKS in place (it can no longer
 * be picked up); a wrong one shakes red and STAYS exactly where it is,
 * fixable by tapping it back to the tray and trying another group (never
 * evicted the way `QuizMatching` evicts a wrong pair). The round only ends,
 * with the calm "N de N bien ubicados" result and "Reintentar", once every
 * item is locked correct — "Comprobar" itself stays disabled until every
 * item has been placed SOMEWHERE, so a half-empty board is never graded.
 *
 * SHARES THE GAME-FEEL ENGINE (`mechanics/gameFeel.tsx`) and `gameSounds.ts`
 * verbatim with `QuizMatching`/`QuizReorder`/`QuizCloze` — same lifted-tile
 * look, eased drop, tray reflow, and five sound cues, gated by the same
 * shared mute toggle.
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
import type { Payload, PoolItem } from '@/lib/exercisePayload';
import { deriveGroupSortGroups, groupSortPoolName, seedFromString, shuffleWithSeed } from '@/lib/activities/gameModes';
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
import { ACTIVITY_SHEET_CLASS, stageChipColorClass } from '@/components/islands/mechanics/chip';
import { GradeMark, gradeAriaSuffix, gradeSummary, type GradeState } from '@/components/islands/mechanics/CheckMark';
import {
  FLOATING_CHECK_BAR_CLASS,
  STAGE_BOTTOM_RESERVE_CLASS,
  STAGE_BOX_MIN_HEIGHT_SCALE,
  STAGE_CONTENT_MEASURE,
  STAGE_SAFE_INSET_CLASS,
  TILE_TEXT_SCALE,
} from '@/components/islands/mechanics/scale';
import GameResult, { type GameResultGuestInvite } from '@/components/islands/mechanics/GameResult';

export interface QuizGroupSortProps {
  lang: Lang;
  /** The whole block's own payload — every group is one `group`-mechanic slot, every tile lives in the one pool they all share. */
  payload: Payload;
  /** Stable per-block seed (the block id) — the tray's own shuffle and "Reintentar". */
  seed: string;
  /** Threaded straight through to `GameResult` — set only by the practice page, never by the editor preview (build item N1). */
  nextHref?: string;
  /** Threaded straight through to `GameResult` — set only by the practice page, for an anonymous visitor (build item N1). */
  guest?: GameResultGuestInvite;
}

/** How long a fully-correct board stays visible before showing the final result (ms) — same value every sibling game uses for its own settle. */
const SETTLE_MS = 500;

/** The droppable id for a given group — a fixed prefix so `onDragEnd` can resolve it back to a group id. */
const GROUP_DROP_PREFIX = 'groupsort-group-';
function groupDropId(groupId: string): string {
  return `${GROUP_DROP_PREFIX}${groupId}`;
}
function groupIdFromDrop(dropId: string): string | null {
  return dropId.startsWith(GROUP_DROP_PREFIX) ? dropId.slice(GROUP_DROP_PREFIX.length) : null;
}

type Phase = 'playing' | 'done';

interface GroupSortCopy {
  instructions: string;
  pickedUp: (tile: string) => string;
  over: (tile: string, group: string) => string;
  dropped: (tile: string, group: string) => string;
  returned: (tile: string) => string;
  cancelled: (tile: string) => string;
}

const GROUPSORT_COPY: Record<'es' | 'en', GroupSortCopy> = {
  es: {
    instructions:
      'Para colocar un elemento con el teclado: presionar Espacio o Enter para tomarlo, y Espacio o Enter otra vez sobre un grupo para soltarlo ahí. Escape cancela el movimiento. También se puede tocar un elemento y luego tocar un grupo, o tocar un elemento ya colocado para quitarlo.',
    pickedUp: (tile) => `Elemento ${tile} tomado.`,
    over: (tile, group) => `Elemento ${tile} sobre el grupo "${group}".`,
    dropped: (tile, group) => `Elemento ${tile} colocado en el grupo "${group}".`,
    returned: (tile) => `Elemento ${tile} sin colocar. Vuelve a los elementos disponibles.`,
    cancelled: (tile) => `Movimiento cancelado. El elemento ${tile} vuelve a los elementos disponibles.`,
  },
  en: {
    instructions:
      'To place an item with the keyboard: press Space or Enter to pick it up, and Space or Enter again over a group to drop it there. Escape cancels the move. An item can also be tapped, then a group tapped to place it, or an already placed item tapped to remove it.',
    pickedUp: (tile) => `Item ${tile} picked up.`,
    over: (tile, group) => `Item ${tile} over the "${group}" group.`,
    dropped: (tile, group) => `Item ${tile} placed in the "${group}" group.`,
    returned: (tile) => `Item ${tile} was not placed. It returns to the available items.`,
    cancelled: (tile) => `Move cancelled. Item ${tile} returns to the available items.`,
  },
};

/** Each group's own dot, by its stable order — the same 4-colour sequence
 * the editor's own group list uses (`GroupSortEditor.tsx`'s own, private
 * `GROUP_DOT_CLASS`, not exported — duplicated here rather than imported, to
 * keep the practice board independent of the editor module), so a group's
 * colour matches between authoring and play. */
const GROUP_DOT_CLASS = ['bg-pop-sky', 'bg-pop-yellow', 'bg-pop-red', 'bg-pop-green'] as const;

/**
 * The group box's own empty/filled well recipe (activity-templates-polish
 * pass, proposal §d: "grupos: radio 26px (no cápsula)") — the same
 * `--well-bg`/`--well-shadow`/`border-input` material `mechanics/chip.ts`'s
 * {@link BLANK_EMPTY}/{@link BLANK_FILLED} give every other mould's drop
 * target, at the group's own larger, rounded-RECTANGLE radius instead of the
 * shared capsule (a group is a box holding several tiles, never a single-slot
 * capsule). Kept local rather than added to `chip.ts`, which only ever gives
 * out the capsule shape. Unlike a single-tile well, a group box stays
 * visible (keeps `--well-bg`) once filled too — it is a persistent
 * container, not a one-shot target that disappears behind its own tile.
 */
const GROUP_BOX_EMPTY =
  'rounded-[26px] border-[1.5px] border-dashed border-input bg-[var(--well-bg)] shadow-[var(--well-shadow)] transition-colors';
const GROUP_BOX_FILLED =
  'rounded-[26px] border-[1.5px] border-solid border-transparent bg-[var(--well-bg)] shadow-[var(--well-shadow)] transition-colors';

/**
 * The board's own column count by group count (activity-templates-polish
 * pass, proposal §d: "grilla 2 → 2, 3 → 3, 4 → 2 × 2; 1 columna en el
 * celular" — replaces the old `flex-wrap` layout, which is what let 4
 * groups read as 3 + 1 instead of an intentional 2×2). Always 1 column on
 * phones; `sm:` and up switches to the grid.
 */
function groupGridColsClass(count: number): string {
  if (count === 3) return 'grid-cols-1 sm:grid-cols-3';
  return 'grid-cols-1 sm:grid-cols-2'; // 2 groups, or 4 (2×2) — the two even cases share one column count.
}

/**
 * Shared colour-filled capsule tile, `mechanics/chip.ts`'s own
 * `stageChipColorClass` — coloured from the shared tile palette by the
 * item's own stable position in its shuffled tray order (see
 * `colorIndexById`'s own comment below), same recipe `QuizMatching.tsx`
 * uses. A tray tile and an already-placed one share the SAME colour (owner
 * spec: a tile keeps its own colour once placed) — `placed` no longer
 * swaps in a white `CHIP_PLACED` fill, see below.
 */
interface ItemTileProps {
  id: string;
  label: string;
  disabled: boolean;
  draggable: boolean;
  dragging: boolean;
  picked: boolean;
  /** Already sitting in a group box — kept for the one thing it still changes below (no own border/shape difference any more; colour and shape are identical in the tray and in a group box). */
  placed: boolean;
  locked: boolean;
  wrong: boolean;
  reducedMotion: boolean;
  onClick: () => void;
  ariaLabel?: string;
  /** This tile's own stable position in the shuffled tray order — see `colorIndexById`'s own comment below for why colour belongs to the item, never the group it happens to sit in. */
  colorIndex: number;
}

function ItemTile({ id, label, disabled, draggable, dragging, picked, locked, wrong, reducedMotion, onClick, ariaLabel, colorIndex }: ItemTileProps) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id, disabled: disabled || !draggable });
  // UX audit F10 ("Al comprobar"): drives the ✓/✕ badge on top of this
  // tile's own `locked`/`wrong` colour — never a new colour, see
  // `CheckMark.tsx`'s own header.
  const grade: GradeState | undefined = locked ? 'correct' : wrong ? 'wrong' : undefined;

  return (
    <button
      type="button"
      ref={draggable ? setNodeRef : undefined}
      data-flip-id={id}
      data-testid={`groupsort-tile-${id}`}
      disabled={disabled}
      onClick={onClick}
      {...(draggable ? attributes : {})}
      {...(draggable ? listeners : {})}
      aria-pressed={picked || dragging}
      aria-label={ariaLabel}
      className={cn(
        'relative',
        stageChipColorClass(colorIndex),
        // Fix-round (visual bug audit): see `QuizMatching.tsx`'s own tile —
        // same shared `CHIP_SHAPE` `disabled:opacity-50`, same fix, so a
        // graded chip here keeps its full tray colour too.
        'disabled:opacity-100',
        draggable && 'touch-none',
        dragging && 'opacity-40',
        // Picked (tap-selected, not yet placed): a ring only — never a
        // white `CHIP_PLACED` fill, which would hide the chip's own colour.
        picked && !dragging && 'ring-2 ring-inset ring-ring',
        // Locked correct / wrong: a ring, not a background tint or a text
        // colour swap — a saturated fill plus a semi-transparent
        // success/destructive tint read muddy, and `text-success-strong-
        // foreground`/`text-destructive` are tuned for the grey/white rest
        // material, not for white-on-colour. The ✓/✕ `GradeMark` badge
        // below stays the one semantic signal either way (UX audit F10).
        locked && 'ring-2 ring-inset ring-success-strong',
        wrong && 'animate-pulse ring-2 ring-inset ring-destructive motion-reduce:animate-none',
        gameTileTransitionClassName(reducedMotion),
      )}
    >
      {label}
      {grade && <GradeMark state={grade} />}
    </button>
  );
}

interface GroupBoxProps {
  groupId: string;
  /** This group's own stable position among its siblings — drives its title dot's colour ({@link GROUP_DOT_CLASS}), never its correctness. */
  groupIndex: number;
  label: string;
  items: PoolItem[];
  lockedIds: ReadonlySet<string>;
  wrongIds: ReadonlySet<string>;
  activeId: string | null;
  disabled: boolean;
  canPlacePicked: boolean;
  onPlacePicked: () => void;
  onRemoveItem: (itemId: string) => void;
  reducedMotion: boolean;
  emptyLabel: string;
  removeLabel: string;
  lang: Lang;
  /** Resolves an item's own stable colour index — see `colorIndexById`'s own comment in the main component. */
  colorIndexFor: (itemId: string) => number;
}

/** One group's own big labelled box — a drop target that holds EVERY tile currently placed in it, not just one. */
function GroupBox({
  groupId,
  groupIndex,
  label,
  items,
  lockedIds,
  wrongIds,
  activeId,
  disabled,
  canPlacePicked,
  onPlacePicked,
  onRemoveItem,
  reducedMotion,
  emptyLabel,
  removeLabel,
  lang,
  colorIndexFor,
}: GroupBoxProps) {
  const { isOver, setNodeRef } = useDroppable({ id: groupDropId(groupId), disabled });

  return (
    <div
      ref={setNodeRef}
      data-testid={`groupsort-board-group-${groupId}`}
      // Dashed capsule outline while empty ({@link GROUP_BOX_EMPTY}); border
      // goes solid-transparent once the group holds items ({@link
      // GROUP_BOX_FILLED}) — own rounded-rectangle recipe (proposal §d: "no
      // cápsula"), not the shared capsule `BLANK_EMPTY`/`BLANK_FILLED` every
      // single-tile well uses.
      className={cn(
        'flex flex-1 flex-col gap-2 p-3 sm:min-w-48',
        items.length === 0 ? GROUP_BOX_EMPTY : GROUP_BOX_FILLED,
        STAGE_BOX_MIN_HEIGHT_SCALE,
        (isOver || canPlacePicked) && !disabled && 'border-solid border-pop-sky-deep bg-[var(--well-active-bg)]',
      )}
    >
      <p className={cn('flex items-center justify-center gap-2 text-center font-semibold text-foreground', TILE_TEXT_SCALE)}>
        <span
          aria-hidden="true"
          className={cn('inline-block size-2.5 shrink-0 rounded-full', GROUP_DOT_CLASS[groupIndex % GROUP_DOT_CLASS.length])}
        />
        {label}
      </p>
      <div className="flex min-h-11 flex-1 flex-wrap content-start items-start gap-2">
        {items.length === 0 && (
          <button
            type="button"
            data-testid={`groupsort-group-empty-${groupId}`}
            aria-label={emptyLabel}
            onClick={onPlacePicked}
            disabled={disabled || !canPlacePicked}
            className="flex min-h-11 w-full flex-1 items-center justify-center bg-transparent p-0 text-sm text-muted-foreground"
          >
            {emptyLabel}
          </button>
        )}
        {items.map((item) => {
          const locked = lockedIds.has(item.id);
          const wrong = wrongIds.has(item.id);
          const label2 = item.text ?? item.id;
          return (
            <ItemTile
              key={item.id}
              id={item.id}
              label={label2}
              disabled={disabled || locked}
              draggable={!locked}
              dragging={activeId === item.id}
              picked={false}
              placed
              locked={locked}
              wrong={wrong}
              reducedMotion={reducedMotion}
              onClick={locked ? () => {} : canPlacePicked ? onPlacePicked : () => onRemoveItem(item.id)}
              ariaLabel={`${removeLabel} ${label2}${gradeAriaSuffix(lang, locked ? 'correct' : wrong ? 'wrong' : undefined)}`}
              colorIndex={colorIndexFor(item.id)}
            />
          );
        })}
        {/* A full-width tap target so "place the picked tile here" works even
            when the group already holds items (not just the empty state
            above) — same `onPlacePicked` the empty placeholder uses. */}
        {items.length > 0 && canPlacePicked && !disabled && (
          <button
            type="button"
            data-testid={`groupsort-group-dropzone-${groupId}`}
            aria-label={emptyLabel}
            onClick={onPlacePicked}
            className="min-h-11 flex-1 basis-full bg-transparent p-0"
          />
        )}
      </div>
    </div>
  );
}

export default function QuizGroupSort({ lang, payload, seed, nextHref, guest }: QuizGroupSortProps) {
  const t = UI_LABELS[lang].activities.gameModes;
  const reducedMotion = usePrefersReducedMotion();
  const sound = useGameSound();
  const copy = lang === 'es' ? GROUPSORT_COPY.es : GROUPSORT_COPY.en;

  const groups = useMemo(() => deriveGroupSortGroups(payload), [payload]);
  const poolName = useMemo(() => groupSortPoolName(payload), [payload]);
  const poolItems = useMemo<PoolItem[]>(() => (poolName ? (payload.pools[poolName] ?? []) : []), [payload, poolName]);
  const itemById = useMemo(() => new Map(poolItems.map((item) => [item.id, item])), [poolItems]);
  const total = poolItems.length;

  /** Every item's own CORRECT group id, resolved once per payload. */
  const correctGroupOf = useMemo(() => {
    const map = new Map<string, string>();
    groups.forEach((group) => group.itemIds.forEach((itemId) => map.set(itemId, group.id)));
    return map;
  }, [groups]);

  const [round, setRound] = useState(0);
  const [placements, setPlacements] = useState<Record<string, string>>({});
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lockedIds, setLockedIds] = useState<ReadonlySet<string>>(new Set());
  const [wrongIds, setWrongIds] = useState<ReadonlySet<string>>(new Set());
  const [phase, setPhase] = useState<Phase>('playing');
  const [settling, setSettling] = useState(false);
  // Honest score (owner review, build item N1 follow-up): this template only
  // ever reaches "done" once every item is EVENTUALLY locked correct, so
  // `lockedIds.size` alone always reads "N de N". `attempted` +
  // `firstTryCorrect` instead track, per item, whether its VERY FIRST
  // "Comprobar" was already right — see `handleCheck`'s own comment.
  const [attempted, setAttempted] = useState<ReadonlySet<string>>(new Set());
  const [firstTryCorrect, setFirstTryCorrect] = useState<ReadonlySet<string>>(new Set());
  // UX audit F10: the one polite live-region sentence after "Comprobar" —
  // see `CheckMark.tsx`'s own `gradeSummary` header for the exact wording.
  const [announcement, setAnnouncement] = useState('');
  const settleTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const trayRef = useRef<HTMLUListElement | null>(null);

  function resetTo(nextRound: number) {
    if (settleTimeout.current) clearTimeout(settleTimeout.current);
    setRound(nextRound);
    setPlacements({});
    setPickedId(null);
    setActiveId(null);
    setLockedIds(new Set());
    setWrongIds(new Set());
    setPhase('playing');
    setSettling(false);
    setAttempted(new Set());
    setFirstTryCorrect(new Set());
    setAnnouncement('');
  }

  // A different block (or its own content changed) — start fresh.
  useEffect(() => {
    resetTo(0);
    // Deliberately keyed on `payload` alone, same reasoning `QuizMatching`/
    // `QuizCloze` document at their own reset effect: a different block
    // always brings different groups/items too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload]);

  useEffect(() => () => {
    if (settleTimeout.current) clearTimeout(settleTimeout.current);
  }, []);

  const trayOrder = useMemo(
    () => shuffleWithSeed(poolItems.map((item) => item.id), seedFromString(`${seed}:groupsort:${round}`)),
    [poolItems, seed, round],
  );

  /**
   * Each item's own stable colour — its fixed index in `trayOrder` (owner
   * spec: "siempre variadas"), same recipe `QuizMatching.tsx` uses, and for
   * the same reason: a group box holds a LOCKED item forever once correct
   * (`handleCheck`'s own comment), so this must stay keyed off `trayOrder`
   * (unaffected by where an item currently sits), never off a per-group
   * index that would reassign colours the moment items move between boxes.
   */
  const colorIndexById = useMemo(() => new Map(trayOrder.map((id, index) => [id, index])), [trayOrder]);
  function colorIndexFor(id: string): number {
    return colorIndexById.get(id) ?? 0;
  }

  if (total === 0 || groups.length === 0) return null;

  // `placements` keeps a locked item's entry forever (see `handleCheck`'s own
  // comment), so its own key count already covers every item placed
  // SOMEWHERE, locked or not — nothing to add.
  const isComplete = Object.keys(placements).length === total;
  const trayIds = trayOrder.filter((id) => !placements[id] && !lockedIds.has(id));
  useFlip(trayRef, trayIds.join(','), reducedMotion);
  const sensors = useGameDndSensors();
  const locked = phase === 'done';

  function itemLabel(id: string | number): string | null {
    return itemById.get(String(id))?.text ?? itemById.get(String(id))?.id ?? null;
  }

  function groupLabel(groupId: string): string {
    return groups.find((g) => g.id === groupId)?.label ?? groupId;
  }

  function placeItem(itemId: string, groupId: string) {
    if (locked || lockedIds.has(itemId)) return;
    setPlacements((prev) => ({ ...prev, [itemId]: groupId }));
    setWrongIds((prev) => {
      if (!prev.has(itemId)) return prev;
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
    setPickedId(null);
    sound.play('drop');
  }

  function sendToTray(itemId: string) {
    if (locked || lockedIds.has(itemId)) return;
    setPlacements((prev) => {
      if (!(itemId in prev)) return prev;
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    setWrongIds((prev) => {
      if (!prev.has(itemId)) return prev;
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
    sound.play('pickUp');
  }

  function handleTrayTileClick(id: string) {
    if (locked) return;
    setPickedId((current) => (current === id ? null : id));
  }

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(String(active.id));
    sound.play('pickUp');
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    const itemId = String(active.id);
    if (lockedIds.has(itemId)) return;
    const groupId = over ? groupIdFromDrop(String(over.id)) : null;
    if (!groupId) {
      sendToTray(itemId);
      return;
    }
    placeItem(itemId, groupId);
  }

  function handleDragCancel() {
    setActiveId(null);
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      const label = itemLabel(active.id);
      return label ? copy.pickedUp(label) : undefined;
    },
    onDragOver: ({ active, over }) => {
      const label = itemLabel(active.id);
      const groupId = over ? groupIdFromDrop(String(over.id)) : null;
      if (!label || !groupId) return undefined;
      return copy.over(label, groupLabel(groupId));
    },
    onDragEnd: ({ active, over }) => {
      const label = itemLabel(active.id);
      if (!label) return undefined;
      const groupId = over ? groupIdFromDrop(String(over.id)) : null;
      return groupId ? copy.dropped(label, groupLabel(groupId)) : copy.returned(label);
    },
    onDragCancel: ({ active }) => {
      const label = itemLabel(active.id);
      return label ? copy.cancelled(label) : undefined;
    },
  };
  const screenReaderInstructions: ScreenReaderInstructions = { draggable: copy.instructions };

  function handleCheck() {
    if (locked || !isComplete) return;
    const newlyCorrect = new Set<string>();
    const newlyWrong = new Set<string>();
    // First-try accuracy (owner review, build item N1 follow-up): an item
    // reaches here at most once per "Comprobar" it is part of, and a locked
    // (already-correct) item is skipped entirely above — so `!attempted.has`
    // is exactly "this is this item's first-ever grading", decided once and
    // never revisited even if a later check fixes it.
    const newlyAttempted = new Set<string>();
    const newlyFirstTryCorrect = new Set<string>();

    for (const [itemId, groupId] of Object.entries(placements)) {
      // Already confirmed correct by an earlier "Comprobar" — locked in
      // place, never re-graded.
      if (lockedIds.has(itemId)) continue;
      const firstAttempt = !attempted.has(itemId);
      if (firstAttempt) newlyAttempted.add(itemId);
      if (correctGroupOf.get(itemId) === groupId) {
        newlyCorrect.add(itemId);
        if (firstAttempt) newlyFirstTryCorrect.add(itemId);
      } else {
        newlyWrong.add(itemId);
      }
    }

    const nextLocked = new Set(lockedIds);
    newlyCorrect.forEach((id) => nextLocked.add(id));
    setLockedIds(nextLocked);
    setWrongIds(newlyWrong);
    // Reports what THIS "Comprobar" just graded, not the board's running
    // total — an already-locked item was skipped above, never re-counted.
    setAnnouncement(gradeSummary(lang, newlyCorrect.size, newlyWrong.size) ?? '');
    if (newlyAttempted.size > 0) setAttempted((prev) => new Set([...prev, ...newlyAttempted]));
    if (newlyFirstTryCorrect.size > 0) {
      setFirstTryCorrect((prev) => new Set([...prev, ...newlyFirstTryCorrect]));
    }

    if (newlyCorrect.size > 0) sound.play('correct');
    if (newlyWrong.size > 0) sound.play('wrong');

    if (nextLocked.size === total) {
      setSettling(true);
      const settleMs = reducedMotion ? 0 : SETTLE_MS;
      settleTimeout.current = setTimeout(() => {
        setSettling(false);
        setPhase('done');
        sound.play('finish');
      }, settleMs);
    }
  }

  function handleRetry() {
    resetTo(round + 1);
  }

  if (phase === 'done') {
    // Never with eventual mistakes (build item N1): "Comprobar" only ever
    // reaches "done" once every item is locked correct (see `handleCheck`'s
    // own header) — `GameResult`'s own "Repasar las que fallé" has nothing
    // to apply to, and is omitted (no `onReviewWrong`). The SCORE shown is
    // first-try accuracy instead (`firstTryCorrect.size`, owner review,
    // build item N1 follow-up) — `total`/`total` would otherwise hide every
    // wrong check along the way.
    return (
      <div data-testid="quiz-groupsort" className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="flex flex-none items-center justify-end gap-1">
          <GameSoundToggle
            muted={sound.muted}
            onToggle={sound.toggleMuted}
            labelMute={t.groupSortSoundMute}
            labelUnmute={t.groupSortSoundUnmute}
          />
        </div>
        <GameResult
          lang={lang}
          correct={firstTryCorrect.size}
          total={total}
          resultWord={UI_LABELS[lang].activities.gameResult.firstTryWord}
          onPlayAgain={handleRetry}
          nextHref={nextHref}
          guest={guest}
        />
      </div>
    );
  }

  const activeLabel = activeId ? itemLabel(activeId) : null;

  return (
    <div data-testid="quiz-groupsort" className="flex min-h-0 flex-1 flex-col gap-4">
      <div aria-live="polite" role="status" className="sr-only" data-testid="groupsort-live-region">
        {announcement}
      </div>
      {/* `flex-none`: a tidy chrome row that NEVER shrinks — same owner bug
          `QuizMatching.tsx`'s own control row documents. */}
      <div data-testid="groupsort-controls" className="flex flex-none items-center justify-end gap-1">
        <GameSoundToggle
          muted={sound.muted}
          onToggle={sound.toggleMuted}
          labelMute={t.groupSortSoundMute}
          labelUnmute={t.groupSortSoundUnmute}
        />
      </div>

      {/* FLOATING COMPROBAR (build item 5) — see `scale.ts`'s own
          `FLOATING_CHECK_BAR_CLASS` header. */}
      <div
        data-testid="groupsort-actions"
        className={FLOATING_CHECK_BAR_CLASS}
      >
        <Button
          type="button"
          data-testid="groupsort-check"
          className="min-h-11"
          onClick={handleCheck}
          disabled={settling || !isComplete}
        >
          {t.groupSortCheck}
        </Button>
      </div>

      <DndContext
        id={`dnd-groupsort-${seed}`}
        sensors={sensors}
        collisionDetection={closestCenter}
        accessibility={{ announcements, screenReaderInstructions }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {/* `justify-center`: a board with few groups/items is naturally
            short — center it in the stage's own available height instead
            of pinning to the top and leaving the rest empty (visual-polish
            pass), same reasoning `QuizMatching`'s own content wrapper
            documents. Only THIS outer row is centered, never the
            scrollable div below — see that file's own header on why. */}
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-3">
          <div
            data-testid="groupsort-stage"
            className={cn('flex min-h-0 flex-col overflow-y-auto', STAGE_BOTTOM_RESERVE_CLASS, STAGE_SAFE_INSET_CLASS)}
          >
          {/* THE SHEET (activity-templates-polish pass, proposal §d): one
              white card holding tray + board, shared material with the
              other three moulds (`ACTIVITY_SHEET_CLASS`, `mechanics/chip.ts`). */}
          <div data-testid="activity-sheet" className={cn(ACTIVITY_SHEET_CLASS, 'flex flex-col gap-6')}>
          {/* THE TRAY, ABOVE THE BOARD (UI pass, owner spec: "mover las
              opciones arriba" — same DOM-order move `QuizMatching.tsx`
              documents for "Une las parejas", applied here too for
              consistency: this template shares the exact same tray-below-
              board structure). Same `STAGE_CONTENT_MEASURE` cap as the board
              below, so the tray is centred over the SAME board width. */}
          <ul
            ref={trayRef}
            data-testid="groupsort-tray"
            aria-label={t.groupSortTrayLabel}
            // Always `flex-wrap`, never a horizontal scroller below `sm` —
            // same mobile-tray-clipping bug `QuizMatching.tsx`'s own tray
            // documents.
            className={cn('flex list-none flex-wrap gap-3 p-0 pb-2', STAGE_CONTENT_MEASURE)}
          >
            {trayIds.map((id) => {
              const item = itemById.get(id);
              if (!item) return null;
              const label = item.text ?? item.id;
              return (
                <li key={id} className="shrink-0">
                  <ItemTile
                    id={id}
                    label={label}
                    disabled={settling}
                    draggable
                    dragging={activeId === id}
                    picked={pickedId === id}
                    placed={false}
                    locked={false}
                    wrong={false}
                    reducedMotion={reducedMotion}
                    onClick={() => handleTrayTileClick(id)}
                    colorIndex={colorIndexFor(id)}
                  />
                </li>
              );
            })}
          </ul>

          <div
            data-testid="groupsort-board"
            className={cn('grid gap-3', groupGridColsClass(groups.length), STAGE_CONTENT_MEASURE)}
          >
            {groups.map((group, groupIndex) => {
              // Every item CURRENTLY sitting in this group box: `placements`
              // keeps its entry even once an item is locked correct (`handleCheck`
              // only ever ADDS to `lockedIds`, it never removes the placement),
              // so this one filter covers both a freshly dropped item and an
              // already-locked one, in the order it was placed.
              const items = Object.entries(placements)
                .filter(([, groupId]) => groupId === group.id)
                .map(([itemId]) => itemById.get(itemId))
                .filter((item): item is PoolItem => Boolean(item));
              return (
                <GroupBox
                  key={group.id}
                  groupId={group.id}
                  groupIndex={groupIndex}
                  label={group.label}
                  items={items}
                  lockedIds={lockedIds}
                  wrongIds={wrongIds}
                  activeId={activeId}
                  disabled={settling}
                  canPlacePicked={pickedId !== null}
                  onPlacePicked={() => pickedId && placeItem(pickedId, group.id)}
                  onRemoveItem={sendToTray}
                  reducedMotion={reducedMotion}
                  emptyLabel={t.groupSortEmptyGroup}
                  removeLabel={t.groupSortRemovePrefix}
                  lang={lang}
                  colorIndexFor={colorIndexFor}
                />
              );
            })}
          </div>
          </div>
          </div>
        </div>

        <DragOverlay dropAnimation={gameDropAnimation(reducedMotion)}>
          {activeLabel && activeId ? (
            <div
              className={cn(
                stageChipColorClass(colorIndexFor(activeId)),
                'pointer-events-none',
                liftedTileClassName(reducedMotion),
              )}
            >
              {activeLabel}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
