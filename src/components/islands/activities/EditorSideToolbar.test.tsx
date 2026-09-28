// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import EditorSideToolbar from './EditorSideToolbar';
import type { Block, WorksheetBlock } from '@/lib/activities/blocks';

afterEach(() => cleanup());

function worksheetBlock(id: string, name?: string): WorksheetBlock {
  return {
    id,
    type: 'worksheet',
    rotation: 0,
    name,
    image: { path: `activity-uploads/u1/${id}.webp`, width: 800, height: 600 },
    zones: [],
  };
}

const SAVE_LABELS = {
  saving: 'Guardando cambios',
  saved: 'Cambios guardados',
  error: 'No se pudo guardar',
  unsaved: 'Cambios sin guardar',
  retry: 'Reintentar',
  errorRetry: 'No se pudo guardar, reintentar',
};

function renderToolbar(overrides: Partial<Parameters<typeof EditorSideToolbar>[0]> = {}) {
  const props = {
    lang: 'es' as const,
    blocks: [] as Block[],
    onCollapseAll: vi.fn(),
    onExpandAll: vi.fn(),
    onGoToBlock: vi.fn(),
    onAddBlock: vi.fn(),
    preview: false,
    onTogglePreview: vi.fn(),
    canUndo: false,
    canRedo: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onSave: vi.fn(),
    saveDisabled: false,
    saveState: 'idle' as const,
    saveLabels: SAVE_LABELS,
    ...overrides,
  };
  render(<EditorSideToolbar {...props} />);
  return props;
}

describe('EditorSideToolbar — basic controls', () => {
  it('renders the rail with every icon button', () => {
    renderToolbar();
    expect(screen.getByTestId('editor-side-toolbar')).toBeTruthy();
    expect(screen.getByTestId('collapse-all-button')).toBeTruthy();
    expect(screen.getByTestId('expand-all-button')).toBeTruthy();
    expect(screen.getByTestId('block-index-trigger')).toBeTruthy();
    expect(screen.getByTestId('toolbar-add-block')).toBeTruthy();
    expect(screen.getByTestId('preview-toggle')).toBeTruthy();
    expect(screen.getByTestId('undo-button')).toBeTruthy();
    expect(screen.getByTestId('redo-button')).toBeTruthy();
    expect(screen.getByTestId('shortcuts-trigger')).toBeTruthy();
    expect(screen.getByTestId('save-button')).toBeTruthy();
    expect(screen.getByTestId('save-status')).toBeTruthy();
  });

  it('calls onCollapseAll / onExpandAll', () => {
    const props = renderToolbar();
    fireEvent.click(screen.getByTestId('collapse-all-button'));
    fireEvent.click(screen.getByTestId('expand-all-button'));
    expect(props.onCollapseAll).toHaveBeenCalledTimes(1);
    expect(props.onExpandAll).toHaveBeenCalledTimes(1);
  });

  it('disables undo/redo per props', () => {
    renderToolbar({ canUndo: false, canRedo: false });
    expect((screen.getByTestId('undo-button') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('redo-button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables and calls onUndo/onRedo', () => {
    const props = renderToolbar({ canUndo: true, canRedo: true });
    fireEvent.click(screen.getByTestId('undo-button'));
    fireEvent.click(screen.getByTestId('redo-button'));
    expect(props.onUndo).toHaveBeenCalledTimes(1);
    expect(props.onRedo).toHaveBeenCalledTimes(1);
  });

  it('toggles the preview icon based on the preview prop', () => {
    renderToolbar({ preview: false });
    expect(screen.getByTestId('preview-toggle').getAttribute('aria-label')).toBe('Vista previa');
    cleanup();
    renderToolbar({ preview: true });
    expect(screen.getByTestId('preview-toggle').getAttribute('aria-label')).toBe('Volver a editar');
  });
});

describe('EditorSideToolbar — block index popover', () => {
  it('opens the popover listing every block by its display name', () => {
    renderToolbar({ blocks: [worksheetBlock('b1'), worksheetBlock('b2', 'Repaso')] });
    fireEvent.click(screen.getByTestId('block-index-trigger'));
    const popover = screen.getByTestId('block-index-popover');
    expect(popover.textContent).toContain('Hoja 1');
    expect(popover.textContent).toContain('Repaso');
  });

  it('clicking an entry calls onGoToBlock and closes the popover', () => {
    const props = renderToolbar({ blocks: [worksheetBlock('b1')] });
    fireEvent.click(screen.getByTestId('block-index-trigger'));
    fireEvent.click(screen.getByTestId('block-index-item-b1'));
    expect(props.onGoToBlock).toHaveBeenCalledWith('b1');
    expect(screen.queryByTestId('block-index-popover')).toBeNull();
  });

  it('closes on Escape', () => {
    renderToolbar({ blocks: [worksheetBlock('b1')] });
    fireEvent.click(screen.getByTestId('block-index-trigger'));
    expect(screen.getByTestId('block-index-popover')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('block-index-popover')).toBeNull();
  });
});

describe('EditorSideToolbar — keyboard shortcuts dialog', () => {
  it('opens the dialog listing shortcuts', () => {
    renderToolbar();
    fireEvent.click(screen.getByTestId('shortcuts-trigger'));
    const dialog = screen.getByTestId('shortcuts-dialog');
    expect(dialog.textContent).toContain('Z'); // undo/redo keys shown
  });
});

describe('EditorSideToolbar — save', () => {
  it('calls onSave from the save button', () => {
    const props = renderToolbar();
    fireEvent.click(screen.getByTestId('save-button'));
    expect(props.onSave).toHaveBeenCalledTimes(1);
  });

  it('disables the save button while saving', () => {
    renderToolbar({ saveDisabled: true, saveState: 'saving' });
    expect((screen.getByTestId('save-button') as HTMLButtonElement).disabled).toBe(true);
  });
});
