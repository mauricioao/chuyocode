/**
 * BlockList — the editor's ordered center column (PR B, "Activities
 * creator"). Each block gets a small header (type label, move up/down,
 * delete-with-confirm) and, ONLY when selected, its own editor expands
 * inline below the header — "everything at hand, never overwhelming":
 * an unselected block collapses back down to just its header.
 *
 * Only `worksheet` blocks are editable in this PR (`quiz` ships in PR C's
 * question type; none can be authored here, so the fallback below is
 * defensive, not a real path).
 */
import { useState } from 'react';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import type { Block, WorksheetBlock, Zone } from '@/lib/activities/blocks';
import { Button } from '@/components/ui/button';
import WorksheetZoneEditor from './WorksheetZoneEditor';

export interface BlockListProps {
  lang: Lang;
  blocks: Block[];
  selectedBlockId: string | null;
  selectedZoneId: string | null;
  /** Resolves a stored `image.path` to a browser-loadable preview URL. */
  resolveImageUrl: (path: string) => string;
  onSelectBlock: (blockId: string | null) => void;
  onSelectZone: (zoneId: string | null) => void;
  onBlocksChange: (blocks: Block[]) => void;
}

function isWorksheet(block: Block): block is WorksheetBlock {
  return block.type === 'worksheet';
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
      🗑
    </Button>
  );
}

export default function BlockList({
  lang,
  blocks,
  selectedBlockId,
  selectedZoneId,
  resolveImageUrl,
  onSelectBlock,
  onSelectZone,
  onBlocksChange,
}: BlockListProps) {
  const t = UI_LABELS[lang].activities.editor;

  const moveBlock = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    onBlocksChange(next);
  };

  const deleteBlock = (blockId: string) => {
    onBlocksChange(blocks.filter((b) => b.id !== blockId));
    if (selectedBlockId === blockId) onSelectBlock(null);
  };

  const updateZones = (blockId: string, zones: Zone[]) => {
    onBlocksChange(blocks.map((b) => (b.id === blockId && isWorksheet(b) ? { ...b, zones } : b)));
  };

  if (blocks.length === 0) {
    return (
      <p data-testid="blocks-empty" className="text-sm text-muted-foreground">
        {t.blocksEmpty}
      </p>
    );
  }

  return (
    <ul data-testid="block-list" className="flex flex-col gap-3">
      {blocks.map((block, index) => {
        const selected = block.id === selectedBlockId;
        const label = block.type === 'worksheet' ? t.worksheetLabel : t.quizLabel;

        return (
          <li key={block.id} data-testid={`block-${block.id}`} className="rounded-lg border border-border">
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <button
                type="button"
                data-testid={`block-header-${block.id}`}
                aria-expanded={selected}
                onClick={() => onSelectBlock(selected ? null : block.id)}
                className="flex-1 text-left text-sm font-medium text-foreground"
              >
                {label}
              </button>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t.moveUp}
                  disabled={index === 0}
                  onClick={() => moveBlock(index, -1)}
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t.moveDown}
                  disabled={index === blocks.length - 1}
                  onClick={() => moveBlock(index, 1)}
                >
                  ↓
                </Button>
                <DeleteBlockButton
                  deleteLabel={t.deleteBlock}
                  confirmTitle={t.deleteConfirmTitle}
                  confirmBody={t.deleteConfirmBody}
                  cancelLabel={t.deleteConfirmCancel}
                  acceptLabel={t.deleteConfirmAccept}
                  onConfirm={() => deleteBlock(block.id)}
                />
              </div>
            </div>

            {selected && isWorksheet(block) && (
              <div className="border-t border-border p-3">
                <WorksheetZoneEditor
                  lang={lang}
                  image={block.image}
                  imageUrl={resolveImageUrl(block.image.path)}
                  zones={block.zones}
                  selectedZoneId={selectedZoneId}
                  onZonesChange={(zones) => updateZones(block.id, zones)}
                  onSelectZone={onSelectZone}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
