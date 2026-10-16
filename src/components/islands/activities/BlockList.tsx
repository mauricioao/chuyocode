/**
 * BlockList — the editor's body (one-sheet redesign, owner spec 2026-10-08:
 * "nadie crea un ejercicio de varias hojas, vamos solamente a dar una sola
 * hoja").
 *
 * ONE BLOCK PER ACTIVITY (new activities): the empty state's
 * {@link BlockTypePicker} chooses the activity's single block, and from then
 * on there is no bar at all above the active block's own editor — no name
 * field, no position switcher, no "⋯" reorder menu, no per-block delete (a
 * worksheet's own "Cambiar imagen" — see below — covers starting over). The
 * block's own editor fills everything, edge to edge.
 *
 * BACKWARD COMPATIBILITY (an existing activity already saved with 2+
 * blocks): every block still opens and is still fully editable, and the
 * chrome above the body is a MINIMAL ‹ n/N › switcher (prev/next + position)
 * — still no way to add another block or rename one, but the active sheet's
 * own "Más" menu (owner report, PLAN-OCTUBRE.md "Pendientes nuevos") DOES
 * offer "Mover a la izquierda"/"Mover a la derecha" (disabled at the ends)
 * and "Eliminar esta hoja" — delete is reversible (one undo step, a status
 * line instead of a confirm dialog — see `sheetFeedback`/`sheetOrder.ts`),
 * never offered down to zero sheets (it simply stops existing once only one
 * is left, since `isLegacyMultiBlock` itself goes false). `isLegacyMultiBlock`
 * below is the one switch between the two top-level shapes; both share the
 * exact same full-bleed body.
 *
 * `worksheet` blocks render {@link WorksheetZoneEditor}; `quiz` blocks render
 * {@link QuizBlockEditor}.
 *
 * WORKSHEET TOOLS live in the editor's floating SIDE toolbar now, not here:
 * the Zona/Mano tool toggle ({@link WorksheetZoneEditor}'s own
 * `sideToolsPortalTarget`, which THAT component portals itself — this one
 * never duplicates it) plus THIS component's own rotate/"Cambiar imagen"
 * controls both portal into the SAME slot `EditorSideToolbar.tsx` exposes
 * (`sideToolsPortalTarget` prop, threaded down from `ActivityEditorIsland`)
 * — two independent `createPortal` calls into one container, which React
 * supports natively. `null`/omitted (every existing test in this file)
 * falls back to rendering this component's own cluster inline instead —
 * same graceful-fallback posture as the portal targets elsewhere in this
 * editor; `WorksheetZoneEditor`'s OWN tool toggle has its own matching
 * inline fallback, so the two never need to coordinate.
 */
import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr/CaretLeft';
import { CaretRightIcon } from '@phosphor-icons/react/dist/ssr/CaretRight';
import { ArrowCounterClockwiseIcon } from '@phosphor-icons/react/dist/ssr/ArrowCounterClockwise';
import { ArrowClockwiseIcon } from '@phosphor-icons/react/dist/ssr/ArrowClockwise';
import { ImageIcon } from '@phosphor-icons/react/dist/ssr/Image';
import { DotsThreeIcon } from '@phosphor-icons/react/dist/ssr/DotsThree';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import type { Block, QuizBlock, WorksheetBlock, Zone, AudioMarker, PromptImageRef } from '@/lib/activities/blocks';
import type { Payload } from '@/lib/exercisePayload';
import { rotateRects, turnRotation, type TurnDirection } from '@/lib/activities/zoneGeometry';
import { moveBlockLeft, moveBlockRight, removeBlock } from '@/lib/activities/sheetOrder';
import { Button } from '@/components/ui/button';
import { ROW_PADDING_X } from '@/lib/ui/layout';
import { cn } from '@/lib/utils';
import { useHydrated } from '@/hooks/useHydrated';
import WorksheetZoneEditor from './WorksheetZoneEditor';
import QuizBlockEditor from './QuizBlockEditor';
import WorksheetUploader, { type UploadedImage } from './WorksheetUploader';
import { usePasteFeedback, StatusNote } from './TemplateEditorKit';

export interface BlocksChangeOptions {
  /**
   * `false` for a live, in-progress update (a zone being dragged) that must
   * NOT create its own undo step; omitted/`true` for every discrete change
   * (rotate, or the final pointerup of a drag), which DOES create one.
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
  /**
   * "Colocar un audio propio" — resolves a stored audio marker `path` to a
   * browser-loadable URL, for the Audio tool's own properties panel
   * (listen-back). Omitted = no Audio tool at all, same graceful fallback
   * `WorksheetZoneEditor.tsx` itself already has for this prop.
   */
  resolveAudioUrl?: (path: string) => string;
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
  /**
   * The editor's floating side toolbar's own worksheet-tools slot (one-sheet
   * redesign) — see this file's own header. `null`/omitted renders the same
   * rotate/"Cambiar imagen" cluster inline instead.
   */
  sideToolsPortalTarget?: HTMLElement | null;
}

function isWorksheet(block: Block): block is WorksheetBlock {
  return block.type === 'worksheet';
}

function isQuiz(block: Block): block is QuizBlock {
  return block.type === 'quiz';
}

/**
 * "Hoja 1"/"Sheet 1" etc. by position, or the author's own name if set.
 * Kept exported — legacy multi-block activities may still carry an
 * author-set `name` from before this redesign, even though there is no
 * longer any UI to EDIT one.
 */
export function blockDisplayName(block: Block, index: number, defaultPrefix: string): string {
  return block.name ?? `${defaultPrefix} ${index + 1}`;
}

/**
 * "Cambiar imagen" (one-sheet redesign): replaces the per-block delete —
 * with a single block, starting over IS deleting. An inline confirm step
 * (same shape the old delete button used), shown ONLY when the worksheet
 * already has zones (replacing the image would silently invalidate them);
 * with none, one click goes straight to the replace flow.
 */
function ChangeImageButton({
  blockId,
  label,
  confirmTitle,
  confirmBody,
  cancelLabel,
  acceptLabel,
  hasZones,
  onConfirm,
}: {
  blockId: string;
  label: string;
  confirmTitle: string;
  confirmBody: string;
  cancelLabel: string;
  acceptLabel: string;
  hasZones: boolean;
  onConfirm: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div
        data-testid="change-image-confirm"
        className="flex flex-col items-center gap-1 rounded-md bg-destructive/10 p-1 text-center"
      >
        <span className="text-[10px] leading-tight text-destructive">{confirmTitle}</span>
        <span className="sr-only">{confirmBody}</span>
        <div className="flex gap-1">
          <Button type="button" size="xs" variant="ghost" onClick={() => setConfirming(false)}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            size="xs"
            variant="destructive"
            data-testid="change-image-confirm-accept"
            onClick={() => {
              setConfirming(false);
              onConfirm();
            }}
          >
            {acceptLabel}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      aria-label={label}
      title={label}
      data-testid={`change-image-trigger-${blockId}`}
      onClick={() => (hasZones ? setConfirming(true) : onConfirm())}
    >
      <ImageIcon aria-hidden="true" />
    </Button>
  );
}

export default function BlockList({
  lang,
  blocks,
  activeBlockId,
  selectedZoneId,
  resolveImageUrl,
  resolveAudioUrl,
  onSetActiveBlock,
  onSelectZone,
  onBlocksChange,
  incompleteBlockId = null,
  incompleteZoneId = null,
  incompleteMessage = null,
  sideToolsPortalTarget = null,
}: BlockListProps) {
  const t = UI_LABELS[lang].activities.editor;
  const hydrated = useHydrated();

  // Backward compatibility ONLY: an existing activity already saved with
  // 2+ blocks keeps a minimal nav bar; every new activity (and anything
  // trimmed back down to one block) has none at all — see this file's own
  // header.
  const isLegacyMultiBlock = blocks.length > 1;

  // "Cambiar imagen" (one-sheet redesign): the block currently showing the
  // replace-image flow instead of its own canvas — `null` the rest of the
  // time.
  const [replacingBlockId, setReplacingBlockId] = useState<string | null>(null);

  // "Más" menu's own transient feedback (legacy multi-sheet activities):
  // "Hoja eliminada · Ctrl+Z para deshacer" after a delete — same
  // `usePasteFeedback` mechanism `QuizBlockEditor.tsx`'s own "Cambiar de
  // molde" uses, which reverts on the very next change to `blocks` (a
  // further move/delete, or any other edit) EXCEPT the one delete itself
  // just caused. Called unconditionally, alongside every other hook here,
  // so the zero-block early return right below never changes this
  // component's hook call order between renders.
  const sheetFeedback = usePasteFeedback(blocks);
  // Unique per mounted instance (`ActivityEditorIsland` renders at most ONE
  // `BlockList` at a time — see this file's own header — but `useId()`
  // costs nothing and matches `QuizBlockEditor.tsx`'s own reasoning for its
  // `dndId`, should that ever change).
  const sheetActionsToggleId = useId();
  const sheetActionsCheckboxRef = useRef<HTMLInputElement | null>(null);

  const updateZones = (blockId: string, zones: Zone[], opts?: BlocksChangeOptions) => {
    onBlocksChange(
      blocks.map((b) => (b.id === blockId && isWorksheet(b) ? { ...b, zones } : b)),
      opts,
    );
  };

  const updateAudioMarkers = (blockId: string, audio: AudioMarker[], opts?: BlocksChangeOptions) => {
    onBlocksChange(
      blocks.map((b) => (b.id === blockId && isWorksheet(b) ? { ...b, audio } : b)),
      opts,
    );
  };

  const updateQuizPayload = (blockId: string, payload: Payload) => {
    onBlocksChange(blocks.map((b) => (b.id === blockId && isQuiz(b) ? { ...b, payload } : b)));
  };

  /** "Agregar imagen"/"Quitar imagen" on one question (owner decision 2026-10-16) — one commit, same posture as every other block mutation here. `undefined` clears the field entirely (never stored as an empty `{}`), mirroring `updateQuizTemplate`'s own convention for an absent `template`. */
  const updateQuizPromptImages = (blockId: string, promptImages: Record<string, PromptImageRef> | undefined) => {
    onBlocksChange(
      blocks.map((b) => {
        if (b.id !== blockId || !isQuiz(b)) return b;
        if (!promptImages) {
          const { promptImages: _dropped, ...rest } = b;
          return rest;
        }
        return { ...b, promptImages };
      }),
    );
  };

  // "Cambiar de molde" (R2): ONE commit replaces both the block's content
  // AND its own mold, so the whole conversion lands as ONE undo step
  // upstream — same posture every other discrete edit here already has.
  // `template` omitted entirely (never stored as an explicit `undefined`)
  // mirrors `parseQuizBlock`'s own convention for "Varios juegos".
  const updateQuizTemplate = (blockId: string, payload: Payload, template: QuizBlock['template']) => {
    onBlocksChange(
      blocks.map((b) => {
        if (b.id !== blockId || !isQuiz(b)) return b;
        if (!template) {
          const { template: _dropped, ...rest } = b;
          return { ...rest, payload };
        }
        return { ...b, payload, template };
      }),
    );
  };

  // Fills a brand-new, imageless worksheet block's own empty state, OR
  // replaces an already-filled one's image ("Cambiar imagen") — either way
  // the SAME shape: take the first uploaded image, reset zones (a replaced
  // image invalidates whatever was drawn on the old one). `WorksheetUploader`
  // now always hands back exactly one image (several dropped files/PDF
  // pages are stitched into one sheet client-side before upload — see
  // `sheetStitcher.ts`) — any defensive extra is simply ignored rather than
  // spawning a second block, which the one-block design no longer allows.
  const setWorksheetImage = (blockId: string, images: UploadedImage[]) => {
    const [first] = images;
    if (!first) return;
    onBlocksChange(
      blocks.map((b) => (b.id === blockId && isWorksheet(b) ? { ...b, image: first, zones: [] } : b)),
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
    // Empty activity (creator polish round 4, owner feedback #3): instead of
    // a lone "+" the author has to click first, the two type cards render
    // right here, right away — `ActivityEditorIsland`'s own add-flow below
    // this (`showAddFlow`/`BlockTypePicker`/`WorksheetUploader`) is
    // unconditionally open whenever there are zero blocks. One-sheet
    // redesign: this is also the ONLY moment a block gets created — once it
    // exists, there is no "+" anywhere any more.
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
  const isReplacingImage = worksheet !== null && replacingBlockId === activeBlock.id;

  // "Más" menu (legacy multi-sheet activities only — see this file's own
  // header): closes the CSS-only checkbox/label disclosure (same pattern
  // `ActivityEditorIsland.tsx`'s own mobile title-bar "⋯" menu uses) by
  // imperatively unchecking it, since there is no React state driving it
  // open/closed to begin with.
  function closeSheetActionsMenu() {
    if (sheetActionsCheckboxRef.current) sheetActionsCheckboxRef.current.checked = false;
  }

  // Moving keeps the SAME block active: `activeBlockId` names a block by
  // `id`, never by position, so reordering `blocks` alone is enough — no
  // separate `onSetActiveBlock` call needed (unlike delete, below).
  function handleMoveSheetLeft() {
    const next = moveBlockLeft(blocks, activeBlock.id);
    if (next !== blocks) onBlocksChange(next);
    closeSheetActionsMenu();
  }

  function handleMoveSheetRight() {
    const next = moveBlockRight(blocks, activeBlock.id);
    if (next !== blocks) onBlocksChange(next);
    closeSheetActionsMenu();
  }

  // Delete is reversible, not confirmed (owner UX rule: undo over confirm):
  // ONE `onBlocksChange` call is one `pushHistory` step upstream, and the
  // status line below names the shortcut instead of a confirm dialog. The
  // deleted sheet's neighbour — whichever block slides into its old index,
  // or the new last block if it was already last — becomes active, since
  // `activeBlockId` would otherwise point at a block that no longer exists.
  function handleDeleteSheet() {
    const deletedIndex = activeIndex;
    const next = removeBlock(blocks, activeBlock.id);
    if (next === blocks) {
      closeSheetActionsMenu();
      return;
    }
    const neighbor = next[Math.min(deletedIndex, next.length - 1)];
    onBlocksChange(next);
    if (neighbor) onSetActiveBlock(neighbor.id);
    closeSheetActionsMenu();
    sheetFeedback.show(t.sheetDeleted);
  }

  // The rotate/"Cambiar imagen" cluster — portaled into the side toolbar's
  // own slot when given (where `WorksheetZoneEditor`'s own Zona/Mano toggle
  // ALSO portals, as a second independent `createPortal` call into the same
  // node — see this file's own header), inline otherwise. Only meaningful
  // for a worksheet that already has an image and isn't mid-replace
  // (nothing to rotate/replace before the first upload, and the replace
  // flow below has its own cancel instead).
  const worksheetToolsCluster =
    worksheet && worksheet.image && !isReplacingImage ? (
      <>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={t.rotateLeft}
          title={t.rotateLeft}
          data-testid={`rotate-left-${activeBlock.id}`}
          onClick={() => rotateBlock(activeBlock.id, 'ccw')}
        >
          <ArrowCounterClockwiseIcon aria-hidden="true" />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={t.rotateRight}
          title={t.rotateRight}
          data-testid={`rotate-right-${activeBlock.id}`}
          onClick={() => rotateBlock(activeBlock.id, 'cw')}
        >
          <ArrowClockwiseIcon aria-hidden="true" />
        </Button>
        <ChangeImageButton
          blockId={activeBlock.id}
          label={t.changeImage}
          confirmTitle={t.changeImageConfirmTitle}
          confirmBody={t.changeImageConfirmBody}
          cancelLabel={t.deleteConfirmCancel}
          acceptLabel={t.changeImageConfirmAccept}
          hasZones={worksheet.zones.length > 0}
          onConfirm={() => setReplacingBlockId(activeBlock.id)}
        />
      </>
    ) : null;

  return (
    <div data-testid="block-list" className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Backward compatibility ONLY — see this file's own header. A new,
          single-block activity has no bar at all above the body. */}
      {isLegacyMultiBlock && (
        <div
          data-testid="active-sheet-bar"
          className={cn(
            'flex flex-none flex-nowrap items-center justify-center gap-2 border-b border-border py-1',
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

          {/* "Más" menu for the active sheet (owner report, PLAN-OCTUBRE.md
              "Pendientes nuevos") — a CSS-only checkbox/label disclosure,
              same pattern as `ActivityEditorIsland.tsx`'s own mobile
              title-bar "⋯" menu; `closeSheetActionsMenu()` closes it
              imperatively after an action since nothing else drives it. */}
          <div className="relative shrink-0">
            <input
              ref={sheetActionsCheckboxRef}
              type="checkbox"
              id={sheetActionsToggleId}
              className="peer sr-only"
              aria-label={t.sheetMoreActions}
            />
            <label
              htmlFor={sheetActionsToggleId}
              data-testid="sheet-actions-trigger"
              title={t.sheetMoreActions}
              className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground peer-focus-visible:outline-none peer-focus-visible:border-ring peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50"
            >
              <DotsThreeIcon aria-hidden="true" size={18} weight="bold" />
            </label>
            <div
              data-testid="sheet-actions-menu"
              className="hidden absolute right-0 top-full z-30 mt-2 w-52 max-w-[calc(100vw-2rem)] flex-col items-stretch gap-1 rounded-lg border border-border bg-background p-1 shadow-elevation-2 peer-checked:flex"
            >
              <button
                type="button"
                data-testid="sheet-move-left"
                disabled={activeIndex === 0}
                onClick={handleMoveSheetLeft}
                className="flex min-h-11 items-center rounded-md px-3 text-left text-sm text-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
              >
                {t.sheetMoveLeft}
              </button>
              <button
                type="button"
                data-testid="sheet-move-right"
                disabled={activeIndex === blocks.length - 1}
                onClick={handleMoveSheetRight}
                className="flex min-h-11 items-center rounded-md px-3 text-left text-sm text-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
              >
                {t.sheetMoveRight}
              </button>
              <button
                type="button"
                data-testid="delete-block-trigger"
                onClick={handleDeleteSheet}
                className="flex min-h-11 items-center rounded-md px-3 text-left text-sm text-destructive hover:bg-destructive/10"
              >
                {t.deleteSheet}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* "Hoja eliminada · Ctrl+Z para deshacer" — a sibling of the bar
          above, NOT nested inside `isLegacyMultiBlock`, so it still shows
          after a delete takes the activity down to its last sheet (the bar
          itself then stops existing, since `isLegacyMultiBlock` goes
          false). */}
      {sheetFeedback.message && (
        <StatusNote tone="ready" testId="sheet-status">
          {sheetFeedback.message}
        </StatusNote>
      )}

      {/* Full-bleed body — the active block's own editor fills everything
          else, edge to edge, no margins, no card border. */}
      <div data-testid={`block-${activeBlock.id}`} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-clip">
        {worksheet &&
          (worksheet.image && !isReplacingImage ? (
            <WorksheetZoneEditor
              lang={lang}
              image={worksheet.image}
              imageUrl={resolveImageUrl(worksheet.image.path)}
              zones={worksheet.zones}
              rotation={worksheet.rotation}
              selectedZoneId={selectedZoneId}
              onZonesChange={(zones, opts) => updateZones(activeBlock.id, zones, opts)}
              onSelectZone={onSelectZone}
              sideToolsPortalTarget={sideToolsPortalTarget}
              incompleteZoneId={activeBlock.id === incompleteBlockId ? incompleteZoneId : undefined}
              incompleteMessage={activeBlock.id === incompleteBlockId ? incompleteMessage : null}
              audioMarkers={worksheet.audio ?? []}
              onAudioMarkersChange={
                resolveAudioUrl ? (audio, opts) => updateAudioMarkers(activeBlock.id, audio, opts) : undefined
              }
              resolveAudioUrl={resolveAudioUrl}
            />
          ) : (
            // Brand-new worksheet block with nothing uploaded yet, OR
            // "Cambiar imagen" mid-replace — the SAME canvas-simulating drop
            // zone either way (owner spec: the empty/loading state should
            // "simular" the canvas, same dotted pattern, so it reads as
            // where to drop a file).
            <div className="canvas-dots relative flex min-h-80 flex-1 flex-col overflow-hidden rounded-lg bg-muted">
              <WorksheetUploader
                lang={lang}
                onComplete={(images) => {
                  setWorksheetImage(activeBlock.id, images);
                  setReplacingBlockId(null);
                }}
              />
              {isReplacingImage && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  data-testid="change-image-cancel"
                  className="absolute right-2 top-2"
                  onClick={() => setReplacingBlockId(null)}
                >
                  {t.deleteConfirmCancel}
                </Button>
              )}
            </div>
          ))}

        {quiz && (
          <QuizBlockEditor
            blockId={activeBlock.id}
            lang={lang}
            payload={quiz.payload}
            template={quiz.template}
            selectedSlotId={selectedZoneId}
            onSelectSlot={onSelectZone}
            onPayloadChange={(payload) => updateQuizPayload(activeBlock.id, payload)}
            onConvert={(payload, template) => updateQuizTemplate(activeBlock.id, payload, template)}
            incompleteSlotId={activeBlock.id === incompleteBlockId ? incompleteZoneId : undefined}
            incompleteMessage={activeBlock.id === incompleteBlockId ? incompleteMessage : null}
            promptImages={quiz.promptImages}
            onPromptImagesChange={(images) => updateQuizPromptImages(activeBlock.id, images)}
          />
        )}
      </div>

      {worksheetToolsCluster &&
        (sideToolsPortalTarget && hydrated
          ? createPortal(worksheetToolsCluster, sideToolsPortalTarget)
          : // Standalone/pre-hydration fallback — floats over the body's
            // own top-right corner rather than reserving a row, same
            // "never shifts layout" posture as the editor's own side
            // toolbar.
            <div className="absolute right-2 top-2 z-20 flex flex-wrap items-center justify-end gap-1">
              {worksheetToolsCluster}
            </div>)}
    </div>
  );
}
