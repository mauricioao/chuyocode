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
 * blocks): every block still opens and is still fully editable — but the
 * only chrome left above the body is a MINIMAL ‹ n/N › switcher (prev/next +
 * position), still with no way to add another block, rename, reorder, or
 * delete one. `isLegacyMultiBlock` below is the one switch between these two
 * shapes; both share the exact same full-bleed body.
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
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr/CaretLeft';
import { CaretRightIcon } from '@phosphor-icons/react/dist/ssr/CaretRight';
import { ArrowCounterClockwiseIcon } from '@phosphor-icons/react/dist/ssr/ArrowCounterClockwise';
import { ArrowClockwiseIcon } from '@phosphor-icons/react/dist/ssr/ArrowClockwise';
import { ImageIcon } from '@phosphor-icons/react/dist/ssr/Image';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import type { Block, QuizBlock, WorksheetBlock, Zone, AudioMarker } from '@/lib/activities/blocks';
import type { Payload } from '@/lib/exercisePayload';
import { rotateRects, turnRotation, type TurnDirection } from '@/lib/activities/zoneGeometry';
import { Button } from '@/components/ui/button';
import { ROW_PADDING_X } from '@/lib/ui/layout';
import { cn } from '@/lib/utils';
import { useHydrated } from '@/hooks/useHydrated';
import WorksheetZoneEditor from './WorksheetZoneEditor';
import QuizBlockEditor from './QuizBlockEditor';
import WorksheetUploader, { type UploadedImage } from './WorksheetUploader';

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
        </div>
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
            incompleteSlotId={activeBlock.id === incompleteBlockId ? incompleteZoneId : undefined}
            incompleteMessage={activeBlock.id === incompleteBlockId ? incompleteMessage : null}
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
