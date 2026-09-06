/**
 * `drop` — drag a tile from the pool into this slot's box.
 *
 * Reports the dropped ITEM ID, exactly like `choice` and `select`, which is why
 * this mechanic reuses the `set` comparator instead of growing a new one. The
 * mechanic is a RENDERING concern; grading never learns that a drag happened
 * (docs/exercise-model.md, "Stable ids, never positions").
 *
 * ALL STATE LIVES IN `exerciseDrop.ts`, which is pure and tested without a
 * browser. This file is the wiring: dnd-kit for the pointer gesture, plain
 * buttons for everything a keyboard has to reach. Nothing here decides what a
 * drop MEANS — that is `placeTile`, and it is proved by unit tests that jsdom's
 * missing layout engine cannot invalidate.
 *
 * WHY dnd-kit AND NOT THE HTML DRAG-AND-DROP API. The native API has no keyboard
 * story at all: `dragstart` only fires from a pointer, so a keyboard-only
 * learner is locked out of the exercise entirely and nothing reports it. dnd-kit
 * ships a `KeyboardSensor` and a live-region announcer, so the same gesture is
 * available to a pointer, a keyboard and a screen reader.
 *
 * ONE DndContext PER SLOT, deliberately. Each renderer instance owns its own
 * context, so a tile can never be dragged from one question's box into another's
 * — a gesture the model has no answer shape for. Cross-slot consistency is kept
 * by `claimed` instead, which the island derives from the WHOLE response.
 */
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type ScreenReaderInstructions,
} from '@dnd-kit/core';
import { Label } from '@/components/ui/label';
import { availableTiles, clearTile, placeTile, placedTile } from '@/lib/exerciseDrop';
import { splitLabelAtBlank, type PoolItem } from '@/lib/exercisePayload';
import BlankSentence from './BlankSentence';
import type { MechanicRendererProps } from './types';

/**
 * Screen-reader copy for this mechanic.
 *
 * LOCAL, not `UI_LABELS`: this is a React island and importing the Astro-side
 * i18n module would drag it into the client bundle (see AdModal.tsx and
 * ExerciseIsland.tsx). It is also whole SENTENCES rather than one label, which
 * is why `drop` needs `lang` where the other mechanics only need `placeholder`.
 *
 * REGISTER (standing project rule): neutral Spanish, infinitive, and nothing
 * addressed to the learner in the second person — which removes the tú/vos fork
 * instead of picking a side of it.
 */
interface DropCopy {
  /** How to operate the mechanic without a pointer. Read once, on focus. */
  instructions: string;
  pickedUp: (tile: string) => string;
  over: (tile: string, box: string) => string;
  dropped: (tile: string, box: string) => string;
  /** Appended to {@link DropCopy.dropped} when the box was already occupied. */
  displaced: (tile: string) => string;
  /** Released over nothing, so the tile never left the pool. */
  returned: (tile: string) => string;
  cancelled: (tile: string) => string;
  /** Accessible name of the placed tile, whose activation empties the box. */
  remove: (tile: string) => string;
  /** Visible content of an empty box, so it reads as a target and not a gap. */
  empty: string;
}

export const DROP_COPY: Record<'es' | 'en', DropCopy> = {
  es: {
    instructions:
      'Para colocar una ficha con el teclado: presionar Espacio o Enter para tomarla, las flechas para moverla, y Espacio o Enter otra vez para soltarla. Escape cancela el movimiento.',
    pickedUp: (tile) => `Ficha ${tile} tomada.`,
    over: (tile, box) => `Ficha ${tile} sobre la casilla ${box}.`,
    dropped: (tile, box) => `Ficha ${tile} colocada en la casilla ${box}.`,
    displaced: (tile) => `La ficha ${tile} vuelve a las fichas disponibles.`,
    returned: (tile) => `Ficha ${tile} sin colocar. Vuelve a las fichas disponibles.`,
    cancelled: (tile) =>
      `Movimiento cancelado. La ficha ${tile} vuelve a las fichas disponibles.`,
    remove: (tile) => `Quitar la ficha ${tile} de la casilla`,
    empty: 'Casilla vacía',
  },
  en: {
    instructions:
      'To place a tile with the keyboard: press Space or Enter to pick it up, the arrow keys to move it, and Space or Enter again to drop it. Escape cancels the move.',
    pickedUp: (tile) => `Tile ${tile} picked up.`,
    over: (tile, box) => `Tile ${tile} over the ${box} box.`,
    dropped: (tile, box) => `Tile ${tile} placed in the ${box} box.`,
    displaced: (tile) => `Tile ${tile} returns to the available tiles.`,
    returned: (tile) => `Tile ${tile} was not placed. It returns to the available tiles.`,
    cancelled: (tile) => `Move cancelled. Tile ${tile} returns to the available tiles.`,
    remove: (tile) => `Remove tile ${tile} from the box`,
    empty: 'Empty box',
  },
};

/** Resolve copy for a locale, defaulting to English — same rule as the island. */
function copyFor(lang: string | undefined): DropCopy {
  return lang === 'es' ? DROP_COPY.es : DROP_COPY.en;
}

/**
 * A tile's spoken and visible name.
 *
 * `text` when the author wrote one, the id otherwise. An IMAGE tile usually has
 * no text, and falling through to the id keeps it nameable rather than leaving
 * a button with no accessible name at all — which is the failure mode that makes
 * an image-matching exercise unusable by ear.
 */
function tileLabel(item: PoolItem): string {
  return item.text ?? item.id;
}

/** Shared visual tokens, so a tile in the pool and the same tile in the box match. */
const TILE_BASE =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-input bg-card px-3 py-2 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50';

/** The box: dashed while empty so it reads as "something goes here". */
const BOX_BASE =
  'mx-1 inline-flex min-h-12 min-w-24 items-center justify-center rounded-md border-2 border-dashed border-input align-middle transition-colors';

/** The face of a tile — an image when the author supplied one, else its text. */
function TileFace({ item }: { item: PoolItem }) {
  if (item.media) {
    // `alt=""` on purpose: the accessible name is carried by the BUTTON, and a
    // duplicate alt would make a screen reader say the tile twice.
    return <img src={item.media} alt="" className="h-16 w-16 object-contain" />;
  }
  return <span>{tileLabel(item)}</span>;
}

interface DropBoxProps {
  id: string;
  slotId: string;
  /** The tile currently in the box, or `null` when it is empty. */
  tile: PoolItem | null;
  disabled: boolean;
  onRemove: () => void;
  copy: DropCopy;
}

/**
 * The target. A region, not a control — until it holds a tile, at which point
 * the tile itself becomes the button that empties it.
 *
 * REMOVAL IS A CLICK ON THE PLACED TILE, and the placed tile is deliberately NOT
 * draggable. Making it draggable would put dnd-kit's keyboard activator
 * (Space/Enter) on the same element as the remove action, and the activator
 * calls `preventDefault` — so a keyboard learner could pick the tile up but
 * could never put it back, silently. One element, one keyboard meaning.
 *
 * Nothing is lost by that: there is exactly one box per DndContext here, so
 * "drag the placed tile to another box" is not a gesture this mechanic has.
 */
function DropBox({ id, slotId, tile, disabled, onRemove, copy }: DropBoxProps) {
  const { isOver, setNodeRef } = useDroppable({ id, disabled });

  return (
    <span
      ref={setNodeRef}
      data-testid={`drop-box-${slotId}`}
      data-over={isOver ? 'true' : undefined}
      data-filled={tile ? 'true' : undefined}
      className={`${BOX_BASE} ${isOver ? 'border-ring bg-accent/30' : ''}`}
    >
      {tile ? (
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          // Overrides the tile's own content: "Remove tile honey from the box"
          // says what activation DOES, which the tile's name alone does not.
          aria-label={copy.remove(tileLabel(tile))}
          className={TILE_BASE}
        >
          <TileFace item={tile} />
        </button>
      ) : (
        <span className="px-3 text-sm text-muted-foreground">{copy.empty}</span>
      )}
    </span>
  );
}

interface PoolTileProps {
  item: PoolItem;
  disabled: boolean;
  /** Wired only on the FIRST tile — the mechanic's focus entry point. */
  focusRef?: (node: HTMLElement | null) => void;
}

/** A draggable tile in the pool. A real `<button>`, so the keyboard can reach it. */
function PoolTile({ item, disabled, focusRef }: PoolTileProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    disabled,
  });

  return (
    <button
      type="button"
      ref={(node) => {
        setNodeRef(node);
        focusRef?.(node);
      }}
      disabled={disabled}
      aria-label={tileLabel(item)}
      // Built by hand rather than with `@dnd-kit/utilities`' `CSS.Translate`:
      // that is a separate package, and one template string is not worth a second
      // direct dependency.
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
          : undefined
      }
      {...attributes}
      {...listeners}
      className={`${TILE_BASE} ${isDragging ? 'opacity-50' : ''} touch-none`}
    >
      <TileFace item={item} />
    </button>
  );
}

export default function DropRenderer({
  slot,
  items,
  value,
  onChange,
  disabled = false,
  claimed = [],
  lang,
  focusRef,
}: MechanicRendererProps) {
  const copy = copyFor(lang);

  // DERIVED, never stored. The pool is "the tiles nobody names", so a displaced
  // tile is back the instant the slot stops naming it — no second list to keep
  // in sync, and therefore no way for the two to disagree (see exerciseDrop.ts).
  const available = availableTiles(items, value, claimed);
  const placed = placedTile(items, value);

  // Scoped by slot id: several drop slots may share one page and one pool.
  const boxId = `${slot.id}-box`;

  const sensors = useSensors(
    // A short distance threshold, so a plain CLICK on a placed tile still
    // reaches its `onClick` instead of being swallowed as a zero-length drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  /** Resolve a dnd-kit id back to the pool item it names, or `null`. */
  function itemFor(id: string | number): PoolItem | null {
    return items.find((item) => item.id === String(id)) ?? null;
  }

  /**
   * Spoken feedback for the whole gesture.
   *
   * Rebuilt every render on purpose: the closures below read `value`, and the
   * displacement sentence is only true relative to what the box holds RIGHT NOW.
   */
  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      const item = itemFor(active.id);
      return item ? copy.pickedUp(tileLabel(item)) : undefined;
    },
    onDragOver: ({ active, over }) => {
      const item = itemFor(active.id);
      if (!item || !over) return undefined;
      return copy.over(tileLabel(item), slot.label);
    },
    onDragEnd: ({ active, over }) => {
      const item = itemFor(active.id);
      if (!item) return undefined;
      // Released over nothing is a real outcome, not a failure: the tile simply
      // never left the pool, and a sighted learner sees it snap back.
      if (!over) return copy.returned(tileLabel(item));

      const { displaced } = placeTile(value, item.id);
      const evicted = displaced ? itemFor(displaced) : null;
      const head = copy.dropped(tileLabel(item), slot.label);
      // The eviction is invisible without this. A sighted learner watches the
      // old tile reappear in the pool; a blind one is only told if we say so.
      return evicted ? `${head} ${copy.displaced(tileLabel(evicted))}` : head;
    },
    onDragCancel: ({ active }) => {
      const item = itemFor(active.id);
      return item ? copy.cancelled(tileLabel(item)) : undefined;
    },
  };

  const screenReaderInstructions: ScreenReaderInstructions = {
    draggable: copy.instructions,
  };

  function handleDragEnd({ active, over }: DragEndEvent) {
    // Dropped outside the box: no change. Returning early rather than clearing
    // is what makes a mis-aimed drag harmless instead of destructive.
    if (!over || over.id !== boxId) return;
    onChange(placeTile(value, String(active.id)).value);
  }

  // `null` means the author wrote no gap — a real style, not a broken label.
  const parts = splitLabelAtBlank(slot.label);

  const box = (
    <DropBox
      id={boxId}
      slotId={slot.id}
      tile={placed}
      disabled={disabled}
      onRemove={() => onChange(clearTile())}
      copy={copy}
    />
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={{ announcements, screenReaderInstructions }}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col gap-3">
        {parts ? (
          <BlankSentence slotId={slot.id} before={parts.before} after={parts.after}>
            {box}
          </BlankSentence>
        ) : (
          <div className="flex flex-col gap-2">
            <Label className="text-base font-medium text-zinc-100">{slot.label}</Label>
            {box}
          </div>
        )}

        {/* A real list, so a screen reader announces how many tiles are left —
            which is the only cue that placing one CONSUMED it. */}
        <ul
          data-testid={`drop-pool-${slot.id}`}
          aria-label={slot.label}
          className="flex list-none flex-wrap gap-2 p-0"
        >
          {available.map((item, index) => (
            <li key={item.id}>
              <PoolTile
                item={item}
                disabled={disabled}
                // The focus entry point is the FIRST remaining tile, matching
                // where a keyboard learner would start. When every tile is
                // placed or claimed there is nothing to focus, and the island's
                // effect falls through harmlessly.
                focusRef={index === 0 ? focusRef : undefined}
              />
            </li>
          ))}
        </ul>
      </div>
    </DndContext>
  );
}
