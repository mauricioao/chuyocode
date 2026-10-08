// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { useState } from 'react';
import { renderThenHydrate } from '@/testSupport/hydrationHarness';
import QuizBlockEditor from './QuizBlockEditor';
import type { Payload } from '@/lib/exercisePayload';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const EMPTY_PAYLOAD: Payload = { pools: {}, slots: [] };

const ONE_QUESTION_PAYLOAD: Payload = {
  pools: {},
  slots: [{ id: 's1', label: 'The cat ___ on the mat', input: 'text', answer: ['sits'] }],
};

const TWO_QUESTION_PAYLOAD: Payload = {
  pools: {},
  slots: [
    { id: 's1', label: 'First', input: 'text', answer: ['a'] },
    { id: 's2', label: 'Second', input: 'text', answer: [] },
  ],
  blocks: [
    { kind: 'row', id: 'row-s1', slotId: 's1' },
    { kind: 'row', id: 'row-s2', slotId: 's2' },
  ],
};

function Harness({ initialPayload }: { initialPayload: Payload }) {
  const [payload, setPayload] = useState<Payload>(initialPayload);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  return (
    <QuizBlockEditor
      blockId="b1"
      lang="es"
      payload={payload}
      selectedSlotId={selectedSlotId}
      onSelectSlot={setSelectedSlotId}
      onPayloadChange={setPayload}
    />
  );
}

/** Same harness, authoring a `template: 'match'` block ("Une las parejas", build item 1). */
function MatchHarness({ initialPayload }: { initialPayload: Payload }) {
  const [payload, setPayload] = useState<Payload>(initialPayload);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  return (
    <QuizBlockEditor
      blockId="b1"
      lang="es"
      payload={payload}
      template="match"
      selectedSlotId={selectedSlotId}
      onSelectSlot={setSelectedSlotId}
      onPayloadChange={setPayload}
    />
  );
}

/** Same harness, authoring a `template: 'reorder'` block ("Reordenar"). */
function ReorderHarness({ initialPayload }: { initialPayload: Payload }) {
  const [payload, setPayload] = useState<Payload>(initialPayload);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  return (
    <QuizBlockEditor
      blockId="b1"
      lang="es"
      payload={payload}
      template="reorder"
      selectedSlotId={selectedSlotId}
      onSelectSlot={setSelectedSlotId}
      onPayloadChange={setPayload}
    />
  );
}

/** Same harness, authoring a `template: 'cloze'` block ("Completar la frase"). */
function ClozeHarness({ initialPayload }: { initialPayload: Payload }) {
  const [payload, setPayload] = useState<Payload>(initialPayload);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  return (
    <QuizBlockEditor
      blockId="b1"
      lang="es"
      payload={payload}
      template="cloze"
      selectedSlotId={selectedSlotId}
      onSelectSlot={setSelectedSlotId}
      onPayloadChange={setPayload}
    />
  );
}

/** Same harness, authoring a `template: 'groupsort'` block ("Ordenar por grupos"). */
function GroupSortHarness({ initialPayload }: { initialPayload: Payload }) {
  const [payload, setPayload] = useState<Payload>(initialPayload);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  return (
    <QuizBlockEditor
      blockId="b1"
      lang="es"
      payload={payload}
      template="groupsort"
      selectedSlotId={selectedSlotId}
      onSelectSlot={setSelectedSlotId}
      onPayloadChange={setPayload}
    />
  );
}

describe('QuizBlockEditor — empty state (item 4, example-first)', () => {
  it('shows the empty-questions message, a 3-question example preview, and no question list or checklist', () => {
    render(<Harness initialPayload={EMPTY_PAYLOAD} />);
    const empty = screen.getByTestId('quiz-empty-b1');
    expect(empty.textContent).toContain('Agrega tu primera pregunta');
    expect(screen.queryByTestId('quiz-question-list-b1')).toBeNull();
    expect(screen.queryByTestId('quiz-checklist-b1')).toBeNull();

    const preview = screen.getByTestId('quiz-example-preview-b1');
    expect(preview.textContent).toContain('What color is the sky?');

    const useExampleButton = screen.getByTestId('quiz-use-example-b1');
    expect(empty.contains(useExampleButton)).toBe(true);
    expect(useExampleButton.getAttribute('data-variant')).toBe('primary');

    const startBlankButton = screen.getByTestId('quiz-start-blank-b1');
    expect(empty.contains(startBlankButton)).toBe(true);
    expect(startBlankButton.getAttribute('data-variant')).toBe('outline');
  });

  it('"Usar este ejemplo" fills the block with 3 submit-ready questions', () => {
    render(<Harness initialPayload={EMPTY_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('quiz-use-example-b1'));
    expect(screen.getAllByTestId(/^question-card-/)).toHaveLength(3);
    expect(screen.getByTestId('quiz-checklist-b1').textContent).toContain('todas con respuesta');
  });

  it('"Empezar en blanco" adds one empty question card, focused', () => {
    render(<Harness initialPayload={EMPTY_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('quiz-start-blank-b1'));
    const cards = screen.getAllByTestId(/^question-card-/);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.getAttribute('data-highlighted')).toBe('true');
  });
});

describe('QuizBlockEditor — adding a question', () => {
  it('"Empezar en blanco" from the empty state adds a question as an always-editable card and selects it', () => {
    render(<Harness initialPayload={EMPTY_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('quiz-start-blank-b1'));

    expect(screen.getByTestId('quiz-question-list-b1')).toBeTruthy();
    expect(screen.queryByTestId('quiz-empty-b1')).toBeNull();
    const cards = screen.getAllByTestId(/^question-card-/);
    expect(cards).toHaveLength(1);
  });

  it('the trailing "+ Agregar pregunta" button adds another question once at least one exists', () => {
    render(<Harness initialPayload={ONE_QUESTION_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('add-question-b1'));
    expect(screen.getAllByTestId(/^question-card-/)).toHaveLength(2);
  });

  it('Ctrl+Enter anywhere inside the block adds the next question', () => {
    render(<Harness initialPayload={ONE_QUESTION_PAYLOAD} />);
    fireEvent.keyDown(screen.getByTestId('question-text-s1'), { key: 'Enter', ctrlKey: true });
    expect(screen.getAllByTestId(/^question-card-/)).toHaveLength(2);
  });
});

describe('QuizBlockEditor — editing a question', () => {
  it('updates the sentence directly on the card', () => {
    render(<Harness initialPayload={ONE_QUESTION_PAYLOAD} />);
    const textarea = screen.getByTestId('question-text-s1');
    fireEvent.change(textarea, { target: { value: 'The dog ___ on the rug' } });
    expect((screen.getByTestId('question-text-s1') as HTMLTextAreaElement).value).toBe(
      'The dog ___ on the rug',
    );
  });

  it('changes the type to choice (preserving the accepted answer as an option) and adds another option', () => {
    render(<Harness initialPayload={ONE_QUESTION_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('question-type-s1-choice'));
    // text -> choice preserves 'sits' as the first option (quizQuestionType.ts).
    expect(screen.getByTestId('question-options-s1').querySelectorAll('[data-testid^="question-option-text-"]'))
      .toHaveLength(1);
    fireEvent.click(screen.getByTestId('question-add-option-s1'));
    expect(screen.getByTestId('question-options-s1').querySelectorAll('[data-testid^="question-option-text-"]'))
      .toHaveLength(2);
  });
});

describe('QuizBlockEditor — explanation (D5, "¿Por qué?")', () => {
  it('starts empty, and types an explanation via the "Más opciones" panel', () => {
    render(<Harness initialPayload={ONE_QUESTION_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('question-more-options-s1'));
    const input = screen.getByTestId('question-explanation-s1') as HTMLTextAreaElement;
    expect(input.value).toBe('');
    fireEvent.change(input, { target: { value: 'Third person -s.' } });
    expect((screen.getByTestId('question-explanation-s1') as HTMLTextAreaElement).value).toBe(
      'Third person -s.',
    );
  });
});

describe('QuizBlockEditor — duplicating a question', () => {
  it('inserts a copy right after the original, with a fresh pool for pooled types', () => {
    const payload: Payload = {
      pools: { opts: [{ id: 'a', text: 'cat' }, { id: 'b', text: 'dog' }] },
      slots: [{ id: 's1', label: 'Pick one', input: 'choice', pool: 'opts', answer: ['b'] }],
    };
    render(<Harness initialPayload={payload} />);
    fireEvent.click(screen.getByTestId('question-duplicate-s1'));

    const cards = screen.getAllByTestId(/^question-card-/);
    expect(cards).toHaveLength(2);
    // The duplicate is a different slot id, so its own data-testid differs.
    const duplicateId = cards[1]!.getAttribute('data-testid')!.replace('question-card-', '');
    expect(duplicateId).not.toBe('s1');
    expect(screen.getByTestId(`question-text-${duplicateId}`)).toBeTruthy();
  });
});

describe('QuizBlockEditor — removing a question', () => {
  it('removes the question and clears its selection', () => {
    render(<Harness initialPayload={ONE_QUESTION_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('question-delete-s1'));
    expect(screen.getByTestId('quiz-empty-b1')).toBeTruthy();
    expect(screen.queryByTestId('question-card-s1')).toBeNull();
  });
});

describe('QuizBlockEditor — scrolling a newly added/selected question into view (owner report: "se rompe el scroll y no deja llegar a la parte superior")', () => {
  // ROOT CAUSE, confirmed with a real browser (Playwright against the live
  // editor, not jsdom — `scrollIntoView` does not exist in jsdom): `block:
  // 'center'` asks EVERY scrollable ancestor along the DOM chain to
  // re-center the target, not just this column — including several
  // wrappers further up (`activity-editor-card` in
  // `ActivityEditorIsland.tsx`, confirmed the culprit; `DeskWindow.astro`'s
  // own window body/section) that exist ONLY to clip their content
  // (`overflow: hidden`, no visible scrollbar for a visitor to scroll back
  // with) and were never meant to scroll at all. Those are now `overflow:
  // clip` (verified elsewhere — `BlockList.test.tsx`,
  // `ActivityEditorIsland.test.tsx`), which makes them immune to a
  // programmatic scroll regardless of the option passed here; `block:
  // 'nearest'` is the other half of the fix — it only ever moves the ONE
  // real scroll container (this column), the minimum needed, instead of
  // re-centering it on every add/select.
  it('passes `block: "nearest"`, never "center", to `scrollIntoView`', () => {
    const scrollIntoView = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      render(<Harness initialPayload={ONE_QUESTION_PAYLOAD} />);
      scrollIntoView.mockClear();
      fireEvent.click(screen.getByTestId('add-question-b1'));
      expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'nearest' }));
      expect(scrollIntoView).not.toHaveBeenCalledWith(expect.objectContaining({ block: 'center' }));
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });
});

describe('QuizBlockEditor — reordering questions', () => {
  it('renders a labeled, focusable drag handle per question, in question order', () => {
    render(<Harness initialPayload={TWO_QUESTION_PAYLOAD} />);
    const cards = screen.getAllByTestId(/^question-card-/);
    expect(cards[0]?.textContent).toContain('First');
    expect(cards[1]?.textContent).toContain('Second');

    const handles = screen.getAllByLabelText('Reordenar pregunta', { selector: 'button' });
    expect(handles).toHaveLength(2);
    expect(handles.every((h) => h.getAttribute('tabindex') === '0')).toBe(true);
  });
});

describe('QuizBlockEditor — checklist', () => {
  it('shows a complete badge when every question already has an answer', () => {
    render(<Harness initialPayload={ONE_QUESTION_PAYLOAD} />);
    const checklist = screen.getByTestId('quiz-checklist-b1');
    expect(checklist.textContent).toContain('1 pregunta');
    expect(checklist.textContent).toContain('todas con respuesta');
  });

  it('lists an incomplete question and jumps to it on click', () => {
    render(<Harness initialPayload={TWO_QUESTION_PAYLOAD} />);
    const item = screen.getByTestId('quiz-checklist-item-b1-s2');
    expect(item.textContent).toContain('Pregunta 2');
    fireEvent.click(item);
    expect(screen.getByTestId('question-card-s2').getAttribute('data-highlighted')).toBe('true');
  });
});

describe('QuizBlockEditor — fits the focus block and scrolls inside it', () => {
  // The expanded block in the editor's desktop focus layout has a fixed height
  // and clips its overflow, so a long question list or a tall preview was cut
  // off with no way to reach it. Each column must scroll on its own.
  const classesOf = (testId: string) => screen.getByTestId(testId).className.split(/\s+/);

  it('joins the height chain with its root and its two-column grid', () => {
    render(<Harness initialPayload={TWO_QUESTION_PAYLOAD} />);
    expect(classesOf('quiz-editor-b1')).toEqual(expect.arrayContaining(['flex-1', 'min-h-0']));
    expect(classesOf('quiz-columns-b1')).toEqual(expect.arrayContaining(['lg:flex-1', 'lg:min-h-0']));
  });

  it('gives the questions column and the preview column their own vertical scroll on desktop', () => {
    render(<Harness initialPayload={TWO_QUESTION_PAYLOAD} />);
    for (const column of ['quiz-col-questions-b1', 'quiz-col-preview-b1']) {
      expect(classesOf(column)).toEqual(expect.arrayContaining(['lg:min-h-0', 'lg:overflow-y-auto']));
    }
  });

  // NO WHITE STRIP ON THE RIGHT (build item 6): the preview column used to
  // reserve `lg:pr-16` so the floating side toolbar's docked slot would
  // never cover the preview's own Comprobar button — replaced by
  // `QuizLivePreview`'s own floating Comprobar (build item 5, `editorOffset`),
  // which clears that same toolbar on its own. The column now runs edge to
  // edge, same as the questions column beside it.
  it('runs the preview column edge to edge — no reserved gutter for the docked toolbar any more', () => {
    render(<Harness initialPayload={TWO_QUESTION_PAYLOAD} />);
    expect(classesOf('quiz-col-preview-b1')).not.toEqual(expect.arrayContaining(['lg:pr-16']));
    expect(classesOf('quiz-col-questions-b1')).not.toEqual(expect.arrayContaining(['lg:pr-16']));
  });

  it('lets the empty state scroll inside the block too', () => {
    render(<Harness initialPayload={EMPTY_PAYLOAD} />);
    expect(classesOf('quiz-editor-b1')).toEqual(
      expect.arrayContaining(['flex-1', 'min-h-0', 'lg:overflow-y-auto']),
    );
  });
});

describe('QuizBlockEditor — live preview (items 3 and 8)', () => {
  it('renders no preview or mobile tabs in the empty state', () => {
    render(<Harness initialPayload={EMPTY_PAYLOAD} />);
    expect(screen.queryByTestId('quiz-preview-b1')).toBeNull();
    expect(screen.queryByTestId('quiz-mobile-tabs-b1')).toBeNull();
  });

  it('renders both the question list and the live preview once there is a question', () => {
    render(<Harness initialPayload={ONE_QUESTION_PAYLOAD} />);
    expect(screen.getByTestId('quiz-question-list-b1')).toBeTruthy();
    expect(screen.getByTestId('quiz-preview-b1')).toBeTruthy();
  });

  it('the mobile tab bar starts on "Preguntas" and switches to "Vista previa" on click (CSS-only visibility, both columns stay mounted)', () => {
    render(<Harness initialPayload={ONE_QUESTION_PAYLOAD} />);
    const questionsTab = screen.getByTestId('quiz-tab-questions-b1');
    const previewTab = screen.getByTestId('quiz-tab-preview-b1');
    expect(questionsTab.getAttribute('aria-selected')).toBe('true');
    expect(previewTab.getAttribute('aria-selected')).toBe('false');

    fireEvent.click(previewTab);
    expect(previewTab.getAttribute('aria-selected')).toBe('true');
    expect(questionsTab.getAttribute('aria-selected')).toBe('false');
    // Both columns remain in the DOM (CSS visibility only) — no unmount/remount.
    expect(screen.getByTestId('quiz-question-list-b1')).toBeTruthy();
    expect(screen.getByTestId('quiz-preview-b1')).toBeTruthy();
  });
});

describe('QuizBlockEditor — first-run tips (item 6)', () => {
  it('shows step 1 anchored near the first question once a question exists', () => {
    render(<Harness initialPayload={ONE_QUESTION_PAYLOAD} />);
    const tip = screen.getByTestId('quiz-first-run-tip');
    expect(tip.textContent).toContain('Escribe la pregunta');
  });

  it('walks through all 3 steps via "Siguiente", ending on "Listo" at the add-question button', () => {
    render(<Harness initialPayload={ONE_QUESTION_PAYLOAD} />);
    expect(screen.getByTestId('quiz-first-run-tip').textContent).toContain('Escribe la pregunta');

    fireEvent.click(screen.getByTestId('quiz-first-run-tip-next'));
    expect(screen.getByTestId('quiz-first-run-tip').textContent).toContain('Toca el círculo de la correcta');

    fireEvent.click(screen.getByTestId('quiz-first-run-tip-next'));
    const lastTip = screen.getByTestId('quiz-first-run-tip');
    expect(lastTip.textContent).toContain('Agrega otra pregunta');
    expect(screen.getByTestId('quiz-first-run-tip-next').textContent).toBe('Listo');

    fireEvent.click(screen.getByTestId('quiz-first-run-tip-next'));
    expect(screen.queryByTestId('quiz-first-run-tip')).toBeNull();
  });

  it('"Omitir" ends the tour immediately', () => {
    render(<Harness initialPayload={ONE_QUESTION_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('quiz-first-run-tip-dismiss'));
    expect(screen.queryByTestId('quiz-first-run-tip')).toBeNull();
  });

  it('never shows again once finished, even after remounting the editor', () => {
    const { unmount } = render(<Harness initialPayload={ONE_QUESTION_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('quiz-first-run-tip-dismiss'));
    unmount();

    render(<Harness initialPayload={ONE_QUESTION_PAYLOAD} />);
    expect(screen.queryByTestId('quiz-first-run-tip')).toBeNull();
  });

  it('only the first question card ever anchors a tip — a second question gets none', () => {
    render(<Harness initialPayload={TWO_QUESTION_PAYLOAD} />);
    expect(screen.getAllByTestId('quiz-first-run-tip')).toHaveLength(1);
  });
});

describe('QuizBlockEditor — incomplete pointer', () => {
  it('shows the incomplete message on the pointed-to question', () => {
    render(
      <QuizBlockEditor
        blockId="b1"
        lang="es"
        payload={ONE_QUESTION_PAYLOAD}
        selectedSlotId="s1"
        onSelectSlot={() => {}}
        onPayloadChange={() => {}}
        incompleteSlotId="s1"
        incompleteMessage="Esta pregunta todavía no tiene una respuesta."
      />,
    );
    expect(screen.getByTestId('question-incomplete-s1').textContent).toBe(
      'Esta pregunta todavía no tiene una respuesta.',
    );
  });
});

describe('QuizBlockEditor — hydration (useFirstRunTips reads localStorage, item 6)', () => {
  it('does not report a recoverable hydration error when the tour has never been seen', async () => {
    const { recoverableErrors, consoleErrors } = await renderThenHydrate(() => (
      <Harness initialPayload={ONE_QUESTION_PAYLOAD} />
    ));
    expect(recoverableErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  it('does not report a recoverable hydration error when the tour was already dismissed', async () => {
    const { recoverableErrors, consoleErrors } = await renderThenHydrate(
      () => <Harness initialPayload={ONE_QUESTION_PAYLOAD} />,
      { localStorage: { 'chuyo:quiz-editor-tips-v1': '1' } },
    );
    expect(recoverableErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  /**
   * THE REGRESSION THIS GUARDS (bug found via CI log 2026-10-05): with no
   * explicit `id` on this component's `<DndContext>`, dnd-kit mints
   * `aria-describedby` from a module-level counter that disagrees between
   * the "server" pass and the client hydration pass below — React patches
   * the attribute silently (so `recoverableErrors` stayed empty and this
   * `describe` block kept "passing") but still logs
   * `console.error("Warning: ...didn't match the client properties...")`.
   * Two questions render two `SortableQuestionCard`s, which is what actually
   * exercises the DndContext/SortableContext pair below — the empty-state
   * tests above never mount it at all.
   */
  it('does not log a console error for a mismatched DndContext aria-describedby', async () => {
    const { recoverableErrors, consoleErrors } = await renderThenHydrate(() => (
      <Harness initialPayload={TWO_QUESTION_PAYLOAD} />
    ));
    expect(recoverableErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});

describe('QuizBlockEditor — "Une las parejas" (build item 1, match authoring)', () => {
  it('renders the minimal Pregunta/Respuesta pair editor instead of the Básico question-card list', () => {
    render(<MatchHarness initialPayload={EMPTY_PAYLOAD} />);
    expect(screen.getByTestId('match-pairs-editor-b1')).toBeTruthy();
    expect(screen.queryByTestId('quiz-empty-b1')).toBeNull();
    expect(screen.queryByTestId('question-card-s1')).toBeNull();
  });

  it('shows the "add at least 3 pairs" hint until there are 3 complete pairs', () => {
    const payload: Payload = {
      pools: {},
      slots: [
        { id: 's1', label: 'dog', input: 'text', answer: ['perro'] },
        { id: 's2', label: 'cat', input: 'text', answer: ['gato'] },
      ],
      blocks: [
        { kind: 'row', id: 'row-s1', slotId: 's1' },
        { kind: 'row', id: 'row-s2', slotId: 's2' },
      ],
    };
    render(<MatchHarness initialPayload={payload} />);
    expect(screen.getByTestId('match-pairs-hint-b1').textContent).toContain('Agrega al menos 3 parejas');
  });

  it('hides the hint once there are 3 complete pairs', () => {
    const payload: Payload = {
      pools: {},
      slots: [
        { id: 's1', label: 'dog', input: 'text', answer: ['perro'] },
        { id: 's2', label: 'cat', input: 'text', answer: ['gato'] },
        { id: 's3', label: 'bird', input: 'text', answer: ['pájaro'] },
      ],
      blocks: [
        { kind: 'row', id: 'row-s1', slotId: 's1' },
        { kind: 'row', id: 'row-s2', slotId: 's2' },
        { kind: 'row', id: 'row-s3', slotId: 's3' },
      ],
    };
    render(<MatchHarness initialPayload={payload} />);
    expect(screen.queryByTestId('match-pairs-hint-b1')).toBeNull();
  });

  it('"+ Agregar pareja" adds a new row+slot (same storage addQuestion already writes)', () => {
    render(<MatchHarness initialPayload={EMPTY_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('match-add-pair-b1'));
    expect(screen.getAllByTestId(/^match-pair-question-/)).toHaveLength(1);
  });

  it('Enter in the answer field adds another pair and focuses its question field', () => {
    render(<MatchHarness initialPayload={EMPTY_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('match-add-pair-b1'));
    const [questionInput] = screen.getAllByTestId(/^match-pair-question-/) as HTMLInputElement[];
    const [answerInput] = screen.getAllByTestId(/^match-pair-answer-/) as HTMLInputElement[];
    fireEvent.change(questionInput, { target: { value: 'dog' } });
    fireEvent.change(answerInput, { target: { value: 'perro' } });
    fireEvent.keyDown(answerInput, { key: 'Enter' });

    const questionInputs = screen.getAllByTestId(/^match-pair-question-/) as HTMLInputElement[];
    expect(questionInputs).toHaveLength(2);
    expect(document.activeElement).toBe(questionInputs[1]);
  });

  it('removing a pair ("×") deletes exactly its own row+slot', () => {
    const payload: Payload = {
      pools: {},
      slots: [
        { id: 's1', label: 'dog', input: 'text', answer: ['perro'] },
        { id: 's2', label: 'cat', input: 'text', answer: ['gato'] },
      ],
      blocks: [
        { kind: 'row', id: 'row-s1', slotId: 's1' },
        { kind: 'row', id: 'row-s2', slotId: 's2' },
      ],
    };
    render(<MatchHarness initialPayload={payload} />);
    fireEvent.click(screen.getByTestId('match-pair-remove-s1'));
    expect(screen.queryByTestId('match-pair-s1')).toBeNull();
    expect(screen.getByTestId('match-pair-s2')).toBeTruthy();
  });

  it('typing a question/answer commits back through onPayloadChange', () => {
    const payload: Payload = {
      pools: {},
      slots: [{ id: 's1', label: '', input: 'text', answer: [] }],
      blocks: [{ kind: 'row', id: 'row-s1', slotId: 's1' }],
    };
    render(<MatchHarness initialPayload={payload} />);
    fireEvent.change(screen.getByTestId('match-pair-question-s1'), { target: { value: 'dog' } });
    fireEvent.change(screen.getByTestId('match-pair-answer-s1'), { target: { value: 'perro' } });
    expect((screen.getByTestId('match-pair-question-s1') as HTMLInputElement).value).toBe('dog');
    expect((screen.getByTestId('match-pair-answer-s1') as HTMLInputElement).value).toBe('perro');
  });
});

describe('QuizBlockEditor — "Reordenar" (sentence authoring)', () => {
  it('renders the minimal sentence-list editor instead of the Básico question-card list', () => {
    render(<ReorderHarness initialPayload={EMPTY_PAYLOAD} />);
    expect(screen.getByTestId('reorder-editor-b1')).toBeTruthy();
    expect(screen.queryByTestId('quiz-empty-b1')).toBeNull();
    expect(screen.queryByTestId('question-card-s1')).toBeNull();
  });

  it('shows the "add at least one sentence" hint until a sentence has >= 2 words', () => {
    render(<ReorderHarness initialPayload={EMPTY_PAYLOAD} />);
    expect(screen.getByTestId('reorder-hint-b1').textContent).toContain('Agrega al menos una oración');
  });

  it('hides the hint once a sentence has >= 2 words', () => {
    const payload: Payload = {
      pools: {},
      slots: [{ id: 's1', label: 'Cats sleep', input: 'text', answer: ['Cats sleep'] }],
      blocks: [{ kind: 'row', id: 'row-s1', slotId: 's1' }],
    };
    render(<ReorderHarness initialPayload={payload} />);
    expect(screen.queryByTestId('reorder-hint-b1')).toBeNull();
  });

  it('"+ Agregar oración" adds a new row+slot', () => {
    render(<ReorderHarness initialPayload={EMPTY_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('reorder-add-b1'));
    expect(screen.getAllByTestId(/^reorder-sentence-/)).toHaveLength(1);
  });

  it('Enter in a sentence field adds another one and focuses it', () => {
    render(<ReorderHarness initialPayload={EMPTY_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('reorder-add-b1'));
    const [sentenceInput] = screen.getAllByTestId(/^reorder-sentence-/) as HTMLInputElement[];
    fireEvent.change(sentenceInput, { target: { value: 'Cats sleep' } });
    fireEvent.keyDown(sentenceInput, { key: 'Enter' });

    const sentenceInputs = screen.getAllByTestId(/^reorder-sentence-/) as HTMLInputElement[];
    expect(sentenceInputs).toHaveLength(2);
    expect(document.activeElement).toBe(sentenceInputs[1]);
  });

  it('removing a sentence ("×") deletes exactly its own row+slot', () => {
    const payload: Payload = {
      pools: {},
      slots: [
        { id: 's1', label: 'Cats sleep', input: 'text', answer: ['Cats sleep'] },
        { id: 's2', label: 'Dogs bark', input: 'text', answer: ['Dogs bark'] },
      ],
      blocks: [
        { kind: 'row', id: 'row-s1', slotId: 's1' },
        { kind: 'row', id: 'row-s2', slotId: 's2' },
      ],
    };
    render(<ReorderHarness initialPayload={payload} />);
    fireEvent.click(screen.getByTestId('reorder-remove-s1'));
    expect(screen.queryByTestId('reorder-row-s1')).toBeNull();
    expect(screen.getByTestId('reorder-row-s2')).toBeTruthy();
  });

  it('typing a sentence commits BOTH the slot label and its answer back through onPayloadChange', () => {
    const payload: Payload = {
      pools: {},
      slots: [{ id: 's1', label: '', input: 'text', answer: [] }],
      blocks: [{ kind: 'row', id: 'row-s1', slotId: 's1' }],
    };
    render(<ReorderHarness initialPayload={payload} />);
    fireEvent.change(screen.getByTestId('reorder-sentence-s1'), { target: { value: 'Cats sleep' } });
    expect((screen.getByTestId('reorder-sentence-s1') as HTMLInputElement).value).toBe('Cats sleep');
  });
});

describe('QuizBlockEditor — "Completar la frase" (cloze authoring)', () => {
  it('renders the bracket-sentence editor instead of the Básico question-card list', () => {
    render(<ClozeHarness initialPayload={EMPTY_PAYLOAD} />);
    expect(screen.getByTestId('cloze-editor-b1')).toBeTruthy();
    expect(screen.queryByTestId('quiz-empty-b1')).toBeNull();
    expect(screen.queryByTestId('question-card-s1')).toBeNull();
  });

  it('shows the "add at least one sentence" hint until a sentence has >= 1 blank', () => {
    render(<ClozeHarness initialPayload={EMPTY_PAYLOAD} />);
    expect(screen.getByTestId('cloze-hint-b1').textContent).toContain('Agrega al menos una frase');
  });

  it('"+ Agregar frase" adds a new, bracket-less sentence row', () => {
    render(<ClozeHarness initialPayload={EMPTY_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('cloze-add-b1'));
    expect(screen.getAllByTestId(/^cloze-sentence-/)).toHaveLength(1);
  });

  it('typing a bracketed sentence commits one drop slot per blank and hides the hint', () => {
    render(<ClozeHarness initialPayload={EMPTY_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('cloze-add-b1'));
    const [sentenceInput] = screen.getAllByTestId(/^cloze-sentence-/) as HTMLInputElement[];
    fireEvent.change(sentenceInput, { target: { value: 'I [was] travelling when I [received] a phone call.' } });

    expect(screen.queryByTestId('cloze-hint-b1')).toBeNull();
    expect((sentenceInput as HTMLInputElement).value).toBe(
      'I [was] travelling when I [received] a phone call.',
    );
  });

  it('Enter in a sentence field adds another one and focuses it', () => {
    render(<ClozeHarness initialPayload={EMPTY_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('cloze-add-b1'));
    const [sentenceInput] = screen.getAllByTestId(/^cloze-sentence-/) as HTMLInputElement[];
    fireEvent.change(sentenceInput, { target: { value: 'She [goes] to school.' } });
    fireEvent.keyDown(sentenceInput, { key: 'Enter' });

    const sentenceInputs = screen.getAllByTestId(/^cloze-sentence-/) as HTMLInputElement[];
    expect(sentenceInputs).toHaveLength(2);
    expect(document.activeElement).toBe(sentenceInputs[1]);
  });

  it('removing a sentence ("×") deletes exactly its own rows/slots/pool items', () => {
    render(<ClozeHarness initialPayload={EMPTY_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('cloze-add-b1'));
    fireEvent.change(screen.getAllByTestId(/^cloze-sentence-/)[0]!, {
      target: { value: 'She [goes] to school.' },
    });
    fireEvent.click(screen.getByTestId('cloze-add-b1'));
    fireEvent.change(screen.getAllByTestId(/^cloze-sentence-/)[1]!, {
      target: { value: 'They [have] arrived.' },
    });

    fireEvent.click(screen.getByTestId('cloze-remove-0'));
    const remaining = screen.getAllByTestId(/^cloze-sentence-/) as HTMLInputElement[];
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.value).toBe('They [have] arrived.');
  });

  it('round-trips a reloaded multi-blank sentence back into the bracket textbox', () => {
    const payload: Payload = {
      pools: { 'b1-cloze-pool': [{ id: 'w1', text: 'was' }, { id: 'w2', text: 'received' }] },
      slots: [
        { id: 'slot-a', label: 'I ___ travelling when I received a phone call.', input: 'drop', pool: 'b1-cloze-pool', answer: ['w1'] },
        { id: 'slot-b', label: 'I was travelling when I ___ a phone call.', input: 'drop', pool: 'b1-cloze-pool', answer: ['w2'] },
      ],
      blocks: [
        { kind: 'row', id: 'row-cz-s0-b0-1', slotId: 'slot-a' },
        { kind: 'row', id: 'row-cz-s0-b1-2', slotId: 'slot-b' },
      ],
    };
    render(<ClozeHarness initialPayload={payload} />);
    expect((screen.getByTestId('cloze-sentence-0') as HTMLInputElement).value).toBe(
      'I [was] travelling when I [received] a phone call.',
    );
  });

  it('the "Palabras extra (distractores)" field commits/reads back unclaimed pool items', () => {
    const payload: Payload = {
      pools: { 'b1-cloze-pool': [{ id: 'w1', text: 'goes' }] },
      slots: [{ id: 'slot-a', label: 'She ___ to school.', input: 'drop', pool: 'b1-cloze-pool', answer: ['w1'] }],
      blocks: [{ kind: 'row', id: 'row-cz-s0-b0-1', slotId: 'slot-a' }],
    };
    render(<ClozeHarness initialPayload={payload} />);
    fireEvent.change(screen.getByTestId('cloze-distractors-b1'), { target: { value: 'is, went' } });
    expect((screen.getByTestId('cloze-distractors-b1') as HTMLInputElement).value).toBe('is, went');
  });
});

describe('QuizBlockEditor — "Ordenar por grupos" (groupsort authoring)', () => {
  it('renders the group editor instead of the Básico question-card list', () => {
    render(<GroupSortHarness initialPayload={EMPTY_PAYLOAD} />);
    expect(screen.getByTestId('groupsort-editor-b1')).toBeTruthy();
    expect(screen.queryByTestId('quiz-empty-b1')).toBeNull();
    expect(screen.queryByTestId('question-card-s1')).toBeNull();
  });

  it('shows the "add at least 2 groups" hint until reached', () => {
    render(<GroupSortHarness initialPayload={EMPTY_PAYLOAD} />);
    expect(screen.getByTestId('groupsort-min-groups-hint-b1').textContent).toContain('Agrega al menos 2 grupos');
  });

  it('"+ Agregar grupo" adds a new, empty group row', () => {
    render(<GroupSortHarness initialPayload={EMPTY_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('groupsort-add-b1'));
    expect(screen.getAllByTestId(/^groupsort-name-/)).toHaveLength(1);
  });

  it('typing a group name commits it back through onPayloadChange', () => {
    render(<GroupSortHarness initialPayload={EMPTY_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('groupsort-add-b1'));
    const [nameInput] = screen.getAllByTestId(/^groupsort-name-/) as HTMLInputElement[];
    fireEvent.change(nameInput, { target: { value: 'Animals' } });
    expect((nameInput as HTMLInputElement).value).toBe('Animals');
  });

  it('Enter in the item field adds a chip and clears the field, without adding a new group', () => {
    render(<GroupSortHarness initialPayload={EMPTY_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('groupsort-add-b1'));
    const slotId = screen.getAllByTestId(/^groupsort-name-/)[0]!.getAttribute('data-testid')!.replace('groupsort-name-', '');
    const itemInput = screen.getByTestId(`groupsort-item-input-${slotId}`) as HTMLInputElement;

    fireEvent.change(itemInput, { target: { value: 'dog' } });
    fireEvent.keyDown(itemInput, { key: 'Enter' });

    const chips = within(screen.getByTestId(`groupsort-items-${slotId}`)).getAllByTestId(/^groupsort-item-/);
    expect(chips).toHaveLength(1);
    expect(chips[0]!.textContent).toContain('dog');
    expect(itemInput.value).toBe('');
    expect(screen.getAllByTestId(/^groupsort-name-/)).toHaveLength(1);
  });

  it('a comma-separated paste adds several items in one go', () => {
    render(<GroupSortHarness initialPayload={EMPTY_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('groupsort-add-b1'));
    const slotId = screen.getAllByTestId(/^groupsort-name-/)[0]!.getAttribute('data-testid')!.replace('groupsort-name-', '');
    const itemInput = screen.getByTestId(`groupsort-item-input-${slotId}`) as HTMLInputElement;

    fireEvent.change(itemInput, { target: { value: 'dog, cat, horse' } });
    fireEvent.keyDown(itemInput, { key: 'Enter' });

    const chips = within(screen.getByTestId(`groupsort-items-${slotId}`)).getAllByTestId(/^groupsort-item-/);
    expect(chips.map((c) => c.textContent?.trim())).toEqual([
      expect.stringContaining('dog'),
      expect.stringContaining('cat'),
      expect.stringContaining('horse'),
    ]);
  });

  it('shows the "add at least 2 items" hint per group until reached, hiding once satisfied', () => {
    render(<GroupSortHarness initialPayload={EMPTY_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('groupsort-add-b1'));
    const slotId = screen.getAllByTestId(/^groupsort-name-/)[0]!.getAttribute('data-testid')!.replace('groupsort-name-', '');
    expect(screen.getByTestId(`groupsort-min-items-hint-${slotId}`)).toBeTruthy();

    const itemInput = screen.getByTestId(`groupsort-item-input-${slotId}`) as HTMLInputElement;
    fireEvent.change(itemInput, { target: { value: 'dog, cat' } });
    fireEvent.keyDown(itemInput, { key: 'Enter' });

    expect(screen.queryByTestId(`groupsort-min-items-hint-${slotId}`)).toBeNull();
  });

  it('removing an item chip ("×") removes exactly that item', () => {
    render(<GroupSortHarness initialPayload={EMPTY_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('groupsort-add-b1'));
    const slotId = screen.getAllByTestId(/^groupsort-name-/)[0]!.getAttribute('data-testid')!.replace('groupsort-name-', '');
    const itemInput = screen.getByTestId(`groupsort-item-input-${slotId}`) as HTMLInputElement;
    fireEvent.change(itemInput, { target: { value: 'dog, cat' } });
    fireEvent.keyDown(itemInput, { key: 'Enter' });

    const itemsContainer = screen.getByTestId(`groupsort-items-${slotId}`);
    const [dogChip] = within(itemsContainer).getAllByTestId(/^groupsort-item-/);
    const removeButton = dogChip!.querySelector('button')!;
    fireEvent.click(removeButton);

    const remaining = within(itemsContainer).getAllByTestId(/^groupsort-item-/);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.textContent).toContain('cat');
  });

  it('removing a group ("Quitar este grupo") deletes its row, slot, and items', () => {
    render(<GroupSortHarness initialPayload={EMPTY_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('groupsort-add-b1'));
    fireEvent.click(screen.getByTestId('groupsort-add-b1'));
    expect(screen.getAllByTestId(/^groupsort-name-/)).toHaveLength(2);

    const [firstSlot] = screen.getAllByTestId(/^groupsort-name-/).map((n) => n.getAttribute('data-testid')!.replace('groupsort-name-', ''));
    fireEvent.click(screen.getByTestId(`groupsort-remove-group-${firstSlot}`));

    expect(screen.getAllByTestId(/^groupsort-name-/)).toHaveLength(1);
  });

  it('stops offering "+ Agregar grupo" once 4 groups exist, showing the max-groups hint instead', () => {
    render(<GroupSortHarness initialPayload={EMPTY_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('groupsort-add-b1'));
    fireEvent.click(screen.getByTestId('groupsort-add-b1'));
    fireEvent.click(screen.getByTestId('groupsort-add-b1'));
    fireEvent.click(screen.getByTestId('groupsort-add-b1'));

    expect(screen.getAllByTestId(/^groupsort-name-/)).toHaveLength(4);
    expect(screen.queryByTestId('groupsort-add-b1')).toBeNull();
    expect(screen.getByTestId('groupsort-max-groups-hint-b1')).toBeTruthy();
  });

  it('round-trips a reloaded groupsort payload back into named groups with their items', () => {
    const payload: Payload = {
      pools: {
        'b1-groupsort-pool': [
          { id: 'i1', text: 'dog' },
          { id: 'i2', text: 'cat' },
          { id: 'i3', text: 'bread' },
          { id: 'i4', text: 'rice' },
        ],
      },
      slots: [
        { id: 'g1', label: 'Animals', input: 'group', pool: 'b1-groupsort-pool', answer: ['i1', 'i2'] },
        { id: 'g2', label: 'Food', input: 'group', pool: 'b1-groupsort-pool', answer: ['i3', 'i4'] },
      ],
      blocks: [
        { kind: 'row', id: 'row-g1', slotId: 'g1' },
        { kind: 'row', id: 'row-g2', slotId: 'g2' },
      ],
    };
    render(<GroupSortHarness initialPayload={payload} />);

    expect((screen.getByTestId('groupsort-name-g1') as HTMLInputElement).value).toBe('Animals');
    expect((screen.getByTestId('groupsort-name-g2') as HTMLInputElement).value).toBe('Food');
    expect(screen.getByTestId('groupsort-item-i1').textContent).toContain('dog');
    expect(screen.getByTestId('groupsort-item-i4').textContent).toContain('rice');
    expect(screen.queryByTestId('groupsort-min-groups-hint-b1')).toBeNull();
  });
});
