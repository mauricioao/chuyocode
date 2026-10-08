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
import {
  STAGE_BOX_MIN_HEIGHT_SCALE,
  TILE_MIN_HEIGHT_SCALE,
  TILE_PADDING_X_SCALE,
  TILE_PADDING_Y_SCALE,
  TILE_TEXT_SCALE,
} from '@/components/islands/mechanics/scale';

export interface QuizGroupSortProps {
  lang: Lang;
  /** The whole block's own payload — every group is one `group`-mechanic slot, every tile lives in the one pool they all share. */
  payload: Payload;
  /** Stable per-block seed (the block id) — the tray's own shuffle and "Reintentar". */
  seed: string;
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

/** Shared visual base for every item tile — the shared "big stage" scale (`mechanics/scale.ts`), same recipe every sibling game uses. */
const TILE_BASE = cn(
  'inline-flex items-center justify-center rounded-md border border-input bg-card text-center font-medium text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
  TILE_MIN_HEIGHT_SCALE,
  TILE_PADDING_X_SCALE,
  TILE_PADDING_Y_SCALE,
  TILE_TEXT_SCALE,
);

interface ItemTileProps {
  id: string;
  label: string;
  disabled: boolean;
  draggable: boolean;
  dragging: boolean;
  picked: boolean;
  locked: boolean;
  wrong: boolean;
  reducedMotion: boolean;
  onClick: () => void;
  ariaLabel?: string;
}

function ItemTile({ id, label, disabled, draggable, dragging, picked, locked, wrong, reducedMotion, onClick, ariaLabel }: ItemTileProps) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id, disabled: disabled || !draggable });

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
        TILE_BASE,
        draggable && 'touch-none',
        dragging && 'opacity-40',
        picked && !dragging && 'ring-2 ring-ring',
        locked && 'border-success-strong bg-success-strong/10 text-success-strong-foreground',
        wrong && 'animate-pulse border-destructive bg-destructive/10 text-destructive motion-reduce:animate-none',
        gameTileTransitionClassName(reducedMotion),
      )}
    >
      {label}
    </button>
  );
}

interface GroupBoxProps {
  groupId: string;
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
}

/** One group's own big labelled box — a drop target that holds EVERY tile currently placed in it, not just one. */
function GroupBox({
  groupId,
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
}: GroupBoxProps) {
  const { isOver, setNodeRef } = useDroppable({ id: groupDropId(groupId), disabled });

  return (
    <div
      ref={setNodeRef}
      data-testid={`groupsort-board-group-${groupId}`}
      className={cn(
        'flex flex-1 flex-col gap-2 rounded-lg border-2 border-dashed border-input bg-surface-soft p-3 transition-colors sm:min-w-48',
        STAGE_BOX_MIN_HEIGHT_SCALE,
        isOver && !disabled && 'border-ring bg-accent/20',
        canPlacePicked && !disabled && 'border-ring',
      )}
    >
      <p className={cn('text-center font-semibold text-foreground', TILE_TEXT_SCALE)}>{label}</p>
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
              locked={locked}
              wrong={wrong}
              reducedMotion={reducedMotion}
              onClick={locked ? () => {} : canPlacePicked ? onPlacePicked : () => onRemoveItem(item.id)}
              ariaLabel={`${removeLabel} ${label2}`}
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

export default function QuizGroupSort({ lang, payload, seed }: QuizGroupSortProps) {
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

    for (const [itemId, groupId] of Object.entries(placements)) {
      // Already confirmed correct by an earlier "Comprobar" — locked in
      // place, never re-graded.
      if (lockedIds.has(itemId)) continue;
      if (correctGroupOf.get(itemId) === groupId) newlyCorrect.add(itemId);
      else newlyWrong.add(itemId);
    }

    const nextLocked = new Set(lockedIds);
    newlyCorrect.forEach((id) => nextLocked.add(id));
    setLockedIds(nextLocked);
    setWrongIds(newlyWrong);

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
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center">
          <p data-testid="groupsort-result" aria-live="polite" className="text-xl font-medium text-foreground sm:text-2xl">
            {total} {t.groupSortResultOf} {total} {t.groupSortResultCorrect}
          </p>
          <Button type="button" data-testid="groupsort-retry" className="min-h-11" onClick={handleRetry}>
            {t.groupSortRetry}
          </Button>
        </div>
      </div>
    );
  }

  const activeLabel = activeId ? itemLabel(activeId) : null;

  return (
    <div data-testid="quiz-groupsort" className="flex min-h-0 flex-1 flex-col gap-4">
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
          <div data-testid="groupsort-stage" className="flex min-h-0 flex-col gap-6 overflow-y-auto">
          <div data-testid="groupsort-board" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            {groups.map((group) => {
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
                />
              );
            })}
          </div>

          <ul
            ref={trayRef}
            data-testid="groupsort-tray"
            aria-label={t.groupSortTrayLabel}
            className="flex list-none gap-3 overflow-x-auto p-0 pb-2 sm:flex-wrap sm:overflow-visible"
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
                    locked={false}
                    wrong={false}
                    reducedMotion={reducedMotion}
                    onClick={() => handleTrayTileClick(id)}
                  />
                </li>
              );
            })}
          </ul>
          </div>

          {/* `flex-none`, a SIBLING of the scrollable div above — same
              "never scrolls away" guarantee `QuizMatching.tsx`'s own action
              row documents. */}
          <div className="flex flex-none justify-end">
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
        </div>

        <DragOverlay dropAnimation={gameDropAnimation(reducedMotion)}>
          {activeLabel ? (
            <div className={cn(TILE_BASE, 'pointer-events-none', liftedTileClassName(reducedMotion))}>{activeLabel}</div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
