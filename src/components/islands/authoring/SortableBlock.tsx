/**
 * SortableBlock — the drag wiring for one authoring block (slice 14,
 * design.md §8: "`useSortable` + `CSS.Transform.toString`").
 *
 * `{...attributes}{...listeners}` bind to a dedicated, accessibly-named
 * `<button>` drag handle — NEVER to the block container. `setNodeRef` binds
 * to the container. This is the whole answer to research unknown #7 (design
 * §8): the classic dnd-kit line has no `preventActivation` equivalent, so
 * Space inside a block's own `<textarea>` only avoids starting a drag
 * because no listener is ever attached there. A real, nameable, tabbable
 * handle beats suppression on accessibility anyway.
 *
 * Content-agnostic on purpose: this component knows nothing about
 * `exercisePayload.ts`'s `Block` union. `BlockList` supplies `children` via
 * its `renderItem` prop, so the block EDITORS (slice 15) are the only place
 * that ever imports the exercise model.
 */
import type { ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/**
 * The lucide `GripVertical` glyph, as six dots.
 *
 * ICONS ARE DATA IN THIS PROJECT, never `lucide-react` component imports
 * (the standing rule behind `skillIcons.ts`, `arrowControl.ts` and
 * `LikeButton.tsx`'s `HEART_PATH`). Copied verbatim from
 * `node_modules/lucide-react/dist/esm/icons/grip-vertical.mjs`,
 * lucide-react v1.27.0, ISC licensed.
 */
const GRIP_DOTS: ReadonlyArray<readonly [cx: number, cy: number]> = [
  [9, 5],
  [9, 12],
  [9, 19],
  [15, 5],
  [15, 12],
  [15, 19],
];

export interface SortableBlockProps {
  /** Stable id, matching the item's id in the `SortableContext` list. */
  id: string;
  /** Accessible name for the drag handle — must name the BLOCK, not just "move". */
  handleLabel: string;
  children: ReactNode;
}

export default function SortableBlock({ id, handleLabel, children }: SortableBlockProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition ?? undefined,
      }}
      data-testid={`authoring-block-${id}`}
      data-dragging={isDragging ? 'true' : undefined}
      className="flex items-start gap-2 rounded-md border border-border bg-card p-3"
    >
      <button
        type="button"
        aria-label={handleLabel}
        data-testid={`authoring-block-handle-${id}`}
        // `touch-none`: same rule `PoolTile` (DropRenderer.tsx) follows —
        // without it a touch drag also scrolls the page underneath it.
        className="mt-1 flex shrink-0 touch-none cursor-grab items-center justify-center rounded-md p-2 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="currentColor"
          aria-hidden="true"
        >
          {GRIP_DOTS.map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1} />
          ))}
        </svg>
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
