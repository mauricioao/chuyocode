/**
 * BlockList — reorder ANY list of `{ id: string }` items by dragging (slice
 * 14, design.md §8: "`DndContext` + `SortableContext` + `arrayMove`").
 *
 * DELIVERS A STANDALONE-DEMOABLE REORDER COMPONENT. Deliberately generic and
 * ignorant of `exercisePayload.ts`'s `Block` union: the caller supplies
 * `renderItem` (what a block looks like) and `handleLabelFor` (what its drag
 * handle is called), so this component is reusable outside the exercise
 * model and is provably wired correctly before the real block editors
 * (slice 15) exist.
 *
 * `KeyboardSensor` is registered exactly as `DropRenderer.tsx` already
 * registers it (design §8), so arrow-key reordering works and the project
 * keeps one dnd-kit pattern rather than two.
 */
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import SortableBlock from './SortableBlock';

export interface BlockListItem {
  id: string;
}

export interface BlockListProps<T extends BlockListItem> {
  items: T[];
  /** Called with the FULL reordered array — never a delta or an index pair. */
  onReorder: (next: T[]) => void;
  /** What one block looks like. This component draws only the drag chrome around it. */
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Accessible name for one item's drag handle — must name the block, not just "move". */
  handleLabelFor: (item: T, index: number) => string;
}

export default function BlockList<T extends BlockListItem>({
  items,
  onReorder,
  renderItem,
  handleLabelFor,
}: BlockListProps<T>) {
  const sensors = useSensors(
    // Same short distance threshold DropRenderer.tsx uses: without it, a
    // plain click that lands inside a block (e.g. its own textarea) can be
    // swallowed as a zero-length drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);
    // Dangling ids (should never happen — `SortableContext` is built from
    // these same `items`) degrade to a no-op rather than an out-of-bounds
    // `arrayMove` call.
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(items, oldIndex, newIndex));
  }

  return (
    <DndContext
      // EXPLICIT, never left to dnd-kit's module-level counter — same
      // reasoning `DropRenderer.tsx` documents at its own `DndContext`: an
      // auto-generated id can disagree between the SSR render and the
      // client hydration of a long-lived server process.
      id="authoring-block-list"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="flex flex-col gap-3" data-testid="authoring-block-list">
          {items.map((item, index) => (
            <li key={item.id}>
              <SortableBlock id={item.id} handleLabel={handleLabelFor(item, index)}>
                {renderItem(item, index)}
              </SortableBlock>
            </li>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
