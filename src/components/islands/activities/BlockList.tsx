/**
 * BlockList — the editor's body: ONE active block at a time (owner decision
 * 2026-10-07, "Barra fina debajo" — replaces the earlier accordion entirely).
 *
 * Below the window's own top strip sits a single thin, full-width bar for
 * the active sheet: ‹ › to switch blocks, the block's own editable name, its
 * position ("n de N"), a middle slot the active WORKSHEET block portals its
 * own zoom/tool controls into (see `WorksheetZoneEditor.tsx`'s
 * `toolbarPortalTarget`, so there is never a second toolbar row), the zone/
 * question count, rotate (worksheet only), a "⋯" menu for the rarer "Mover
 * antes"/"Mover después" reorder actions, and delete-with-confirm. Below
 * that bar, the active block's own editor fills everything else, edge to
 * edge — no margins, no card border around it.
 *
 * `worksheet` blocks render {@link WorksheetZoneEditor}; `quiz` blocks
 * render {@link QuizBlockEditor} — same bar either way, only the body
 * differs.
 *
 * NO MORE ACCORDION: there is no list of collapsed siblings to scroll past —
 * `activeBlockId` names the ONE block currently shown; every other block
 * simply isn't rendered right now. Reordering is menu-driven (no drag
 * handle any more — there is nothing left on screen to drag a row within).
 */
import { useRef, useState } from 'react';
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr/CaretLeft';
import { CaretRightIcon } from '@phosphor-icons/react/dist/ssr/CaretRight';
import { DotsThreeIcon } from '@phosphor-icons/react/dist/ssr/DotsThree';
import { TrashIcon } from '@phosphor-icons/react/dist/ssr/Trash';
import { ArrowCounterClockwiseIcon } from '@phosphor-icons/react/dist/ssr/ArrowCounterClockwise';
import { ArrowClockwiseIcon } from '@phosphor-icons/react/dist/ssr/ArrowClockwise';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import type { Block, QuizBlock, WorksheetBlock, Zone } from '@/lib/activities/blocks';
import type { Payload } from '@/lib/exercisePayload';
import { rotateRects, turnRotation, type TurnDirection } from '@/lib/activities/zoneGeometry';
import { Button } from '@/components/ui/button';
import { fieldBase } from '@/lib/ui/field';
import { ROW_PADDING_X } from '@/lib/ui/layout';
import { cn } from '@/lib/utils';
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
  /** The one block currently shown — `null` only transiently (e.g. mid-delete, before the parent re-derives a neighbour). */
  activeBlockId: string | null;
  selectedZoneId: string | null;
  /** Resolves a stored `image.path` to a browser-loadable preview URL. */
  resolveImageUrl: (path: string) => string;
  onSetActiveBlock: (blockId: string) => void;
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
}

function isWorksheet(block: Block): block is WorksheetBlock {
  return block.type === 'worksheet';
}

function isQuiz(block: Block): block is QuizBlock {
  return block.type === 'quiz';
}

/**
 * "Hoja 1"/"Sheet 1" etc. by position, or the author's own name if set —
 * exported so the sticky toolbar's sheet-switcher popover names blocks the
 * same way this bar does.
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
      <div data-testid="delete-confirm" className="flex shrink-0 items-center gap-2 rounded-md bg-destructive/10 px-2 py-1">
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
      className="shrink-0"
      aria-label={deleteLabel}
      data-testid="delete-block-trigger"
      onClick={() => setConfirming(true)}
    >
      <TrashIcon aria-hidden="true" />
    </Button>
  );
}

/**
 * The "⋯" menu (build item 2): the rarer actions that would otherwise
 * disappear once the sheet bar replaces the accordion's drag handle —
 * "Mover antes"/"Mover después" (reordering). Same open/close-on-outside-
 * click/Escape shape as `EditorSideToolbar.tsx`'s own `BlockIndexPopover`.
 */
function SheetActionsMenu({
  lang,
  canMoveEarlier,
  canMoveLater,
  onMoveEarlier,
  onMoveLater,
}: {
  lang: Lang;
  canMoveEarlier: boolean;
  canMoveLater: boolean;
  onMoveEarlier: () => void;
  onMoveLater: () => void;
}) {
  const t = UI_LABELS[lang].activities.editor;
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  function close() {
    setOpen(false);
  }

  return (
    <div
      ref={containerRef}
      className="relative shrink-0"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) close();
      }}
    >
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={t.sheetMoreActions}
        data-testid="sheet-actions-trigger"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') close();
        }}
      >
        <DotsThreeIcon aria-hidden="true" weight="bold" />
      </Button>
      {open && (
        <div
          data-testid="sheet-actions-menu"
          role="menu"
          className="absolute right-0 top-full z-10 mt-1 w-44 rounded-md border border-border bg-popover p-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            data-testid="sheet-move-earlier"
            disabled={!canMoveEarlier}
            onClick={() => {
              onMoveEarlier();
              close();
            }}
            className="w-full rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
          >
            {t.moveUp}
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid="sheet-move-later"
            disabled={!canMoveLater}
            onClick={() => {
              onMoveLater();
              close();
            }}
            className="w-full rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
          >
            {t.moveDown}
          </button>
        </div>
      )}
    </div>
  );
}

export default function BlockList({
  lang,
  blocks,
  activeBlockId,
  selectedZoneId,
  resolveImageUrl,
  onSetActiveBlock,
  onSelectZone,
  onBlocksChange,
  incompleteBlockId = null,
  incompleteZoneId = null,
  incompleteMessage = null,
}: BlockListProps) {
  const t = UI_LABELS[lang].activities.editor;

  // The middle slot `WorksheetZoneEditor` portals its own zoom/tool row
  // into (build item 3: "no second toolbar row") — a plain `useState` so
  // this re-renders once the ref actually attaches, same pattern
  // `ActivityEditorIsland.tsx` already uses for its own portal targets.
  const [toolbarSlot, setToolbarSlot] = useState<HTMLDivElement | null>(null);

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
  // worksheet blocks appended right after it. `ActivityEditorIsland` makes
  // the LAST of those the active one (same "last uploaded wins" rule as the
  // "+ Agregar bloque" flow).
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

  const moveBlock = (blockId: string, direction: 'earlier' | 'later') => {
    const index = blocks.findIndex((b) => b.id === blockId);
    if (index === -1) return;
    const target = direction === 'earlier' ? index - 1 : index + 1;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    onBlocksChange(next);
  };

  if (blocks.length === 0) {
    // Empty activity (creator polish round 4, owner feedback #3): instead of
    // a lone "+" the author has to click first, the two type cards render
    // right here, right away — `ActivityEditorIsland`'s own add-flow below
    // this (`addingBlock`/`showUploader`/`BlockTypePicker`/`WorksheetUploader`)
    // is unconditionally open whenever there are zero blocks.
    return (
      <p data-testid="blocks-empty" className="text-sm text-muted-foreground">
        {t.blocksEmptyChooseNext}
      </p>
    );
  }

  // A stale `activeBlockId` (e.g. the instant after its own block was
  // deleted, before the parent re-derives a neighbour) falls back to the
  // first block rather than crashing on `blocks[-1]`.
  const activeIndex = Math.max(0, blocks.findIndex((b) => b.id === activeBlockId));
  const activeBlock = blocks[activeIndex];
  const worksheet = isWorksheet(activeBlock) ? activeBlock : null;
  const quiz = isQuiz(activeBlock) ? activeBlock : null;
  const name = blockDisplayName(activeBlock, activeIndex, t.blockDefaultNamePrefix);
  const zoneCount = worksheet?.zones.length ?? 0;
  const questionCount = quiz?.payload.slots.length ?? 0;

  return (
    <div data-testid="block-list" className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* The thin active-sheet bar (owner decision, "Barra fina debajo") —
          one line, a hairline bottom border, the window's own typography.
          No margins/padding beyond its own line height. */}
      <div
        data-testid="active-sheet-bar"
        // `ROW_PADDING_X` (shared horizontal inset, `layout.ts`'s own
        // header): this bar sits directly under `DeskWindow`'s own title
        // bar, which uses the exact same token — keeping them aligned. The
        // BODY below (the active block's own canvas) deliberately does
        // NOT: the owner wants it edge to edge, "sin márgenes".
        //
        // `flex-nowrap overflow-x-auto` (build item 5, phones): a `flex-wrap`
        // bar at narrow widths used to fold into three ragged rows, eating
        // real canvas height — this ONE line scrolls horizontally instead,
        // same "thin bar" everywhere.
        className={cn(
          'flex flex-none flex-nowrap items-center gap-1 overflow-x-auto border-b border-border py-1',
          ROW_PADDING_X,
        )}
      >
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="shrink-0"
          aria-label={t.sheetPrevious}
          data-testid="sheet-nav-prev"
          disabled={activeIndex === 0}
          onClick={() => onSetActiveBlock(blocks[activeIndex - 1].id)}
        >
          <CaretLeftIcon aria-hidden="true" />
        </Button>

        {/* Inline-editable name — same "plain text at rest, field on hover/
            focus" treatment the old accordion header used. */}
        <input
          type="text"
          value={name}
          maxLength={60}
          aria-label={t.blockNameLabel}
          placeholder={t.blockNamePlaceholder}
          onChange={(e) => renameBlock(activeBlock.id, e.target.value)}
          data-testid={`active-sheet-name-${activeBlock.id}`}
          className={cn(
            fieldBase,
            'h-7 w-32 shrink-0 border-transparent bg-transparent px-1.5 py-0 text-sm font-semibold hover:bg-(--color-field) focus-visible:bg-(--color-field)',
          )}
        />

        <span data-testid="sheet-position" className="shrink-0 text-xs text-muted-foreground">
          {t.sheetPosition(activeIndex + 1, blocks.length)}
        </span>

        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="shrink-0"
          aria-label={t.sheetNext}
          data-testid="sheet-nav-next"
          disabled={activeIndex === blocks.length - 1}
          onClick={() => onSetActiveBlock(blocks[activeIndex + 1].id)}
        >
          <CaretRightIcon aria-hidden="true" />
        </Button>

        {/* Middle slot: the active WORKSHEET block's own zoom/tool row
            portals here (`WorksheetZoneEditor`'s `toolbarPortalTarget`) — a
            quiz block leaves this empty. `flex-1` only at `lg:` (desktop,
            where the bar never scrolls): centers the zoom/tool row in
            whatever room is left. Below `lg:` (the bar scrolls instead) it
            is `shrink-0`, same as every other item in this row — a `flex-1`
            item inside an overflowing `nowrap` flex row collapses to zero
            width instead of scrolling, which would hide the zoom controls
            entirely on a phone. */}
        <div
          ref={setToolbarSlot}
          data-testid="sheet-bar-middle-slot"
          className="flex shrink-0 items-center justify-center gap-1 lg:min-w-0 lg:flex-1"
        />

        {worksheet && (
          <span data-testid={`zone-count-${activeBlock.id}`} className="shrink-0 text-xs text-muted-foreground">
            {zoneCount} {zoneCount === 1 ? t.zoneCountOne : t.zoneCountMany}
          </span>
        )}
        {quiz && (
          <span data-testid={`question-count-${activeBlock.id}`} className="shrink-0 text-xs text-muted-foreground">
            {questionCount} {questionCount === 1 ? t.questionCountOne : t.questionCountMany}
          </span>
        )}

        {worksheet && (
          <>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="shrink-0"
              aria-label={t.rotateLeft}
              data-testid={`rotate-left-${activeBlock.id}`}
              onClick={() => rotateBlock(activeBlock.id, 'ccw')}
            >
              <ArrowCounterClockwiseIcon aria-hidden="true" />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="shrink-0"
              aria-label={t.rotateRight}
              data-testid={`rotate-right-${activeBlock.id}`}
              onClick={() => rotateBlock(activeBlock.id, 'cw')}
            >
              <ArrowClockwiseIcon aria-hidden="true" />
            </Button>
          </>
        )}

        <SheetActionsMenu
          lang={lang}
          canMoveEarlier={activeIndex > 0}
          canMoveLater={activeIndex < blocks.length - 1}
          onMoveEarlier={() => moveBlock(activeBlock.id, 'earlier')}
          onMoveLater={() => moveBlock(activeBlock.id, 'later')}
        />

        <DeleteBlockButton
          deleteLabel={t.deleteBlock}
          confirmTitle={t.deleteConfirmTitle}
          confirmBody={t.deleteConfirmBody}
          cancelLabel={t.deleteConfirmCancel}
          acceptLabel={t.deleteConfirmAccept}
          onConfirm={() => deleteBlock(activeBlock.id)}
        />
      </div>

      {/* Full-bleed body — the active block's own editor fills everything
          else, edge to edge, no margins, no card border. */}
      <div data-testid={`block-${activeBlock.id}`} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-clip">
        {worksheet &&
          (worksheet.image ? (
            <WorksheetZoneEditor
              lang={lang}
              image={worksheet.image}
              imageUrl={resolveImageUrl(worksheet.image.path)}
              zones={worksheet.zones}
              rotation={worksheet.rotation}
              selectedZoneId={selectedZoneId}
              onZonesChange={(zones, opts) => updateZones(activeBlock.id, zones, opts)}
              onSelectZone={onSelectZone}
              toolbarPortalTarget={toolbarSlot}
              incompleteZoneId={activeBlock.id === incompleteBlockId ? incompleteZoneId : undefined}
              incompleteMessage={activeBlock.id === incompleteBlockId ? incompleteMessage : null}
            />
          ) : (
            // Brand-new worksheet block, nothing uploaded yet (creator
            // polish round 4, owner feedback #2) — the body's own empty
            // state: the exact same drop zone as "+ Agregar bloque"'s
            // uploader, filling THIS block instead of appending a new one.
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <WorksheetUploader lang={lang} onComplete={(images) => fillWorksheetImage(activeBlock.id, images)} />
            </div>
          ))}

        {quiz && (
          <QuizBlockEditor
            blockId={activeBlock.id}
            lang={lang}
            payload={quiz.payload}
            selectedSlotId={selectedZoneId}
            onSelectSlot={onSelectZone}
            onPayloadChange={(payload) => updateQuizPayload(activeBlock.id, payload)}
            incompleteSlotId={activeBlock.id === incompleteBlockId ? incompleteZoneId : undefined}
            incompleteMessage={activeBlock.id === incompleteBlockId ? incompleteMessage : null}
          />
        )}
      </div>
    </div>
  );
}
