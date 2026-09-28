/**
 * EditorSideToolbar — the editor's sticky, vertically-centered icon rail
 * (creator polish round 2, owner request #7). Everything that used to sit
 * scattered across the top bar (preview toggle, save button, save status)
 * plus the new block-navigation/collapse controls and undo/redo now live
 * here, keeping the top bar down to just title + level (owner request #1).
 *
 * Every button is icon-only with an accessible `aria-label` (also its
 * `title`, so a mouse user gets a native tooltip for free) — no icon here
 * needs a visible text caption, matching `SaveStatusIndicator`'s own
 * icon-only posture.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowsInIcon } from '@phosphor-icons/react/dist/ssr/ArrowsIn';
import { ArrowsOutIcon } from '@phosphor-icons/react/dist/ssr/ArrowsOut';
import { ListBulletsIcon } from '@phosphor-icons/react/dist/ssr/ListBullets';
import { PlusIcon } from '@phosphor-icons/react/dist/ssr/Plus';
import { EyeIcon } from '@phosphor-icons/react/dist/ssr/Eye';
import { EyeSlashIcon } from '@phosphor-icons/react/dist/ssr/EyeSlash';
import { ArrowUUpLeftIcon } from '@phosphor-icons/react/dist/ssr/ArrowUUpLeft';
import { ArrowUUpRightIcon } from '@phosphor-icons/react/dist/ssr/ArrowUUpRight';
import { KeyboardIcon } from '@phosphor-icons/react/dist/ssr/Keyboard';
import { FloppyDiskIcon } from '@phosphor-icons/react/dist/ssr/FloppyDisk';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import type { Block } from '@/lib/activities/blocks';
import type { AutosaveStatus } from '@/lib/activities/autosave';
import { blockDisplayName } from './BlockList';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import SaveStatusIndicator, { type SaveStatusLabels } from './SaveStatusIndicator';

export interface EditorSideToolbarProps {
  lang: Lang;
  blocks: Block[];
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onGoToBlock: (blockId: string) => void;
  onAddBlock: () => void;
  preview: boolean;
  onTogglePreview: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  saveDisabled: boolean;
  saveState: AutosaveStatus | 'idle';
  saveLabels: SaveStatusLabels;
}

/** A single icon button in the rail — factored out so every entry gets the same shape/spacing. */
function ToolbarIconButton({
  label,
  testId,
  disabled,
  onClick,
  children,
}: {
  label: string;
  testId: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      aria-label={label}
      title={label}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/** The block-index popover: lists every block's display name, click to go to it. */
function BlockIndexPopover({
  lang,
  blocks,
  onGoToBlock,
}: {
  lang: Lang;
  blocks: Block[];
  onGoToBlock: (blockId: string) => void;
}) {
  const t = UI_LABELS[lang].activities.editor;
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    function onPointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) close();
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open, close]);

  return (
    <div ref={containerRef} className="relative">
      <ToolbarIconButton label={t.blockIndex} testId="block-index-trigger" onClick={() => setOpen((v) => !v)}>
        <ListBulletsIcon aria-hidden="true" />
      </ToolbarIconButton>
      {open && (
        <div
          data-testid="block-index-popover"
          role="menu"
          className="absolute right-full top-0 mr-2 w-56 rounded-md border border-border bg-popover p-2 shadow-lg"
        >
          <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">{t.blockIndexTitle}</p>
          {blocks.length === 0 ? (
            <p className="px-2 py-1 text-sm text-muted-foreground">{t.blocksEmpty}</p>
          ) : (
            <ul className="flex flex-col">
              {blocks.map((block, index) => (
                <li key={block.id}>
                  <button
                    type="button"
                    role="menuitem"
                    data-testid={`block-index-item-${block.id}`}
                    onClick={() => {
                      onGoToBlock(block.id);
                      close();
                    }}
                    className="w-full truncate rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                  >
                    {blockDisplayName(block, index, t.blockDefaultNamePrefix)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** The keyboard-shortcuts help dialog (owner request #7). */
function ShortcutsDialog({ lang }: { lang: Lang }) {
  const t = UI_LABELS[lang].activities.editor;
  const [open, setOpen] = useState(false);
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent ?? '');
  const mod = mac ? '⌘' : 'Ctrl';

  const shortcuts: Array<[string, string]> = [
    [t.shortcutUndo, `${mod}+Z`],
    [t.shortcutRedo, `${mod}+Shift+Z`],
    [t.shortcutSave, `${mod}+S`],
    [t.shortcutEscape, 'Esc'],
    [t.shortcutZoomIn, '+'],
    [t.shortcutZoomOut, '-'],
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <ToolbarIconButton label={t.shortcutsHelp} testId="shortcuts-trigger" onClick={() => setOpen(true)}>
        <KeyboardIcon aria-hidden="true" />
      </ToolbarIconButton>
      <DialogContent data-testid="shortcuts-dialog">
        <DialogHeader>
          <DialogTitle>{t.shortcutsTitle}</DialogTitle>
        </DialogHeader>
        <ul className="flex flex-col gap-2 text-sm">
          {shortcuts.map(([label, keys]) => (
            <li key={label} className="flex items-center justify-between gap-4">
              <span className="text-foreground">{label}</span>
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                {keys}
              </kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

export default function EditorSideToolbar({
  lang,
  blocks,
  onCollapseAll,
  onExpandAll,
  onGoToBlock,
  onAddBlock,
  preview,
  onTogglePreview,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSave,
  saveDisabled,
  saveState,
  saveLabels,
}: EditorSideToolbarProps) {
  const t = UI_LABELS[lang].activities.editor;

  return (
    <div
      data-testid="editor-side-toolbar"
      className="fixed top-1/2 right-3 z-40 flex -translate-y-1/2 flex-col items-center gap-1 rounded-full border border-border bg-card/95 p-1.5 shadow-lg backdrop-blur-sm"
    >
      <ToolbarIconButton label={t.collapseAll} testId="collapse-all-button" onClick={onCollapseAll}>
        <ArrowsInIcon aria-hidden="true" />
      </ToolbarIconButton>
      <ToolbarIconButton label={t.expandAll} testId="expand-all-button" onClick={onExpandAll}>
        <ArrowsOutIcon aria-hidden="true" />
      </ToolbarIconButton>
      <BlockIndexPopover lang={lang} blocks={blocks} onGoToBlock={onGoToBlock} />
      <ToolbarIconButton label={t.addBlock} testId="toolbar-add-block" onClick={onAddBlock}>
        <PlusIcon aria-hidden="true" />
      </ToolbarIconButton>

      <div className="my-1 h-px w-6 bg-border" aria-hidden="true" />

      <ToolbarIconButton
        label={preview ? t.previewOff : t.previewOn}
        testId="preview-toggle"
        onClick={onTogglePreview}
      >
        {preview ? <EyeSlashIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
      </ToolbarIconButton>

      <div className="my-1 h-px w-6 bg-border" aria-hidden="true" />

      <ToolbarIconButton label={t.undo} testId="undo-button" disabled={!canUndo} onClick={onUndo}>
        <ArrowUUpLeftIcon aria-hidden="true" />
      </ToolbarIconButton>
      <ToolbarIconButton label={t.redo} testId="redo-button" disabled={!canRedo} onClick={onRedo}>
        <ArrowUUpRightIcon aria-hidden="true" />
      </ToolbarIconButton>

      <div className="my-1 h-px w-6 bg-border" aria-hidden="true" />

      <ShortcutsDialog lang={lang} />

      <div className="my-1 h-px w-6 bg-border" aria-hidden="true" />

      <ToolbarIconButton label={t.save} testId="save-button" disabled={saveDisabled} onClick={onSave}>
        <FloppyDiskIcon aria-hidden="true" />
      </ToolbarIconButton>
      <SaveStatusIndicator status={saveState} onRetry={onSave} labels={saveLabels} />
    </div>
  );
}
