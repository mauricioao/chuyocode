// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import {
  AddRow,
  ChipInput,
  ITEM_EXIT_MS,
  RowRemoveButton,
  StatusNote,
  TemplateEditorLayout,
  TemplateField,
  TemplateGroup,
  TemplateRow,
  useExitingItems,
} from './TemplateEditorKit';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** `matchMedia` answering `prefers-reduced-motion: reduce` with `reduce`. */
function stubMotionPreference(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

/** A tiny list built from the kit, the way every template editor composes it. */
function List({ initial = ['a', 'b', 'c'], onRemoved = () => {} }: { initial?: string[]; onRemoved?: (id: string) => void }) {
  const [items, setItems] = useState(initial);
  const exits = useExitingItems((id: string) => {
    onRemoved(id);
    setItems((prev) => prev.filter((item) => item !== id));
  });
  return (
    <TemplateEditorLayout
      blockId="b1"
      stageLabel="Vista previa"
      stageEmptyText="Nada todavía"
      preview={null}
      sheet={
        <TemplateGroup ariaLabel="Items">
          {items.map((id) => (
            <TemplateRow key={id} testId={`row-${id}`} leaving={exits.isLeaving(id)} className="flex">
              <TemplateField aria-label={`Field ${id}`} data-testid={`field-${id}`} defaultValue={id} />
              <RowRemoveButton label={`Remove ${id}`} testId={`remove-${id}`} onRemove={() => exits.remove(id, id)} />
            </TemplateRow>
          ))}
          <AddRow label="Add" testId="add" onClick={() => setItems((prev) => [...prev, `n${prev.length}`])} />
        </TemplateGroup>
      }
    />
  );
}

describe('TemplateEditorLayout', () => {
  it('marks the work area as the template canvas and shows the stage label and its empty text without a preview', () => {
    render(<List />);
    expect(screen.getByTestId('quiz-editor-b1').hasAttribute('data-template-canvas')).toBe(true);
    const stage = screen.getByTestId('template-stage-b1');
    expect(stage.getAttribute('aria-label')).toBe('Vista previa');
    expect(stage.textContent).toContain('Vista previa');
    expect(screen.getByTestId('template-stage-empty-b1').textContent).toBe('Nada todavía');
  });

  it('renders the preview instead of the empty text once there is one', () => {
    render(
      <TemplateEditorLayout
        blockId="b1"
        stageLabel="Vista previa"
        stageEmptyText="Nada todavía"
        sheet={null}
        preview={<p data-testid="game">game</p>}
      />,
    );
    expect(screen.getByTestId('game')).toBeTruthy();
    expect(screen.queryByTestId('template-stage-empty-b1')).toBeNull();
  });
});

describe('row entry animation', () => {
  it('does not animate rows already there on the first render, only rows added afterwards', () => {
    render(<List />);
    expect(screen.getByTestId('row-a').classList.contains('template-enter')).toBe(false);

    fireEvent.click(screen.getByTestId('add'));
    expect(screen.getByTestId('row-n3').classList.contains('template-enter')).toBe(true);
    // An existing row never picks the animation up on a later render.
    expect(screen.getByTestId('row-a').classList.contains('template-enter')).toBe(false);
  });
});

describe('useExitingItems', () => {
  it('removes immediately when matchMedia is unavailable', () => {
    render(<List />);
    fireEvent.click(screen.getByTestId('remove-b'));
    expect(screen.queryByTestId('row-b')).toBeNull();
  });

  it('removes immediately under prefers-reduced-motion', () => {
    stubMotionPreference(true);
    render(<List />);
    fireEvent.click(screen.getByTestId('remove-b'));
    expect(screen.queryByTestId('row-b')).toBeNull();
  });

  it('lets the row fold away first, then removes it', () => {
    stubMotionPreference(false);
    vi.useFakeTimers();
    render(<List />);

    fireEvent.click(screen.getByTestId('remove-b'));
    const row = screen.getByTestId('row-b');
    expect(row.hasAttribute('data-leaving')).toBe(true);
    expect(row.getAttribute('aria-hidden')).toBe('true');

    act(() => {
      vi.advanceTimersByTime(ITEM_EXIT_MS - 1);
    });
    expect(screen.getByTestId('row-b')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByTestId('row-b')).toBeNull();
    expect(screen.getByTestId('row-a').hasAttribute('data-leaving')).toBe(false);
  });

  it('ignores a second click on a row that is already leaving', () => {
    stubMotionPreference(false);
    vi.useFakeTimers();
    const onRemoved = vi.fn();
    render(<List onRemoved={onRemoved} />);

    fireEvent.click(screen.getByTestId('remove-b'));
    fireEvent.click(screen.getByTestId('remove-b'));
    act(() => {
      vi.advanceTimersByTime(ITEM_EXIT_MS);
    });
    expect(onRemoved).toHaveBeenCalledTimes(1);
  });

  it('still commits a pending removal if the editor unmounts before it lands', () => {
    stubMotionPreference(false);
    vi.useFakeTimers();
    const onRemoved = vi.fn();
    const { unmount } = render(<List onRemoved={onRemoved} />);

    fireEvent.click(screen.getByTestId('remove-b'));
    unmount();
    expect(onRemoved).toHaveBeenCalledWith('b');
  });
});

describe('RowRemoveButton', () => {
  it('hands focus to the next row when activated from the keyboard', () => {
    render(<List />);
    // `detail: 0` is what a keyboard-activated click carries.
    fireEvent.click(screen.getByTestId('remove-a'), { detail: 0 });
    expect(document.activeElement).toBe(screen.getByTestId('field-b'));
  });

  it('falls back to the add row after the last item', () => {
    render(<List initial={['a']} />);
    fireEvent.click(screen.getByTestId('remove-a'), { detail: 0 });
    expect(document.activeElement).toBe(screen.getByTestId('add'));
  });

  it('leaves focus alone for a pointer click', () => {
    render(<List />);
    fireEvent.click(screen.getByTestId('remove-a'), { detail: 1 });
    expect(document.activeElement).not.toBe(screen.getByTestId('field-b'));
  });
});

describe('ChipInput', () => {
  function setup() {
    const onCommit = vi.fn();
    render(<ChipInput placeholder="+ palabra" ariaLabel="Agregar palabra" testId="chip-input" onCommit={onCommit} />);
    return { onCommit, input: screen.getByTestId('chip-input') as HTMLInputElement };
  }

  it('commits the typed text on Enter and clears itself', () => {
    const { onCommit, input } = setup();
    fireEvent.change(input, { target: { value: 'dog, cat' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('dog, cat');
    expect(input.value).toBe('');
  });

  it('commits on blur too, so a typed word is never silently left behind', () => {
    const { onCommit, input } = setup();
    fireEvent.change(input, { target: { value: 'went' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith('went');
  });

  it('never commits blank text, nor on Ctrl+Enter (the block-level "add row" shortcut)', () => {
    const { onCommit, input } = setup();
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.change(input, { target: { value: 'dog' } });
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe('dog');
  });

  it('is labelled for assistive tech', () => {
    setup();
    expect(screen.getByLabelText('Agregar palabra')).toBeTruthy();
  });
});

describe('StatusNote', () => {
  it('is a polite status line that carries its tone', () => {
    render(
      <StatusNote tone="ready" testId="note">
        Listo para jugar · 3 parejas
      </StatusNote>,
    );
    const note = screen.getByRole('status');
    expect(note.textContent).toBe('Listo para jugar · 3 parejas');
    expect(note.getAttribute('data-tone')).toBe('ready');
  });
});
