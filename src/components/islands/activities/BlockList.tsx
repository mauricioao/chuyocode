/**
 * BlockList — the editor's ordered center column (PR B, "Activities
 * creator"; reworked in "creator polish round 2").
 *
 * Each block gets a small header: a drag handle (reorder via `@dnd-kit`,
 * mirroring `src/components/islands/authoring/SortableBlock.tsx`'s pattern —
 * `PointerSensor` with a short activation distance, `KeyboardSensor` with
 * `sortableKeyboardCoordinates`), a collapse/expand caret, a type icon, an
 * EDITABLE name (defaulting to "Hoja N"/"Sheet N" by position — see
 * `blockDisplayName`), a zone-count badge and rotate controls (worksheet
 * only), and delete-with-confirm. Only when EXPANDED does a block's own
 * editor render below the header — collapsed and expanded are independent
 * PER BLOCK (owner request #6), not tied to which one is "selected".
 *
 * Only `worksheet` blocks are editable in this PR (`quiz` ships in PR C's
 * question type; none can be authored here, so that branch is defensive,
 * not a real path).
 *
 * DESKTOP "FOCUS" LAYOUT (creator "one-screen" pass): `expandedBlockIds`
 * still means exactly what it always has (owner request #6, above) — this
 * component does not change that model. But when it holds EXACTLY ONE id,
 * that block is the "focus" active block (`focusBlockId`, derived, not a
 * prop): its `<li>` gets `flex-1` so its `WorksheetZoneEditor` canvas can
 * fill the remaining column height, while every OTHER block (collapsed, by
 * definition, in that state) stays a fixed-height, compact row — see
 * `SortableBlockItem`. Zero or 2+ expanded (e.g. the sticky toolbar's
 * "expand all") is deliberately NOT a focus state: every block then keeps
 * its natural height and the page falls back to normal scrolling, which is
 * acceptable and expected for that explicit, occasional action.
 */
import { useState } from 'react';
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
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DotsSixVerticalIcon } from '@phosphor-icons/react/dist/ssr/DotsSixVertical';
import { CaretDownIcon } from '@phosphor-icons/react/dist/ssr/CaretDown';
import { CaretRightIcon } from '@phosphor-icons/react/dist/ssr/CaretRight';
import { TrashIcon } from '@phosphor-icons/react/dist/ssr/Trash';
import { ImageIcon } from '@phosphor-icons/react/dist/ssr/Image';
import { ListChecksIcon } from '@phosphor-icons/react/dist/ssr/ListChecks';
import { ArrowCounterClockwiseIcon } from '@phosphor-icons/react/dist/ssr/ArrowCounterClockwise';
import { ArrowClockwiseIcon } from '@phosphor-icons/react/dist/ssr/ArrowClockwise';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import type { Block, WorksheetBlock, Zone } from '@/lib/activities/blocks';
import { rotateRects, turnRotation, type TurnDirection } from '@/lib/activities/zoneGeometry';
import { Button } from '@/components/ui/button';
import WorksheetZoneEditor from './WorksheetZoneEditor';

export interface BlocksChangeOptions {
  /**
   * `false` for a live, in-progress update (a zone being dragged) that must
   * NOT create its own undo step; omitted/`true` for every discrete change
   * (add/delete/rename/reorder/rotate, or the final pointerup of a drag).
   */
  commit?: boolean;
}

export interface BlockListProps {
  lang: Lang;
  blocks: Block[];
  /** Which blocks currently show their own editor below the header. */
  expandedBlockIds: ReadonlySet<string>;
  selectedZoneId: string | null;
  /** Resolves a stored `image.path` to a browser-loadable preview URL. */
  resolveImageUrl: (path: string) => string;
  onToggleExpand: (blockId: string) => void;
  onSelectZone: (zoneId: string | null) => void;
  onBlocksChange: (blocks: Block[], opts?: BlocksChangeOptions) => void;
}

function isWorksheet(block: Block): block is WorksheetBlock {
  return block.type === 'worksheet';
}

/**
 * "Hoja 1"/"Sheet 1" etc. by position, or the author's own name if set —
 * exported so the sticky toolbar's block-index popover names blocks the
 * same way this list does.
 */
export function blockDisplayName(block: Block, index: number, defaultPrefix: string): string {
  return block.name ?? `${defaultPrefix} ${index + 1}`;
}

/** Delete-with-confirm: an inline confirm step, not a modal dialog. */
function DeleteBlockButton({
  deleteLabel,
  confirmTitle,
  confirmBody,
  cancelLabel,
  acceptLabel,
  onConfirm,
}: {
  deleteLabel: string;
  confirmTitle: string;
  confirmBody: string;
  cancelLabel: string;
  acceptLabel: string;
  onConfirm: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div data-testid="delete-confirm" className="flex items-center gap-2 rounded-md bg-destructive/10 px-2 py-1">
        <span className="text-xs text-destructive">{confirmTitle}</span>
        <span className="sr-only">{confirmBody}</span>
        <Button type="button" size="xs" variant="ghost" onClick={() => setConfirming(false)}>
          {cancelLabel}
        </Button>
        <Button
          type="button"
          size="xs"
          variant="destructive"
          data-testid="delete-confirm-accept"
          onClick={() => {
            setConfirming(false);
            onConfirm();
          }}
        >
          {acceptLabel}
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      aria-label={deleteLabel}
      data-testid="delete-block-trigger"
      onClick={() => setConfirming(true)}
    >
      <TrashIcon aria-hidden="true" />
    </Button>
  );
}

/** The drag wiring for one block — same `useSortable` pattern as `authoring/SortableBlock.tsx`. */
function SortableBlockItem({
  id,
  handleLabel,
  focusActive,
  children,
}: {
  id: string;
  handleLabel: string;
  /**
   * Desktop "focus" layout (creator "one-screen" pass): true for the ONE
   * expanded block when it is the sole expanded one — see `focusBlockId`
   * below. It gets the flexible height that lets its canvas fill the
   * remaining space; every other row (including a collapsed block, or ANY
   * block when zero/multiple are expanded — e.g. "expand all") stays a
   * fixed-height, compact row and the page falls back to normal scrolling
   * if that no longer fits (documented, acceptable).
   */
  focusActive: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <li
      ref={setNodeRef}
      id={`block-${id}`}
      style={{ transform: CSS.Transform.toString(transform), transition: transition ?? undefined }}
      data-dragging={isDragging ? 'true' : undefined}
      data-focus-active={focusActive ? 'true' : undefined}
      className={`flex min-h-0 flex-col rounded-lg border border-border ${
        focusActive ? 'lg:min-h-[22rem] lg:flex-1' : 'lg:flex-none'
      }`}
    >
      <div className="flex min-h-0 flex-1 items-start gap-1 px-1 pt-1">
        <button
          type="button"
          aria-label={handleLabel}
          data-testid={`block-handle-${id}`}
          className="mt-1 flex shrink-0 touch-none cursor-grab items-center justify-center rounded-md p-1.5 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <DotsSixVerticalIcon aria-hidden="true" />
        </button>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </li>
  );
}

export default function BlockList({
  lang,
  blocks,
  expandedBlockIds,
  selectedZoneId,
  resolveImageUrl,
  onToggleExpand,
  onSelectZone,
  onBlocksChange,
}: BlockListProps) {
  const t = UI_LABELS[lang].activities.editor;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const oldIndex = blocks.findIndex((b) => b.id === active.id);
    const newIndex = blocks.findIndex((b) => b.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onBlocksChange(arrayMove(blocks, oldIndex, newIndex));
  }

  const renameBlock = (blockId: string, raw: string) => {
    onBlocksChange(blocks.map((b) => (b.id === blockId ? { ...b, name: raw.length === 0 ? undefined : raw } : b)));
  };

  const deleteBlock = (blockId: string) => {
    onBlocksChange(blocks.filter((b) => b.id !== blockId));
  };

  const updateZones = (blockId: string, zones: Zone[], opts?: BlocksChangeOptions) => {
    onBlocksChange(
      blocks.map((b) => (b.id === blockId && isWorksheet(b) ? { ...b, zones } : b)),
      opts,
    );
  };

  const rotateBlock = (blockId: string, direction: TurnDirection) => {
    onBlocksChange(
      blocks.map((b) =>
        b.id === blockId && isWorksheet(b)
          ? { ...b, rotation: turnRotation(b.rotation, direction), zones: rotateRects(b.zones, direction) }
          : b,
      ),
    );
  };

  if (blocks.length === 0) {
    return (
      <p data-testid="blocks-empty" className="text-sm text-muted-foreground">
        {t.blocksEmpty}
      </p>
    );
  }

  // The desktop "focus" layout's active block: exactly ONE currently-expanded
  // block, derived straight from `expandedBlockIds` (no new prop — every
  // existing caller, including this component's own tests, keeps working
  // unchanged). Zero or 2+ expanded is not a focus state — see
  // `SortableBlockItem`'s own comment.
  const focusBlockId = expandedBlockIds.size === 1 ? [...expandedBlockIds][0] : null;

  return (
    <DndContext id="activities-block-list" sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
        <ul data-testid="block-list" className="flex flex-col gap-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          {blocks.map((block, index) => {
            const expanded = expandedBlockIds.has(block.id);
            const worksheet = isWorksheet(block) ? block : null;
            const name = blockDisplayName(block, index, t.blockDefaultNamePrefix);
            const zoneCount = worksheet?.zones.length ?? 0;

            return (
              <SortableBlockItem
                key={block.id}
                id={block.id}
                handleLabel={`${t.dragHandle}: ${name}`}
                focusActive={focusBlockId === block.id}
              >
                <div data-testid={`block-${block.id}`} className="flex min-h-0 flex-1 flex-col">
                  <div className="flex flex-none flex-wrap items-center gap-2 py-1">
                    <button
                      type="button"
                      data-testid={`block-header-${block.id}`}
                      aria-expanded={expanded}
                      aria-label={expanded ? t.collapseBlock : t.expandBlock}
                      onClick={() => onToggleExpand(block.id)}
                      className="flex shrink-0 items-center justify-center rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      {expanded ? <CaretDownIcon aria-hidden="true" /> : <CaretRightIcon aria-hidden="true" />}
                    </button>

                    <span className="shrink-0 text-primary" aria-hidden="true">
                      {worksheet ? (
                        <ImageIcon weight="duotone" size={18} />
                      ) : (
                        <ListChecksIcon weight="duotone" size={18} />
                      )}
                    </span>

                    <input
                      type="text"
                      value={name}
                      maxLength={60}
                      aria-label={t.blockNameLabel}
                      placeholder={t.blockNamePlaceholder}
                      onChange={(e) => renameBlock(block.id, e.target.value)}
                      className="h-7 min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-sm font-medium text-foreground hover:border-border focus-visible:border-border focus-visible:outline-none"
                    />

                    {worksheet && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {zoneCount} {zoneCount === 1 ? t.zoneCountOne : t.zoneCountMany}
                      </span>
                    )}

                    {worksheet && (
                      <>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label={t.rotateLeft}
                          data-testid={`rotate-left-${block.id}`}
                          onClick={() => rotateBlock(block.id, 'ccw')}
                        >
                          <ArrowCounterClockwiseIcon aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label={t.rotateRight}
                          data-testid={`rotate-right-${block.id}`}
                          onClick={() => rotateBlock(block.id, 'cw')}
                        >
                          <ArrowClockwiseIcon aria-hidden="true" />
                        </Button>
                      </>
                    )}

                    <DeleteBlockButton
                      deleteLabel={t.deleteBlock}
                      confirmTitle={t.deleteConfirmTitle}
                      confirmBody={t.deleteConfirmBody}
                      cancelLabel={t.deleteConfirmCancel}
                      acceptLabel={t.deleteConfirmAccept}
                      onConfirm={() => deleteBlock(block.id)}
                    />
                  </div>

                  {expanded && worksheet && (
                    // Tight, minimal chrome (creator "one-screen" pass): this
                    // block's bar is really TWO compact rows directly under
                    // its name/handle (this header, then the canvas' own
                    // zoom toolbar) rather than one padded content area —
                    // every pixel here is height the canvas doesn't get.
                    <div className="flex min-h-0 flex-1 flex-col border-t border-border px-2 pb-2 pt-1">
                      <WorksheetZoneEditor
                        lang={lang}
                        image={worksheet.image}
                        imageUrl={resolveImageUrl(worksheet.image.path)}
                        zones={worksheet.zones}
                        rotation={worksheet.rotation}
                        selectedZoneId={selectedZoneId}
                        onZonesChange={(zones, opts) => updateZones(block.id, zones, opts)}
                        onSelectZone={onSelectZone}
                      />
                    </div>
                  )}
                </div>
              </SortableBlockItem>
            );
          })}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
