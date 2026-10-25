// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { PlusIcon } from '@phosphor-icons/react/dist/ssr/Plus';
import {
  AddCard,
  AddRow,
  ChipInput,
  Footnote,
  GroupLabel,
  ITEM_EXIT_MS,
  RowRemoveButton,
  SheetHeader,
  StatusNote,
  TEMPLATE_TOOLBAR_DOCK_MARGIN,
  TemplateEditorLayout,
  TemplateField,
  TemplateGroup,
  TemplateRow,
  useExitingItems,
  usePasteFeedback,
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

describe('TemplateEditorLayout — phone "Ver vista previa" button', () => {
  it('is omitted when no label is given', () => {
    render(<List />);
    expect(screen.queryByTestId('template-preview-button-b1')).toBeNull();
  });

  it('is hidden at lg and up, shows the given label, and scrolls the preview pane into view when tapped', () => {
    const scrollIntoView = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      render(
        <TemplateEditorLayout
          blockId="b1"
          stageLabel="Vista previa"
          stageEmptyText="Nada todavía"
          previewButtonLabel="Ver vista previa"
          sheet={<p>sheet</p>}
          preview={<div data-testid="activity-preview-pane">preview</div>}
        />,
      );
      const button = screen.getByTestId('template-preview-button-b1');
      expect(button.className).toContain('lg:hidden');
      expect(button.textContent).toBe('Ver vista previa');

      fireEvent.click(button);
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth', block: 'start' }));
    } finally {
      Element.prototype.scrollIntoView = original;
    }
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

/** A tiny harness: `rows` is a brand-new array every edit, exactly like a `QuizBlockEditor` draft commit. */
function PasteFeedbackHarness({ onShowRef }: { onShowRef: (show: (message: string) => void) => void }) {
  const [rows, setRows] = useState<string[]>(['a']);
  const feedback = usePasteFeedback(rows);
  onShowRef((message) => {
    setRows((prev) => [...prev]); // a fresh array identity, as a real paste commit would produce
    feedback.show(message);
  });
  return (
    <div>
      <p data-testid="feedback">{feedback.message ?? ''}</p>
      <button type="button" data-testid="edit" onClick={() => setRows((prev) => [...prev, 'x'])}>
        edit
      </button>
    </div>
  );
}

describe('usePasteFeedback', () => {
  it('shows the message right after it is set', () => {
    let show: (message: string) => void = () => {};
    render(<PasteFeedbackHarness onShowRef={(fn) => (show = fn)} />);
    act(() => show('Se agregaron 3 parejas'));
    expect(screen.getByTestId('feedback').textContent).toBe('Se agregaron 3 parejas');
  });

  it('reverts to nothing on the next edit, not on a timer', () => {
    let show: (message: string) => void = () => {};
    render(<PasteFeedbackHarness onShowRef={(fn) => (show = fn)} />);
    act(() => show('Se agregaron 3 parejas'));
    expect(screen.getByTestId('feedback').textContent).toBe('Se agregaron 3 parejas');

    fireEvent.click(screen.getByTestId('edit'));
    expect(screen.getByTestId('feedback').textContent).toBe('');
  });
});

// T3 toolbar-dock pass ("enlarge the preview, shrink the data sheet, reduce
// the font by 1-2pt, dock the toolbar over the preview instead of reserving
// a gutter for it").
describe('TEMPLATE_TOOLBAR_DOCK_MARGIN', () => {
  it('is the canvas padding (16px, the work area\'s own p-4) plus the toolbar\'s own DOCK_MARGIN (12px)', () => {
    expect(TEMPLATE_TOOLBAR_DOCK_MARGIN).toBe(28);
  });
});

describe('TemplateEditorLayout — desktop sizing (T3 toolbar-dock pass)', () => {
  it('no longer reserves the old lg:pr-[70px] gutter on the work-area wrapper', () => {
    render(<List />);
    expect(screen.getByTestId('quiz-editor-b1').className).not.toContain('lg:pr-[70px]');
  });

  it('shrinks the sheet to the new clamp(360px,36%,440px) width', () => {
    render(<List />);
    expect(screen.getByTestId('template-sheet-b1').className).toContain('lg:w-[clamp(360px,36%,440px)]');
  });

  // Horizontal toolbar pass ("gain space, no reserved gutter at all"): the
  // rail now docks along the BOTTOM of the stage card instead of the right
  // edge, so the old right-gutter reservation is gone — replaced by a
  // bottom one of the same size (12 gap + 42 rail + 12 inset), so the frame
  // uses the full card WIDTH and only loses room at the bottom.
  it('no longer reserves lg:pr-[66px]; reserves lg:pb-[66px] instead so the preview frame clears the docked rail', () => {
    render(<List />);
    const stage = screen.getByTestId('template-stage-b1');
    const scrollArea = stage.querySelector('.template-scroll');
    expect(scrollArea).not.toBeNull();
    expect(scrollArea!.className).not.toContain('lg:pr-[66px]');
    expect(scrollArea!.className).toContain('lg:pb-[66px]');
  });
});

describe('Template editor kit — desktop type, -1/2pt at lg (T3 toolbar-dock pass)', () => {
  it('shrinks the SheetHeader title and instruction at lg, phone keeps the base size', () => {
    render(<SheetHeader icon={PlusIcon} tone="sky" title="Une las parejas" instruction="Arrastra para emparejar" />);
    expect(screen.getByText('Une las parejas').className).toContain('lg:text-[16px]');
    expect(screen.getByText('Arrastra para emparejar').className).toContain('lg:text-[12px]');
  });

  it('shrinks GroupLabel at lg', () => {
    render(<GroupLabel>Preguntas</GroupLabel>);
    expect(screen.getByText('Preguntas').className).toContain('lg:text-[12px]');
  });

  it('shrinks StatusNote at lg', () => {
    render(
      <StatusNote tone="ready" testId="note">
        Listo para jugar
      </StatusNote>,
    );
    expect(screen.getByTestId('note').className).toContain('lg:text-[12px]');
  });

  it('shrinks Footnote at lg', () => {
    render(<Footnote testId="foot">Ejemplo: cat, dog</Footnote>);
    expect(screen.getByTestId('foot').className).toContain('lg:text-[12px]');
  });

  it('shrinks AddRow and AddCard at lg', () => {
    render(
      <>
        <AddRow label="Agregar pregunta" testId="add-row" onClick={() => {}} />
        <AddCard label="Agregar grupo" testId="add-card" onClick={() => {}} />
      </>,
    );
    expect(screen.getByTestId('add-row').className).toContain('lg:text-[15px]');
    expect(screen.getByTestId('add-card').className).toContain('lg:text-[15px]');
  });
});
