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
 * `worksheet` blocks expand into {@link WorksheetZoneEditor}; `quiz` blocks
 * (PR C, "Preguntas (quiz) block") expand into {@link QuizBlockEditor} —
 * same header chrome either way, only the expanded editor differs.
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
import type { Block, QuizBlock, WorksheetBlock, Zone } from '@/lib/activities/blocks';
import type { Payload } from '@/lib/exercisePayload';
import { rotateRects, turnRotation, type TurnDirection } from '@/lib/activities/zoneGeometry';
import { Button } from '@/components/ui/button';
import { fieldBase } from '@/lib/ui/field';
import { cn } from '@/lib/utils';
import { ROW_PADDING_X } from '@/lib/ui/layout';
import WorksheetZoneEditor from './WorksheetZoneEditor';
import QuizBlockEditor from './QuizBlockEditor';
import WorksheetUploader, { type UploadedImage } from './WorksheetUploader';

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
  /**
   * The exact block/zone `enviar.ts` pointed back to on a rejected submit
   * (creator polish round 3, owner feedback #1) — `incompleteZoneId` is
   * `null` for a block-level gap (a worksheet with no zones at all).
   * `incompleteMessage` is only rendered on the ONE matching block.
   */
  incompleteBlockId?: string | null;
  incompleteZoneId?: string | null;
  incompleteMessage?: string | null;
  /**
   * Ref to this list's own `<ul>` — the ACTUAL scrolling element at `lg:`
   * (`lg:overflow-y-auto lg:flex-1 lg:min-h-0`, below). `ActivityEditorIsland.tsx`
   * passes its scoped `ScrollToTop`'s `targetRef` through here (nav buttons
   * pass, fixing the "never appears in the editor" bug): the OUTER wrapper
   * it used to hand that ref to also carries `overflow-y-auto`, but never
   * actually overflows itself in ordinary use — this `<ul>`, sized to fill
   * the remaining space and scrolling INTERNALLY, does. Optional so every
   * other/test caller keeps working unchanged.
   */
  listRef?: React.Ref<HTMLUListElement>;
}

function isWorksheet(block: Block): block is WorksheetBlock {
  return block.type === 'worksheet';
}

function isQuiz(block: Block): block is QuizBlock {
  return block.type === 'quiz';
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

/**
 * The drag wiring for one block — same `useSortable` pattern as
 * `authoring/SortableBlock.tsx`. `useSortable` must be called from a
 * component mounted once per sortable `id`, so this still wraps the `<li>`;
 * but unlike before (owner feedback #2, "fill the empty space"), it no
 * longer ALSO renders the drag-handle button itself in its own row beside
 * `children` — that put the handle and ALL of a block's content (header row
 * AND, once expanded, the canvas/panel body) side by side in one flex ROW,
 * so the handle's own (narrow, `items-start`-aligned) column stayed empty
 * for the body's full height below the button, and — because that wrapping
 * row used `items-start` rather than the default stretch — the flex-1/min-h-0
 * chain down into `WorksheetZoneEditor`'s own viewport never actually got a
 * bounded height to fill either (the "canvas stops short, empty space below
 * it" half of the same bug). `children` is now a RENDER PROP instead,
 * handed the sortable `attributes`/`listeners` to spread onto whatever
 * button IT renders as the drag handle — see the block map below, which
 * places that button as the first item INSIDE its own header row (not a
 * sibling column of the whole block), so the expanded body right after it
 * spans the block's full width and the `<li>`'s default (stretching) cross-
 * axis alignment lets that body's own `flex-1 min-h-0` chain actually fill
 * the `<li>`'s real (focus-layout) height.
 */
function SortableBlockItem({
  id,
  focusActive,
  children,
}: {
  id: string;
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
  children: (handle: Pick<ReturnType<typeof useSortable>, 'attributes' | 'listeners'>) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <li
      ref={setNodeRef}
      id={`block-${id}`}
      style={{ transform: CSS.Transform.toString(transform), transition: transition ?? undefined }}
      data-dragging={isDragging ? 'true' : undefined}
      data-focus-active={focusActive ? 'true' : undefined}
      className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border ${
        focusActive ? 'lg:min-h-[22rem] lg:flex-1' : 'lg:flex-none'
      }`}
    >
      {children({ attributes, listeners })}
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
  incompleteBlockId = null,
  incompleteZoneId = null,
  incompleteMessage = null,
  listRef,
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

  const updateQuizPayload = (blockId: string, payload: Payload) => {
    onBlocksChange(blocks.map((b) => (b.id === blockId && isQuiz(b) ? { ...b, payload } : b)));
  };

  // Fills a brand-new, imageless worksheet block's own empty state
  // (creator polish round 4, owner feedback #2) — `WorksheetUploader`
  // supports uploading several images at once (a multi-page PDF); the
  // FIRST becomes THIS block's own image, and any REST become their own new
  // worksheet blocks appended right after it, same shape
  // `ActivityEditorIsland.handleUploadComplete` already uses for the
  // "+ Agregar bloque" flow. Those extras are not auto-expanded here (no
  // expand-state prop reaches this deep) — the author can still open them
  // from the list right below.
  const fillWorksheetImage = (blockId: string, images: UploadedImage[]) => {
    const [first, ...rest] = images;
    if (!first) return;
    const filled = blocks.map((b) => (b.id === blockId && isWorksheet(b) ? { ...b, image: first, zones: [] } : b));
    const extras: WorksheetBlock[] = rest.map((image) => ({
      id: crypto.randomUUID(),
      type: 'worksheet',
      rotation: 0,
      image,
      zones: [],
    }));
    onBlocksChange(extras.length > 0 ? [...filled, ...extras] : filled);
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
    // Empty activity (creator polish round 4, owner feedback #3): instead of
    // a lone "+" the author has to click first, the two type cards render
    // right here, right away — `ActivityEditorIsland`'s own add-flow below
    // this list (`addingBlock`/`showUploader`/`BlockTypePicker`/
    // `WorksheetUploader`) is unconditionally open whenever there are zero
    // blocks (see that file's `showAddFlow`), so this heading and that
    // picker land immediately adjacent, inside the same scroll column.
    return (
      <p data-testid="blocks-empty" className="text-sm text-muted-foreground">
        {t.blocksEmptyChooseNext}
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
        {/* `lg:[scrollbar-gutter:stable]` (creator polish round 3): this is
            the block list's own scroll container — reserving its gutter
            here (paired with the same property on `html`, `global.css`)
            stops the canvas/panel from reflowing sideways by ~15px the
            moment this list's content starts/stops overflowing. */}
        <ul
          ref={listRef}
          data-testid="block-list"
          className="flex flex-col gap-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:[scrollbar-gutter:stable]"
        >
          {blocks.map((block, index) => {
            const expanded = expandedBlockIds.has(block.id);
            const worksheet = isWorksheet(block) ? block : null;
            const quiz = isQuiz(block) ? block : null;
            const name = blockDisplayName(block, index, t.blockDefaultNamePrefix);
            const zoneCount = worksheet?.zones.length ?? 0;
            const questionCount = quiz?.payload.slots.length ?? 0;

            return (
              <SortableBlockItem key={block.id} id={block.id} focusActive={focusBlockId === block.id}>
                {({ attributes, listeners }) => (
                <div data-testid={`block-${block.id}`} className="flex min-h-0 min-w-0 flex-1 flex-col">
                  {/* `ROW_PADDING_X` matches the expanded editor's own
                      horizontal inset just below (worksheet's zoom-toolbar/
                      canvas, quiz's question list) — before this pass the
                      header had NO horizontal padding of its own while the
                      expanded body added `px-2`, so a block's header icons
                      sat flush with its own left edge while the canvas below
                      started 8px further right (the "margins feel uneven"
                      complaint). The drag handle (fill-the-space pass, owner
                      feedback #2) is now the FIRST item in this same header
                      row instead of its own column beside the whole block —
                      see `SortableBlockItem`'s own header for why: it used to
                      leave an empty gutter the expanded body's full height. */}
                  <div className={cn('flex flex-none flex-wrap items-center gap-2 py-1', ROW_PADDING_X)}>
                    <button
                      type="button"
                      aria-label={`${t.dragHandle}: ${name}`}
                      data-testid={`block-handle-${block.id}`}
                      className="flex shrink-0 touch-none cursor-grab items-center justify-center rounded-md p-1.5 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
                      {...attributes}
                      {...listeners}
                    >
                      <DotsSixVerticalIcon aria-hidden="true" />
                    </button>

                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      data-testid={`block-header-${block.id}`}
                      aria-expanded={expanded}
                      aria-label={expanded ? t.collapseBlock : t.expandBlock}
                      onClick={() => onToggleExpand(block.id)}
                    >
                      {expanded ? <CaretDownIcon aria-hidden="true" /> : <CaretRightIcon aria-hidden="true" />}
                    </Button>

                    <span className="shrink-0 text-accent-ink" aria-hidden="true">
                      {worksheet ? (
                        <ImageIcon weight="duotone" size={18} />
                      ) : (
                        <ListChecksIcon weight="duotone" size={18} />
                      )}
                    </span>

                    {/* Inline-editable title: reads as plain text at rest
                        (transparent surface/border) and only turns into a
                        recognizable field on hover/focus — the system's own
                        filled surface, radius and focus ring
                        (`fieldBase`/`field.ts`), not a naked, always-visible
                        input box. */}
                    <input
                      type="text"
                      value={name}
                      maxLength={60}
                      aria-label={t.blockNameLabel}
                      placeholder={t.blockNamePlaceholder}
                      onChange={(e) => renameBlock(block.id, e.target.value)}
                      className={cn(
                        fieldBase,
                        'h-7 min-w-0 flex-1 border-transparent bg-transparent px-1.5 py-0 text-sm font-medium hover:bg-(--color-field) focus-visible:bg-(--color-field)',
                      )}
                    />

                    {worksheet && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {zoneCount} {zoneCount === 1 ? t.zoneCountOne : t.zoneCountMany}
                      </span>
                    )}

                    {quiz && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {questionCount} {questionCount === 1 ? t.questionCountOne : t.questionCountMany}
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
                    <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-t border-border pb-2 pt-1', ROW_PADDING_X)}>
                      {worksheet.image ? (
                        <WorksheetZoneEditor
                          lang={lang}
                          image={worksheet.image}
                          imageUrl={resolveImageUrl(worksheet.image.path)}
                          zones={worksheet.zones}
                          rotation={worksheet.rotation}
                          selectedZoneId={selectedZoneId}
                          onZonesChange={(zones, opts) => updateZones(block.id, zones, opts)}
                          onSelectZone={onSelectZone}
                          incompleteZoneId={block.id === incompleteBlockId ? incompleteZoneId : undefined}
                          incompleteMessage={block.id === incompleteBlockId ? incompleteMessage : null}
                        />
                      ) : (
                        // Brand-new worksheet block, nothing uploaded yet
                        // (creator polish round 4, owner feedback #2, "first
                        // block visible") — the canvas area's own empty
                        // state: the exact same drop zone as "+ Agregar
                        // bloque"'s uploader, filling THIS block instead of
                        // appending a new one.
                        <div className="flex min-h-0 flex-1 items-center justify-center">
                          <WorksheetUploader
                            lang={lang}
                            onComplete={(images) => fillWorksheetImage(block.id, images)}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {expanded && quiz && (
                    <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-t border-border pb-2 pt-1', ROW_PADDING_X)}>
                      <QuizBlockEditor
                        blockId={block.id}
                        lang={lang}
                        payload={quiz.payload}
                        selectedSlotId={selectedZoneId}
                        onSelectSlot={onSelectZone}
                        onPayloadChange={(payload) => updateQuizPayload(block.id, payload)}
                        incompleteSlotId={block.id === incompleteBlockId ? incompleteZoneId : undefined}
                        incompleteMessage={block.id === incompleteBlockId ? incompleteMessage : null}
                      />
                    </div>
                  )}
                </div>
                )}
              </SortableBlockItem>
            );
          })}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
