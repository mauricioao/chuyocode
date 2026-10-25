// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within, act } from '@testing-library/react';
import { useState } from 'react';
import { renderThenHydrate } from '@/testSupport/hydrationHarness';
import QuizBlockEditor from './QuizBlockEditor';
import ChangeMoldDialog from './ChangeMoldDialog';
import type { Payload } from '@/lib/exercisePayload';
import type { QuizBlock, PromptImageRef } from '@/lib/activities/blocks';

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

/** Same harness, but also wiring `promptImages`/`imagesEnabled` — the question-image-carrying half of `BlockList.tsx`'s own real mount, needed only by tests that touch a question's own context image (owner decision 2026-10-16 follow-up). `onPayloadChange` now always reports payload AND promptImages together (lost-update fix) — see that prop's own header in `QuizBlockEditor.tsx`. */
function PromptImagesHarness({
  initialPayload,
  initialPromptImages,
}: {
  initialPayload: Payload;
  initialPromptImages?: Record<string, PromptImageRef>;
}) {
  const [payload, setPayload] = useState<Payload>(initialPayload);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [promptImages, setPromptImages] = useState<Record<string, PromptImageRef> | undefined>(
    initialPromptImages,
  );
  return (
    <QuizBlockEditor
      blockId="b1"
      lang="es"
      payload={payload}
      selectedSlotId={selectedSlotId}
      onSelectSlot={setSelectedSlotId}
      onPayloadChange={(nextPayload, nextPromptImages) => {
        setPayload(nextPayload);
        setPromptImages(nextPromptImages);
      }}
      promptImages={promptImages}
      imagesEnabled
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

const MATCH_NO_REPEAT_PAYLOAD: Payload = {
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

const BASIC_CHOICE_PAYLOAD: Payload = {
  pools: { p1: [{ id: 'o1', text: 'Paris' }, { id: 'o2', text: 'Berlin' }, { id: 'o3', text: 'Rome' }] },
  slots: [{ id: 's1', label: 'Capital of France', input: 'choice', pool: 'p1', answer: ['o1'] }],
  blocks: [{ kind: 'row', id: 'row-s1', slotId: 's1' }],
};

/** One choice question (2 distractors dropped) AND one text question with an extra accepted answer (1 dropped) — "two kinds at once". */
const BASIC_MIXED_PAYLOAD: Payload = {
  pools: { p1: [{ id: 'o1', text: 'Paris' }, { id: 'o2', text: 'Berlin' }, { id: 'o3', text: 'Rome' }] },
  slots: [
    { id: 's1', label: 'Capital of France', input: 'choice', pool: 'p1', answer: ['o1'] },
    { id: 's2', label: 'Capital of Spain', input: 'text', answer: ['Madrid', 'madrid'] },
  ],
  blocks: [
    { kind: 'row', id: 'row-s1', slotId: 's1' },
    { kind: 'row', id: 'row-s2', slotId: 's2' },
  ],
};

/** A `select`-mechanic gap question — a shape the simple row cannot show at all (R3's own per-row escape). */
const GAP_PAYLOAD: Payload = {
  pools: { p1: [{ id: 'w1', text: 'was' }, { id: 'w2', text: 'were' }] },
  slots: [{ id: 's1', label: 'I ___ happy', input: 'select', pool: 'p1', answer: ['w1'] }],
};

describe('QuizBlockEditor — Varios juegos: empty state (ghost example row, R3)', () => {
  it('shows one editable ghost row with teaching placeholders, no list or checklist', () => {
    render(<Harness initialPayload={EMPTY_PAYLOAD} />);
    expect(screen.getByTestId('varios-example-b1')).toBeTruthy();
    expect(screen.queryByTestId('quiz-question-list-b1')).toBeNull();
    expect(screen.queryByTestId('quiz-checklist-b1')).toBeNull();

    const question = screen.getByTestId('varios-example-question-b1') as HTMLInputElement;
    const answer = screen.getByTestId('varios-example-answer-b1') as HTMLInputElement;
    expect(question.placeholder).toBe('¿De qué color es el cielo?');
    expect(answer.placeholder).toBe('azul');
  });

  it('typing into the ghost question field creates the first real row', () => {
    render(<Harness initialPayload={EMPTY_PAYLOAD} />);
    fireEvent.change(screen.getByTestId('varios-example-question-b1'), {
      target: { value: 'What color is the sky?' },
    });
    expect(screen.getByTestId('quiz-question-list-b1')).toBeTruthy();
    const questionFields = screen.getAllByTestId(/^varios-question-/);
    expect(questionFields).toHaveLength(1);
    expect((questionFields[0] as HTMLInputElement).value).toBe('What color is the sky?');
  });

  it('typing into the ghost answer field creates the first real row too', () => {
    render(<Harness initialPayload={EMPTY_PAYLOAD} />);
    fireEvent.change(screen.getByTestId('varios-example-answer-b1'), { target: { value: 'blue' } });
    const answerFields = screen.getAllByTestId(/^varios-answer-/);
    expect(answerFields).toHaveLength(1);
    expect((answerFields[0] as HTMLInputElement).value).toBe('blue');
  });
});

describe('QuizBlockEditor — Varios juegos: adding a question', () => {
  it('"Agregar pregunta" adds another row once at least one exists', () => {
    render(<Harness initialPayload={ONE_QUESTION_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('add-question-b1'));
    expect(screen.getAllByTestId(/^varios-row-/)).toHaveLength(2);
  });

  it('Ctrl+Enter anywhere inside the block adds the next question', () => {
    render(<Harness initialPayload={ONE_QUESTION_PAYLOAD} />);
    fireEvent.keyDown(screen.getByTestId('varios-question-s1'), { key: 'Enter', ctrlKey: true });
    expect(screen.getAllByTestId(/^varios-row-/)).toHaveLength(2);
  });
});

describe('QuizBlockEditor — Varios juegos: editing a plain text question (round-trips to the same shape)', () => {
  it('updates the question text directly on the row', () => {
    render(<Harness initialPayload={ONE_QUESTION_PAYLOAD} />);
    fireEvent.change(screen.getByTestId('varios-question-s1'), { target: { value: 'The dog ___ on the rug' } });
    expect((screen.getByTestId('varios-question-s1') as HTMLInputElement).value).toBe('The dog ___ on the rug');
  });

  it('updates the answer directly, keeping it a single-answer text question', () => {
    const onPayloadChange = vi.fn();
    render(
      <QuizBlockEditor
        blockId="b1"
        lang="es"
        payload={ONE_QUESTION_PAYLOAD}
        selectedSlotId={null}
        onSelectSlot={() => {}}
        onPayloadChange={onPayloadChange}
      />,
    );
    fireEvent.change(screen.getByTestId('varios-answer-s1'), { target: { value: 'sat' } });
    const payload = onPayloadChange.mock.calls[0]![0] as Payload;
    expect(payload.slots[0]).toMatchObject({ id: 's1', input: 'text', answer: ['sat'] });
  });
});

describe('QuizBlockEditor — Varios juegos: "Agregar opciones" toggles a row into multiple choice, and back', () => {
  it('reveals one option chip, already marked correct, preserving the text answer (changeQuestionSegment)', () => {
    render(<Harness initialPayload={ONE_QUESTION_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('varios-add-options-s1'));
    const options = screen.getByTestId('varios-options-s1').querySelectorAll('[data-testid^="varios-option-text-"]');
    expect(options).toHaveLength(1);
    expect((options[0] as HTMLInputElement).value).toBe('sits');
  });

  it('adds another option via "+ Agregar opción"', () => {
    render(<Harness initialPayload={ONE_QUESTION_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('varios-add-options-s1'));
    fireEvent.click(screen.getByTestId('varios-option-add-s1'));
    const options = screen.getByTestId('varios-options-s1').querySelectorAll('[data-testid^="varios-option-text-"]');
    expect(options).toHaveLength(2);
  });

  it('shows the already-marked-correct option for an existing choice question', () => {
    render(<Harness initialPayload={BASIC_CHOICE_PAYLOAD} />);
    expect(screen.getByTestId('varios-option-correct-s1-o1')).toHaveProperty('checked', true);
  });

  it('"Quitar opciones" switches back to a plain text answer, keeping the correct option\'s text', () => {
    render(<Harness initialPayload={BASIC_CHOICE_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('varios-remove-options-s1'));
    expect((screen.getByTestId('varios-answer-s1') as HTMLInputElement).value).toBe('Paris');
  });
});

describe('QuizBlockEditor — Varios juegos: per-row "Editor avanzado" escape — shapes the simple row cannot show', () => {
  it('a question with more than one accepted text answer opens automatically in the old card', () => {
    render(<Harness initialPayload={BASIC_MIXED_PAYLOAD} />);
    // s1 (choice) stays a simple row; s2 (2 accepted answers) escapes automatically.
    expect(screen.getByTestId('varios-question-s1')).toBeTruthy();
    expect(screen.queryByTestId('varios-answer-s2')).toBeNull();
    expect(screen.getByTestId('question-card-s2')).toBeTruthy();
    expect(screen.queryByTestId('varios-advanced-toggle-s2')).toBeNull(); // forced open: no manual close
  });

  it('a gap (select/drop) question opens automatically too, fully editable', () => {
    render(<Harness initialPayload={GAP_PAYLOAD} />);
    expect(screen.getByTestId('question-card-s1')).toBeTruthy();
    expect(screen.getByTestId('question-type-s1-gap').getAttribute('aria-checked')).toBe('true');
  });

  it('every row can voluntarily open "Editor avanzado", and close it again when the shape allows', () => {
    render(<Harness initialPayload={ONE_QUESTION_PAYLOAD} />);
    expect(screen.queryByTestId('question-card-s1')).toBeNull();
    fireEvent.click(screen.getByTestId('varios-advanced-toggle-s1'));
    expect(screen.getByTestId('question-card-s1')).toBeTruthy();
    fireEvent.click(screen.getByTestId('varios-advanced-toggle-s1'));
    expect(screen.queryByTestId('question-card-s1')).toBeNull();
    expect(screen.getByTestId('varios-question-s1')).toBeTruthy();
  });
});

describe('QuizBlockEditor — Varios juegos: explanation (D5, "¿Por qué?") via the advanced editor', () => {
  it('is reachable from the simple row only through "Editor avanzado"', () => {
    render(<Harness initialPayload={ONE_QUESTION_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('varios-advanced-toggle-s1'));
    fireEvent.click(screen.getByTestId('question-more-options-s1'));
    const input = screen.getByTestId('question-explanation-s1') as HTMLTextAreaElement;
    expect(input.value).toBe('');
    fireEvent.change(input, { target: { value: 'Third person -s.' } });
    expect((screen.getByTestId('question-explanation-s1') as HTMLTextAreaElement).value).toBe('Third person -s.');
  });
});

describe('QuizBlockEditor — Varios juegos: duplicating a question (advanced editor)', () => {
  it('inserts a copy right after the original, with a fresh pool for pooled types — the copy stays a simple row', () => {
    render(<Harness initialPayload={BASIC_CHOICE_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('varios-advanced-toggle-s1'));
    fireEvent.click(screen.getByTestId('question-duplicate-s1'));

    expect(screen.getAllByTestId(/^varios-row-/)).toHaveLength(2);
    // The original (still manually advanced) is the only `QuestionCard` — the
    // duplicate is `choice` too, which the simple row shows directly.
    expect(screen.getAllByTestId(/^question-card-/)).toHaveLength(1);
  });

  it("carries the original question's own context image to the duplicate — same stored path, no new upload (owner decision 2026-10-16 follow-up)", () => {
    const image: PromptImageRef = { path: 'activity-images/act-1/question-img.webp', width: 400, height: 300 };
    render(<PromptImagesHarness initialPayload={ONE_QUESTION_PAYLOAD} initialPromptImages={{ s1: image }} />);

    fireEvent.click(screen.getByTestId('varios-advanced-toggle-s1'));
    fireEvent.click(screen.getByTestId('question-duplicate-s1'));

    const rows = screen.getAllByTestId(/^varios-row-/);
    expect(rows).toHaveLength(2);
    const newSlotId = rows
      .map((row) => row.getAttribute('data-testid')!.replace('varios-row-', ''))
      .find((id) => id !== 's1')!;
    expect(newSlotId).toBeTruthy();

    // The duplicate stays a plain row (no advanced editor forced on it), so
    // its own `QuestionImageField` thumbnail is reachable directly — same
    // `path` as the original, never a freshly uploaded one.
    const thumb = screen.getByTestId(`varios-question-image-thumb-${newSlotId}`);
    expect(thumb.getAttribute('src')).toContain(encodeURIComponent(image.path));
  });
});

describe('QuizBlockEditor — Varios juegos: removing a question', () => {
  it('removes the question and clears its selection, returning to the empty ghost row', () => {
    render(<Harness initialPayload={ONE_QUESTION_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('varios-remove-s1'));
    expect(screen.getByTestId('varios-example-b1')).toBeTruthy();
    expect(screen.queryByTestId('varios-row-s1')).toBeNull();
  });
});

describe('QuizBlockEditor — Varios juegos: paste a whole list (N5, reuses parseMatchPairsPaste)', () => {
  it('pasting into the empty ghost row yields one question per line, in one onPayloadChange call', () => {
    const onPayloadChange = vi.fn();
    render(
      <QuizBlockEditor
        blockId="b1"
        lang="es"
        payload={EMPTY_PAYLOAD}
        selectedSlotId={null}
        onSelectSlot={() => {}}
        onPayloadChange={onPayloadChange}
      />,
    );
    paste(screen.getByTestId('varios-example-question-b1'), 'dog = perro\ncat = gato');
    expect(onPayloadChange).toHaveBeenCalledTimes(1);
    const payload = onPayloadChange.mock.calls[0]![0] as Payload;
    expect(payload.slots.map((s) => s.label)).toEqual(['dog', 'cat']);
    expect(payload.slots.map((s) => s.answer)).toEqual([['perro'], ['gato']]);
  });

  it("pasting into an existing row's question field adds rows right after it", () => {
    render(<Harness initialPayload={ONE_QUESTION_PAYLOAD} />);
    paste(screen.getByTestId('varios-question-s1'), 'dog = perro\ncat = gato');
    expect(screen.getAllByTestId(/^varios-row-/)).toHaveLength(3);
  });

  it('shows "Se agregaron N preguntas" right after a paste, reverting on the next edit', () => {
    render(<Harness initialPayload={EMPTY_PAYLOAD} />);
    paste(screen.getByTestId('varios-example-question-b1'), 'dog = perro\ncat = gato');
    expect(screen.getByTestId('quiz-paste-feedback-b1').textContent).toBe('Se agregaron 2 preguntas');

    const questionField = screen.getAllByTestId(/^varios-question-/)[0]!;
    fireEvent.change(questionField, { target: { value: 'updated' } });
    expect(screen.queryByTestId('quiz-paste-feedback-b1')).toBeNull();
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
    const questionInputs = screen.getAllByTestId(/^varios-question-/) as HTMLInputElement[];
    expect(questionInputs[0]?.value).toBe('First');
    expect(questionInputs[1]?.value).toBe('Second');

    const handles = screen.getAllByLabelText('Reordenar pregunta', { selector: 'button' });
    expect(handles).toHaveLength(2);
    expect(handles.every((h) => h.getAttribute('tabindex') === '0')).toBe(true);
  });
});

describe('QuizBlockEditor — checklist / unlock status line (R3)', () => {
  it('shows the unlock status line once every question already has an answer', () => {
    render(<Harness initialPayload={ONE_QUESTION_PAYLOAD} />);
    const status = screen.getByTestId('quiz-unlock-status-b1');
    expect(status.textContent).toContain('Listo para jugar');
    expect(status.textContent).toContain('1 pregunta');
  });

  it('lists an incomplete question and jumps to it on click', () => {
    render(<Harness initialPayload={TWO_QUESTION_PAYLOAD} />);
    const item = screen.getByTestId('quiz-checklist-item-b1-s2');
    expect(item.textContent).toContain('Pregunta 2');
    fireEvent.click(item);
    const highlighted = screen.getByTestId('varios-row-s2').querySelector('[data-highlighted="true"]');
    expect(highlighted).toBeTruthy();
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
  // `QuizLivePreview`'s own floating Comprobar (build item 5), which
  // clears that same toolbar on its own. The column now runs edge to
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

describe('QuizBlockEditor — hydration', () => {
  it('does not report a recoverable hydration error for a single simple row', async () => {
    const { recoverableErrors, consoleErrors } = await renderThenHydrate(() => (
      <Harness initialPayload={ONE_QUESTION_PAYLOAD} />
    ));
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

  it('shows the "complete at least one pair" hint while no pair has an answer', () => {
    const payload: Payload = {
      pools: {},
      slots: [{ id: 's1', label: 'dog', input: 'text', answer: [] }],
      blocks: [{ kind: 'row', id: 'row-s1', slotId: 's1' }],
    };
    render(<MatchHarness initialPayload={payload} />);
    expect(screen.getByTestId('match-pairs-hint-b1').textContent).toBe(
      'Completa al menos una pareja para ver el juego',
    );
  });

  // The board is already playable with fewer than 3 answered pairs (any
  // answer, no duplicates), so the READY line shows — a calmer, muted tip
  // nudges towards 3+ instead of an amber "not ready" hint (readiness never
  // contradicts the preview).
  it('is ready with fewer than 3 pairs, showing a muted tip instead of the amber hint', () => {
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
    expect(screen.getByTestId('match-pairs-ready-b1').textContent).toBe('Listo para jugar · 2 parejas');
    expect(screen.queryByTestId('match-pairs-hint-b1')).toBeNull();
    expect(screen.getByTestId('match-pairs-tip-b1').textContent).toBe(
      'Con 3 parejas o más, el juego es más retador.',
    );
  });

  it('hides the tip once there are 3 or more pairs', () => {
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
    expect(screen.queryByTestId('match-pairs-tip-b1')).toBeNull();
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

  // The hint is now gated on `playable` — the SAME debounced payload the
  // live preview itself reads — so it only hides once that 300ms debounce
  // catches up with the keystroke, never synchronously with it.
  it('typing a bracketed sentence commits one drop slot per blank and hides the hint once the debounce catches up', () => {
    vi.useFakeTimers();
    try {
      render(<ClozeHarness initialPayload={EMPTY_PAYLOAD} />);
      fireEvent.click(screen.getByTestId('cloze-add-b1'));
      const [sentenceInput] = screen.getAllByTestId(/^cloze-sentence-/) as HTMLInputElement[];
      fireEvent.change(sentenceInput, { target: { value: 'I [was] travelling when I [received] a phone call.' } });

      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(screen.queryByTestId('cloze-hint-b1')).toBeNull();
      expect((sentenceInput as HTMLInputElement).value).toBe(
        'I [was] travelling when I [received] a phone call.',
      );
    } finally {
      vi.useRealTimers();
    }
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

  // Bug S0 (owner audit, `PROPUESTA-PLANTILLAS-2026-10-23.md` §e): a
  // duplicated/copied block keeps its payload's own `slot.pool` name from
  // wherever it came from, but this file used to re-derive the pool name
  // from ONLY the current `blockId` (`${blockId}-cloze-pool`) — the instant
  // that disagrees with what the content actually stored, every lookup
  // keyed by the wrong name comes back empty.
  it('shows existing distractor chips (not nothing) when the payload\'s own pool name does not match the "${blockId}-cloze-pool" convention', () => {
    const payload: Payload = {
      pools: {
        'old-block-cloze-pool': [
          { id: 'w1', text: 'goes' },
          { id: 'w2', text: 'extra' },
        ],
      },
      slots: [{ id: 'slot-a', label: 'She ___ to school.', input: 'drop', pool: 'old-block-cloze-pool', answer: ['w1'] }],
      blocks: [{ kind: 'row', id: 'row-cz-a', slotId: 'slot-a' }],
    };
    render(<ClozeHarness initialPayload={payload} />);
    expect(screen.getByTestId('cloze-distractor-chips-b1').textContent).toContain('extra');
  });

  it('a new distractor on a mismatched-pool-name block lands in the SAME existing pool, not a fresh one keyed by the block id', () => {
    const payload: Payload = {
      pools: { 'old-block-cloze-pool': [{ id: 'w1', text: 'goes' }] },
      slots: [{ id: 'slot-a', label: 'She ___ to school.', input: 'drop', pool: 'old-block-cloze-pool', answer: ['w1'] }],
      blocks: [{ kind: 'row', id: 'row-cz-a', slotId: 'slot-a' }],
    };
    function Host() {
      const [current, setCurrent] = useState<Payload>(payload);
      return (
        <>
          <QuizBlockEditor
            blockId="b1"
            lang="es"
            payload={current}
            template="cloze"
            selectedSlotId={null}
            onSelectSlot={() => {}}
            onPayloadChange={setCurrent}
          />
          <div data-testid="pool-keys">{Object.keys(current.pools).sort().join(',')}</div>
        </>
      );
    }
    render(<Host />);
    const distractorInput = screen.getByTestId('cloze-distractors-b1') as HTMLInputElement;
    fireEvent.change(distractorInput, { target: { value: 'went' } });
    fireEvent.keyDown(distractorInput, { key: 'Enter' });

    expect(screen.getByTestId('pool-keys').textContent).toBe('old-block-cloze-pool');
    expect(screen.getByTestId('cloze-distractor-chips-b1').textContent).toContain('went');
  });
});

describe('QuizBlockEditor — "Ordenar por grupos" (groupsort authoring)', () => {
  it('renders the group editor instead of the Básico question-card list', () => {
    render(<GroupSortHarness initialPayload={EMPTY_PAYLOAD} />);
    expect(screen.getByTestId('groupsort-editor-b1')).toBeTruthy();
    expect(screen.queryByTestId('quiz-empty-b1')).toBeNull();
    expect(screen.queryByTestId('question-card-s1')).toBeNull();
  });

  it('shows the "add a group to start playing" hint while there are no groups at all', () => {
    render(<GroupSortHarness initialPayload={EMPTY_PAYLOAD} />);
    expect(screen.getByTestId('groupsort-hint-b1').textContent).toBe('Agrega un grupo para empezar a jugar');
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

  // A group with ZERO items gets its own calm, muted footnote (never the
  // amber block-level hint) — it hides the instant the group gets its FIRST
  // item, not only once it reaches 2 (that bar is now the advisory tip).
  it('shows a muted "add an item to this group" footnote per group while it has zero items, hiding on its first item', () => {
    render(<GroupSortHarness initialPayload={EMPTY_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('groupsort-add-b1'));
    const slotId = screen.getAllByTestId(/^groupsort-name-/)[0]!.getAttribute('data-testid')!.replace('groupsort-name-', '');
    expect(screen.getByTestId(`groupsort-empty-group-hint-${slotId}`).textContent).toBe(
      'Agrega un elemento a este grupo',
    );

    const itemInput = screen.getByTestId(`groupsort-item-input-${slotId}`) as HTMLInputElement;
    fireEvent.change(itemInput, { target: { value: 'dog' } });
    fireEvent.keyDown(itemInput, { key: 'Enter' });

    expect(screen.queryByTestId(`groupsort-empty-group-hint-${slotId}`)).toBeNull();
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
    expect(screen.queryByTestId('groupsort-hint-b1')).toBeNull();
    expect(screen.getByTestId('groupsort-ready-b1').textContent).toBe('Listo para jugar · 2 grupos');
  });

  // Bug S0 (owner audit, `PROPUESTA-PLANTILLAS-2026-10-23.md` §e, screenshot
  // `editor-groupsort-1440x900.png`): a duplicated/copied block keeps its
  // payload's own `slot.pool` name from wherever it came from, but this file
  // used to re-derive the pool name from ONLY the current `blockId`
  // (`${blockId}-groupsort-pool`) — the instant that disagrees with what the
  // content actually stored, `deriveGroupSortRows` looks up the WRONG pool,
  // finds nothing, and every item renders with empty text (just its "×"
  // remove button, nothing to remove next to it).
  it('shows item text (not just the "×" remove button) when the payload\'s own pool name does not match the "${blockId}-groupsort-pool" convention', () => {
    const payload: Payload = {
      pools: {
        'old-block-groupsort-pool': [
          { id: 'i1', text: 'dog' },
          { id: 'i2', text: 'cat' },
        ],
      },
      slots: [{ id: 'g1', label: 'Animals', input: 'group', pool: 'old-block-groupsort-pool', answer: ['i1', 'i2'] }],
      blocks: [{ kind: 'row', id: 'row-g1', slotId: 'g1' }],
    };
    render(<GroupSortHarness initialPayload={payload} />);

    expect(screen.getByTestId('groupsort-item-i1').textContent).toContain('dog');
    expect(screen.getByTestId('groupsort-item-i2').textContent).toContain('cat');
  });

  it('a new item on a mismatched-pool-name block lands in the SAME existing pool, not a fresh one keyed by the block id', () => {
    const payload: Payload = {
      pools: { 'old-block-groupsort-pool': [{ id: 'i1', text: 'dog' }] },
      slots: [{ id: 'g1', label: 'Animals', input: 'group', pool: 'old-block-groupsort-pool', answer: ['i1'] }],
      blocks: [{ kind: 'row', id: 'row-g1', slotId: 'g1' }],
    };
    function Host() {
      const [current, setCurrent] = useState<Payload>(payload);
      return (
        <>
          <QuizBlockEditor
            blockId="b1"
            lang="es"
            payload={current}
            template="groupsort"
            selectedSlotId={null}
            onSelectSlot={() => {}}
            onPayloadChange={setCurrent}
          />
          <div data-testid="pool-keys">{Object.keys(current.pools).sort().join(',')}</div>
        </>
      );
    }
    render(<Host />);

    const itemInput = screen.getByTestId('groupsort-item-input-g1') as HTMLInputElement;
    fireEvent.change(itemInput, { target: { value: 'horse' } });
    fireEvent.keyDown(itemInput, { key: 'Enter' });

    // Still ONE pool — "horse" joined the existing "old-block-groupsort-pool",
    // never a stray second "b1-groupsort-pool".
    expect(screen.getByTestId('pool-keys').textContent).toBe('old-block-groupsort-pool');
    const items = within(screen.getByTestId('groupsort-items-g1')).getAllByTestId(/^groupsort-item-/);
    expect(items.map((i) => i.textContent?.trim())).toEqual([
      expect.stringContaining('dog'),
      expect.stringContaining('horse'),
    ]);
  });
});

describe('QuizBlockEditor — template editors share the desk-native sheet + stage layout', () => {
  const THREE_PAIRS: Payload = {
    pools: {},
    slots: [
      { id: 's1', label: 'dog', input: 'text', answer: ['perro'] },
      { id: 's2', label: 'water', input: 'text', answer: ['agua'] },
      { id: 's3', label: 'bird', input: 'text', answer: ['ave'] },
    ],
    blocks: [
      { kind: 'row', id: 'row-s1', slotId: 's1' },
      { kind: 'row', id: 'row-s2', slotId: 's2' },
      { kind: 'row', id: 'row-s3', slotId: 's3' },
    ],
  };

  it('renders the authoring sheet beside the preview stage, with no phone tab bar', () => {
    render(<MatchHarness initialPayload={THREE_PAIRS} />);
    expect(screen.getByTestId('quiz-editor-b1').hasAttribute('data-template-canvas')).toBe(true);
    expect(within(screen.getByTestId('template-sheet-b1')).getByTestId('match-pairs-editor-b1')).toBeTruthy();
    expect(within(screen.getByTestId('template-stage-b1')).getByTestId('quiz-preview-b1')).toBeTruthy();
    expect(screen.queryByTestId('quiz-mobile-tabs-b1')).toBeNull();
  });

  it('shows an empty stage (no game yet) for a brand-new template block', () => {
    render(<ReorderHarness initialPayload={EMPTY_PAYLOAD} />);
    expect(screen.getByTestId('template-stage-empty-b1').textContent).toContain('Aquí verás el juego');
    expect(screen.queryByTestId('quiz-preview-b1')).toBeNull();
  });

  // T1 ("molded previews show the real board, never Básico"): the stage
  // must key off `boardHasContent` (does THIS mold's own board actually
  // have something to show), not merely `hasQuestions` (raw authored
  // ROWS) — a reorder sentence still 1 word is already a "question" (the
  // ghost row was promoted the instant it was typed into) but not yet a
  // playable board, so the placeholder stays until the SAME row reaches 2+
  // words. Reads the debounced payload (`useFakeTimers`, same 300ms
  // `QuizLivePreview` itself waits on) so a fast typist never sees the
  // stage blink between the placeholder and the board mid-keystroke.
  it('keeps the empty placeholder while a reorder sentence is still 1 word, then shows the real board at 2+ words — off the SAME debounced payload the preview itself uses', () => {
    vi.useFakeTimers();
    render(<ReorderHarness initialPayload={EMPTY_PAYLOAD} />);
    const ghost = screen.getByTestId('reorder-ghost-sentence-b1') as HTMLInputElement;

    fireEvent.change(ghost, { target: { value: 'I' } });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByTestId('template-stage-empty-b1')).toBeTruthy();
    expect(screen.queryByTestId('quiz-preview-b1')).toBeNull();

    const [sentence] = screen.getAllByTestId(/^reorder-sentence-/) as HTMLInputElement[];
    fireEvent.change(sentence, { target: { value: 'I like' } });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByTestId('quiz-reorder')).toBeTruthy();
    expect(screen.queryByTestId('template-stage-empty-b1')).toBeNull();

    vi.useRealTimers();
  });

  it('match: says "Listo para jugar" once 3 complete pairs exist', () => {
    render(<MatchHarness initialPayload={THREE_PAIRS} />);
    expect(screen.getByTestId('match-pairs-ready-b1').textContent).toBe('Listo para jugar · 3 parejas');
  });

  it('match: is not "Listo" while two pairs share an answer (the board could not tell them apart)', () => {
    const payload: Payload = {
      ...THREE_PAIRS,
      slots: THREE_PAIRS.slots.map((s) => (s.id === 's3' ? { ...s, answer: ['Perro'] } : s)),
    };
    render(<MatchHarness initialPayload={payload} />);
    expect(screen.queryByTestId('match-pairs-ready-b1')).toBeNull();
    expect(screen.getByTestId('match-pairs-hint-b1').textContent).toBe('Cada pareja necesita una respuesta distinta');
  });

  it('match: Enter in a question field moves to its own answer field', () => {
    render(<MatchHarness initialPayload={THREE_PAIRS} />);
    fireEvent.keyDown(screen.getByTestId('match-pair-question-s2'), { key: 'Enter' });
    expect(document.activeElement).toBe(screen.getByTestId('match-pair-answer-s2'));
    expect(screen.getAllByTestId(/^match-pair-question-/)).toHaveLength(3);
  });

  it('match: labels every field with its own row number', () => {
    render(<MatchHarness initialPayload={THREE_PAIRS} />);
    expect(screen.getByLabelText('Pregunta 2')).toBe(screen.getByTestId('match-pair-question-s2'));
    expect(screen.getByLabelText('Respuesta 3')).toBe(screen.getByTestId('match-pair-answer-s3'));
  });

  it('reorder: previews each sentence as its own words, shuffled', () => {
    const payload: Payload = {
      pools: {},
      slots: [{ id: 's1', label: 'She is reading a book', input: 'text', answer: ['She is reading a book'] }],
      blocks: [{ kind: 'row', id: 'row-s1', slotId: 's1' }],
    };
    render(<ReorderHarness initialPayload={payload} />);
    const words = Array.from(screen.getByTestId('reorder-preview-s1').children).map((chip) => chip.textContent);
    expect([...words].sort()).toEqual(['She', 'a', 'book', 'is', 'reading'].sort());
    expect(words.join(' ')).not.toBe('She is reading a book');
    expect(screen.getByTestId('reorder-ready-b1').textContent).toBe('Listo para jugar · 1 oración');
  });

  it('cloze: the mini-preview shows each bracketed word as its own chip', () => {
    render(<ClozeHarness initialPayload={EMPTY_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('cloze-add-b1'));
    fireEvent.change(screen.getAllByTestId(/^cloze-sentence-/)[0]!, { target: { value: 'I [was] tired.' } });
    const preview = screen.getByTestId('cloze-preview-0');
    expect(preview.textContent).toBe('I was tired.');
    expect(preview.querySelectorAll('span.inline-flex')).toHaveLength(1);
  });

  it('cloze: Ctrl+Enter adds another SENTENCE row (never a stray plain question slot)', () => {
    render(<ClozeHarness initialPayload={EMPTY_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('cloze-add-b1'));
    fireEvent.keyDown(screen.getAllByTestId(/^cloze-sentence-/)[0]!, { key: 'Enter', ctrlKey: true });
    expect(screen.getAllByTestId(/^cloze-sentence-/)).toHaveLength(2);
  });

  it('cloze: extra words are chips — Enter adds them (comma lists too), "×" removes one', () => {
    const payload: Payload = {
      pools: { 'b1-cloze-pool': [{ id: 'w1', text: 'goes' }] },
      slots: [{ id: 'slot-a', label: 'She ___ to school.', input: 'drop', pool: 'b1-cloze-pool', answer: ['w1'] }],
      blocks: [{ kind: 'row', id: 'row-cz-s0-b0-1', slotId: 'slot-a' }],
    };
    render(<ClozeHarness initialPayload={payload} />);
    const input = screen.getByTestId('cloze-distractors-b1') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'is, went' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    const chips = () => Array.from(screen.getByTestId('cloze-distractor-chips-b1').children).map((c) => c.textContent);
    expect(chips()).toEqual(['is', 'went']);
    expect(input.value).toBe('');

    fireEvent.click(screen.getByTestId('cloze-distractor-remove-0'));
    expect(chips()).toEqual(['went']);
  });

  it('groupsort: Ctrl+Enter adds another GROUP (never a stray plain question slot), up to the 4-group cap', () => {
    render(<GroupSortHarness initialPayload={EMPTY_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('groupsort-add-b1'));
    const firstName = screen.getAllByTestId(/^groupsort-name-/)[0]!;
    for (let i = 0; i < 5; i += 1) fireEvent.keyDown(firstName, { key: 'Enter', ctrlKey: true });
    expect(screen.getAllByTestId(/^groupsort-name-/)).toHaveLength(4);
  });

  // `ready` is gated on `playable` (the SAME debounced payload the live
  // preview reads), so this now needs the debounce to catch up at each
  // step: 2 still-empty groups are already `playable` (`boardHasContent`
  // only needs >= 1 group to exist) but not yet `ready` (every group needs
  // >= 1 item); once both groups get an item, it is ready.
  it('groupsort: says "Listo para jugar" once every group has at least one item, once the debounce catches up', () => {
    vi.useFakeTimers();
    try {
      render(<GroupSortHarness initialPayload={EMPTY_PAYLOAD} />);
      fireEvent.click(screen.getByTestId('groupsort-add-b1'));
      fireEvent.click(screen.getByTestId('groupsort-add-b1'));
      const slotIds = screen
        .getAllByTestId(/^groupsort-name-/)
        .map((n) => n.getAttribute('data-testid')!.replace('groupsort-name-', ''));
      expect(slotIds).toHaveLength(2);

      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(screen.queryByTestId('groupsort-ready-b1')).toBeNull();
      expect(screen.queryByTestId('groupsort-hint-b1')).toBeNull();

      for (const slotId of slotIds) {
        const itemInput = screen.getByTestId(`groupsort-item-input-${slotId}`);
        fireEvent.change(itemInput, { target: { value: 'one, two' } });
        fireEvent.keyDown(itemInput, { key: 'Enter' });
      }
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(screen.getByTestId('groupsort-ready-b1').textContent).toBe('Listo para jugar · 2 grupos');
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * INVARIANT (polish follow-up): the block-level amber warning
 * (`*-hint-${blockId}`) shows IF AND ONLY IF the preview stage shows its own
 * empty placeholder (`template-stage-empty-${blockId}`) — both are driven by
 * the exact same `boardHasContent(template, …)` call on the exact same
 * debounced payload, so a reader never sees a readiness line contradict the
 * board sitting right next to it.
 */
describe('QuizBlockEditor — the amber hint never contradicts the preview placeholder (invariant)', () => {
  const matchQuestionOnly: Payload = {
    pools: {},
    slots: [{ id: 's1', label: 'dog', input: 'text', answer: [] }],
    blocks: [{ kind: 'row', id: 'row-s1', slotId: 's1' }],
  };
  const matchOneAnsweredPair: Payload = {
    pools: {},
    slots: [{ id: 's1', label: '', input: 'text', answer: ['perro'] }],
    blocks: [{ kind: 'row', id: 'row-s1', slotId: 's1' }],
  };
  const matchDuplicateAnswers: Payload = {
    pools: {},
    slots: [
      { id: 's1', label: 'dog', input: 'text', answer: ['perro'] },
      { id: 's2', label: 'cat', input: 'text', answer: ['perro'] },
    ],
    blocks: [
      { kind: 'row', id: 'row-s1', slotId: 's1' },
      { kind: 'row', id: 'row-s2', slotId: 's2' },
    ],
  };
  const reorderOneWord: Payload = {
    pools: {},
    slots: [{ id: 's1', label: 'Cats', input: 'text', answer: ['Cats'] }],
    blocks: [{ kind: 'row', id: 'row-s1', slotId: 's1' }],
  };
  const reorderTwoWords: Payload = {
    pools: {},
    slots: [{ id: 's1', label: 'Cats sleep', input: 'text', answer: ['Cats sleep'] }],
    blocks: [{ kind: 'row', id: 'row-s1', slotId: 's1' }],
  };
  const clozeNoBrackets: Payload = {
    pools: {},
    slots: [{ id: 'slot-a', label: 'She goes to school.', input: 'text', answer: [] }],
    blocks: [{ kind: 'row', id: 'row-cz-s0-b0-1', slotId: 'slot-a' }],
  };
  const clozeOneBracket: Payload = {
    pools: { 'b1-cloze-pool': [{ id: 'w1', text: 'goes' }] },
    slots: [{ id: 'slot-a', label: 'She ___ to school.', input: 'drop', pool: 'b1-cloze-pool', answer: ['w1'] }],
    blocks: [{ kind: 'row', id: 'row-cz-s0-b0-1', slotId: 'slot-a' }],
  };
  const groupsortOneGroupNoItems: Payload = {
    pools: {},
    slots: [{ id: 'g1', label: 'Animals', input: 'group', pool: 'b1-groupsort-pool', answer: [] }],
    blocks: [{ kind: 'row', id: 'row-g1', slotId: 'g1' }],
  };

  it.each<[string, React.ComponentType<{ initialPayload: Payload }>, Payload, string]>([
    ['match: empty', MatchHarness, EMPTY_PAYLOAD, 'match-pairs-hint-b1'],
    ['match: question only (no answer)', MatchHarness, matchQuestionOnly, 'match-pairs-hint-b1'],
    ['match: 1 answered pair', MatchHarness, matchOneAnsweredPair, 'match-pairs-hint-b1'],
    ['match: duplicate answers', MatchHarness, matchDuplicateAnswers, 'match-pairs-hint-b1'],
    ['reorder: 1 word', ReorderHarness, reorderOneWord, 'reorder-hint-b1'],
    ['reorder: 2 words', ReorderHarness, reorderTwoWords, 'reorder-hint-b1'],
    ['cloze: no brackets', ClozeHarness, clozeNoBrackets, 'cloze-hint-b1'],
    ['cloze: one bracket', ClozeHarness, clozeOneBracket, 'cloze-hint-b1'],
    ['groupsort: no groups', GroupSortHarness, EMPTY_PAYLOAD, 'groupsort-hint-b1'],
    ['groupsort: 1 group with 0 items (no block hint, but a per-group footnote shows)', GroupSortHarness, groupsortOneGroupNoItems, 'groupsort-hint-b1'],
  ])('%s', (_name, Harness, payload, hintTestId) => {
    render(<Harness initialPayload={payload} />);
    const hint = screen.queryByTestId(hintTestId);
    const placeholder = screen.queryByTestId('template-stage-empty-b1');
    expect(Boolean(hint)).toBe(Boolean(placeholder));
  });

  // The groupsort "1 group, 0 items" row above: the BLOCK-level hint is
  // absent (the board already has a group to show), but the per-group
  // footnote still nudges the author to fill it.
  it('groupsort: a lone empty group shows its own footnote even while the block hint stays hidden', () => {
    render(<GroupSortHarness initialPayload={groupsortOneGroupNoItems} />);
    expect(screen.queryByTestId('groupsort-hint-b1')).toBeNull();
    expect(screen.getByTestId('groupsort-empty-group-hint-g1').textContent).toBe('Agrega un elemento a este grupo');
  });

  // Checked at BOTH 0ms and 300ms (not just the final settled state): the
  // hint and the placeholder must never disagree even mid-debounce, because
  // they are driven by the exact same debounced value, never a live one.
  it('stays in sync across the debounce window: checked at 0ms (stale) and 300ms (caught up)', () => {
    vi.useFakeTimers();
    try {
      render(<ReorderHarness initialPayload={EMPTY_PAYLOAD} />);
      const ghost = screen.getByTestId('reorder-ghost-sentence-b1') as HTMLInputElement;
      fireEvent.change(ghost, { target: { value: 'Cats sleep' } });

      // t=0: the debounced payload has not caught up yet — both still
      // reflect the OLD (empty) state, in agreement with each other.
      expect(Boolean(screen.queryByTestId('reorder-hint-b1'))).toBe(
        Boolean(screen.queryByTestId('template-stage-empty-b1')),
      );
      expect(screen.getByTestId('reorder-hint-b1')).toBeTruthy();
      expect(screen.getByTestId('template-stage-empty-b1')).toBeTruthy();

      act(() => {
        vi.advanceTimersByTime(300);
      });

      // t=300ms: the debounce fires — both flip to the NEW state together.
      expect(Boolean(screen.queryByTestId('reorder-hint-b1'))).toBe(
        Boolean(screen.queryByTestId('template-stage-empty-b1')),
      );
      expect(screen.queryByTestId('reorder-hint-b1')).toBeNull();
      expect(screen.queryByTestId('template-stage-empty-b1')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

/** Fires a multi/single-line clipboard paste at `element` (owner spec N5, "paste a whole list"). */
function paste(element: HTMLElement, text: string) {
  return fireEvent.paste(element, { clipboardData: { getData: () => text } });
}

describe('QuizBlockEditor — "Une las parejas": paste a whole list (N5)', () => {
  it('pasting into the empty-list ghost row yields one pair per line, in one onPayloadChange call', () => {
    const onPayloadChange = vi.fn();
    function Harness2() {
      const [payload, setPayload] = useState<Payload>(EMPTY_PAYLOAD);
      return (
        <QuizBlockEditor
          blockId="b1"
          lang="es"
          payload={payload}
          template="match"
          selectedSlotId={null}
          onSelectSlot={() => {}}
          onPayloadChange={(p) => {
            onPayloadChange(p);
            setPayload(p);
          }}
        />
      );
    }
    render(<Harness2 />);
    paste(screen.getByTestId('match-pair-ghost-question-b1'), 'dog\tperro\ncat\tgato\nbird=pájaro');

    expect(onPayloadChange).toHaveBeenCalledTimes(1); // the whole paste is ONE commit, so ONE undo step upstream
    const questionInputs = screen.getAllByTestId(/^match-pair-question-/) as HTMLInputElement[];
    const answerInputs = screen.getAllByTestId(/^match-pair-answer-/) as HTMLInputElement[];
    expect(questionInputs.map((i) => i.value)).toEqual(['dog', 'cat', 'bird']);
    expect(answerInputs.map((i) => i.value)).toEqual(['perro', 'gato', 'pájaro']);
  });

  it('replaces the focused EMPTY pair with the first line, inserting the rest right after it', () => {
    const payload: Payload = {
      pools: {},
      slots: [
        { id: 's1', label: '', input: 'text', answer: [] },
        { id: 's2', label: 'kept', input: 'text', answer: ['kept-answer'] },
      ],
      blocks: [
        { kind: 'row', id: 'row-s1', slotId: 's1' },
        { kind: 'row', id: 'row-s2', slotId: 's2' },
      ],
    };
    render(<MatchHarness initialPayload={payload} />);
    paste(screen.getByTestId('match-pair-question-s1'), 'dog\tperro\ncat\tgato');

    const questionInputs = screen.getAllByTestId(/^match-pair-question-/) as HTMLInputElement[];
    expect(questionInputs.map((i) => i.value)).toEqual(['dog', 'cat', 'kept']);
  });

  it('shows "Se agregaron N parejas", which reverts to the normal status on the next edit', () => {
    render(<MatchHarness initialPayload={EMPTY_PAYLOAD} />);
    paste(screen.getByTestId('match-pair-ghost-question-b1'), 'dog\tperro\ncat\tgato');
    expect(screen.getByTestId('match-pairs-paste-feedback-b1').textContent).toBe('Se agregaron 2 parejas');

    fireEvent.change(screen.getAllByTestId(/^match-pair-question-/)[0]!, { target: { value: 'doggy' } });
    expect(screen.queryByTestId('match-pairs-paste-feedback-b1')).toBeNull();
  });

  it('a single-line paste is left to the browser default (not intercepted)', () => {
    render(<MatchHarness initialPayload={EMPTY_PAYLOAD} />);
    const notPrevented = paste(screen.getByTestId('match-pair-ghost-question-b1'), 'just one line');
    expect(notPrevented).toBe(true); // fireEvent returns true when no handler called preventDefault
    expect(screen.queryByTestId('match-pairs-paste-feedback-b1')).toBeNull();
  });

  it('shows the example placeholder and the paste hint while the list is empty, hides the hint once 2+ pairs are filled', () => {
    render(<MatchHarness initialPayload={EMPTY_PAYLOAD} />);
    expect(screen.getByTestId('match-pair-ghost-question-b1').getAttribute('placeholder')).toBe('dog');
    expect(screen.getByTestId('match-pair-ghost-answer-b1').getAttribute('placeholder')).toBe('perro');
    expect(screen.getByTestId('match-pairs-paste-hint-b1')).toBeTruthy();

    paste(screen.getByTestId('match-pair-ghost-question-b1'), 'dog\tperro\ncat\tgato');
    expect(screen.queryByTestId('match-pairs-paste-hint-b1')).toBeNull();
    expect((screen.getAllByTestId(/^match-pair-question-/)[0] as HTMLInputElement).placeholder).toBe('Palabra o pregunta');
  });

  it('the empty-list example row is a REAL, editable field — not a dead end', () => {
    const payloads: Payload[] = [];
    function Harness2() {
      const [payload, setPayload] = useState<Payload>(EMPTY_PAYLOAD);
      const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
      return (
        <QuizBlockEditor
          blockId="b1"
          lang="es"
          payload={payload}
          template="match"
          selectedSlotId={selectedSlotId}
          onSelectSlot={setSelectedSlotId}
          onPayloadChange={(p) => {
            payloads.push(p);
            setPayload(p);
          }}
        />
      );
    }
    render(<Harness2 />);
    const ghost = screen.getByTestId('match-pair-ghost-question-b1') as HTMLInputElement;
    expect(ghost.readOnly).toBe(false);
    expect(ghost.disabled).toBe(false);

    ghost.focus();
    fireEvent.change(ghost, { target: { value: 'd' } });
    expect(payloads).toHaveLength(1); // typing a character creates the row via onPayloadChange
    expect(screen.queryByTestId('match-pair-ghost-question-b1')).toBeNull(); // it IS the first real row now
    const [realQuestion] = screen.getAllByTestId(/^match-pair-question-/) as HTMLInputElement[];
    expect(realQuestion.value).toBe('d');
    // The caret follows: the next keystroke lands in the real row, not nowhere.
    expect(document.activeElement).toBe(realQuestion);

    fireEvent.change(realQuestion, { target: { value: 'dog' } });
    expect(realQuestion.value).toBe('dog');
  });
});

describe('QuizBlockEditor — "Reordenar": paste a whole list (N5)', () => {
  it('pasting into the empty-list ghost row yields one sentence per line, in one onPayloadChange call', () => {
    const onPayloadChange = vi.fn();
    function Harness2() {
      const [payload, setPayload] = useState<Payload>(EMPTY_PAYLOAD);
      return (
        <QuizBlockEditor
          blockId="b1"
          lang="es"
          payload={payload}
          template="reorder"
          selectedSlotId={null}
          onSelectSlot={() => {}}
          onPayloadChange={(p) => {
            onPayloadChange(p);
            setPayload(p);
          }}
        />
      );
    }
    render(<Harness2 />);
    paste(screen.getByTestId('reorder-ghost-sentence-b1'), 'Cats sleep\nDogs bark\nBirds fly');

    expect(onPayloadChange).toHaveBeenCalledTimes(1);
    const sentenceInputs = screen.getAllByTestId(/^reorder-sentence-/) as HTMLInputElement[];
    expect(sentenceInputs.map((i) => i.value)).toEqual(['Cats sleep', 'Dogs bark', 'Birds fly']);
  });

  it('shows "Se agregaron N oraciones", hides the hint once 2+ sentences are filled', () => {
    render(<ReorderHarness initialPayload={EMPTY_PAYLOAD} />);
    expect(screen.getByTestId('reorder-paste-hint-b1')).toBeTruthy();
    paste(screen.getByTestId('reorder-ghost-sentence-b1'), 'Cats sleep\nDogs bark');
    expect(screen.getByTestId('reorder-paste-feedback-b1').textContent).toBe('Se agregaron 2 oraciones');
    expect(screen.queryByTestId('reorder-paste-hint-b1')).toBeNull();
  });

  it('a single-line paste is left to the browser default (not intercepted)', () => {
    render(<ReorderHarness initialPayload={EMPTY_PAYLOAD} />);
    const notPrevented = paste(screen.getByTestId('reorder-ghost-sentence-b1'), 'just one sentence');
    expect(notPrevented).toBe(true);
    expect(screen.queryByTestId('reorder-paste-feedback-b1')).toBeNull();
  });

  it('the empty-list example row is a REAL, editable field — not a dead end', () => {
    render(<ReorderHarness initialPayload={EMPTY_PAYLOAD} />);
    const ghost = screen.getByTestId('reorder-ghost-sentence-b1') as HTMLInputElement;
    expect(ghost.readOnly).toBe(false);
    expect(ghost.disabled).toBe(false);

    ghost.focus();
    fireEvent.change(ghost, { target: { value: 'C' } });
    expect(screen.queryByTestId('reorder-ghost-sentence-b1')).toBeNull();
    const [realSentence] = screen.getAllByTestId(/^reorder-sentence-/) as HTMLInputElement[];
    expect(realSentence.value).toBe('C');
    expect(document.activeElement).toBe(realSentence);
  });
});

describe('QuizBlockEditor — "Completar la frase": paste a whole list (N5)', () => {
  it('pasting into the empty-list ghost row yields one sentence per line, brackets kept as typed', () => {
    const onPayloadChange = vi.fn();
    function Harness2() {
      const [payload, setPayload] = useState<Payload>(EMPTY_PAYLOAD);
      return (
        <QuizBlockEditor
          blockId="b1"
          lang="es"
          payload={payload}
          template="cloze"
          selectedSlotId={null}
          onSelectSlot={() => {}}
          onPayloadChange={(p) => {
            onPayloadChange(p);
            setPayload(p);
          }}
        />
      );
    }
    render(<Harness2 />);
    paste(screen.getByTestId('cloze-ghost-sentence-b1'), 'She [is] my teacher.\nThey [have] arrived.');

    expect(onPayloadChange).toHaveBeenCalledTimes(1);
    const sentenceInputs = screen.getAllByTestId(/^cloze-sentence-/) as HTMLInputElement[];
    expect(sentenceInputs.map((i) => i.value)).toEqual(['She [is] my teacher.', 'They [have] arrived.']);
  });

  it('replaces the focused EMPTY sentence with the first line, appending the rest', () => {
    render(<ClozeHarness initialPayload={EMPTY_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('cloze-add-b1'));
    const [firstField] = screen.getAllByTestId(/^cloze-sentence-/) as HTMLInputElement[];
    paste(firstField, 'She [is] my teacher.\nThey [have] arrived.');

    const sentenceInputs = screen.getAllByTestId(/^cloze-sentence-/) as HTMLInputElement[];
    expect(sentenceInputs.map((i) => i.value)).toEqual(['She [is] my teacher.', 'They [have] arrived.']);
  });

  it('the empty-list example row is a REAL, editable field — not a dead end', () => {
    render(<ClozeHarness initialPayload={EMPTY_PAYLOAD} />);
    const ghost = screen.getByTestId('cloze-ghost-sentence-b1') as HTMLInputElement;
    expect(ghost.readOnly).toBe(false);
    expect(ghost.disabled).toBe(false);

    ghost.focus();
    fireEvent.change(ghost, { target: { value: 'S' } });
    expect(screen.queryByTestId('cloze-ghost-sentence-b1')).toBeNull();
    const [realSentence] = screen.getAllByTestId(/^cloze-sentence-/) as HTMLInputElement[];
    expect(realSentence.value).toBe('S');
    expect(document.activeElement).toBe(realSentence);
  });
});

describe('QuizBlockEditor — "Ordenar por grupos": paste a whole list (N5)', () => {
  it('"Group: item, item" lines create one group each, in one onPayloadChange call', () => {
    const onPayloadChange = vi.fn();
    function Harness2() {
      const [payload, setPayload] = useState<Payload>(EMPTY_PAYLOAD);
      return (
        <QuizBlockEditor
          blockId="b1"
          lang="es"
          payload={payload}
          template="groupsort"
          selectedSlotId={null}
          onSelectSlot={() => {}}
          onPayloadChange={(p) => {
            onPayloadChange(p);
            setPayload(p);
          }}
        />
      );
    }
    render(<Harness2 />);
    paste(screen.getByTestId('groupsort-ghost-name-b1'), 'Animals: cat, dog\nColors: red, blue');

    expect(onPayloadChange).toHaveBeenCalledTimes(1);
    const nameInputs = screen.getAllByTestId(/^groupsort-name-/) as HTMLInputElement[];
    expect(nameInputs.map((i) => i.value)).toEqual(['Animals', 'Colors']);
  });

  it('a line with no ":" adds its items to the group just created by the previous line', () => {
    render(<GroupSortHarness initialPayload={EMPTY_PAYLOAD} />);
    paste(screen.getByTestId('groupsort-ghost-name-b1'), 'Animals: cat\ndog, bird');

    const slotId = screen.getAllByTestId(/^groupsort-name-/)[0]!.getAttribute('data-testid')!.replace('groupsort-name-', '');
    const chips = within(screen.getByTestId(`groupsort-items-${slotId}`)).getAllByTestId(/^groupsort-item-/);
    expect(chips.map((c) => c.textContent)).toEqual(['cat', 'dog', 'bird']);
  });

  it('drops groups past the 4-group cap and says so in the status line', () => {
    render(<GroupSortHarness initialPayload={EMPTY_PAYLOAD} />);
    paste(screen.getByTestId('groupsort-ghost-name-b1'), 'A: a\nB: b\nC: c\nD: d\nE: e');

    expect(screen.getAllByTestId(/^groupsort-name-/)).toHaveLength(4);
    expect(screen.getByTestId('groupsort-paste-feedback-b1').textContent).toContain('1 no entró');
  });

  it('shows the example placeholder and paste hint while the list is empty', () => {
    render(<GroupSortHarness initialPayload={EMPTY_PAYLOAD} />);
    expect(screen.getByTestId('groupsort-ghost-name-b1').getAttribute('placeholder')).toBe('Animals');
    expect(screen.getByTestId('groupsort-paste-hint-b1')).toBeTruthy();
  });

  it('the empty-list example row is a REAL, editable field — not a dead end', () => {
    render(<GroupSortHarness initialPayload={EMPTY_PAYLOAD} />);
    const ghost = screen.getByTestId('groupsort-ghost-name-b1') as HTMLInputElement;
    expect(ghost.readOnly).toBe(false);
    expect(ghost.disabled).toBe(false);

    ghost.focus();
    fireEvent.change(ghost, { target: { value: 'A' } });
    expect(screen.queryByTestId('groupsort-ghost-name-b1')).toBeNull();
    const [realName] = screen.getAllByTestId(/^groupsort-name-/) as HTMLInputElement[];
    expect(realName.value).toBe('A');
    expect(document.activeElement).toBe(realName);
  });
});

describe('QuizBlockEditor — "Cambiar de molde" (R2)', () => {
  // Owner decision (2026-10-19 follow-up): "vamos primero por el único
  // propósito" — each activity keeps the single mold it was created with,
  // for now. `CHANGE_MOLD_ENABLED` (flags.ts) is `false`, so QuizBlockEditor
  // no longer renders the trigger in ANY mold's own SheetHeader — this test
  // now asserts its absence instead of its presence.
  it('never shows the "Cambiar de molde" trigger while CHANGE_MOLD_ENABLED is false (Varios juegos, match, reorder, cloze, groupsort)', () => {
    render(<Harness initialPayload={ONE_QUESTION_PAYLOAD} />);
    expect(screen.queryByTestId('change-mold-b1')).toBeNull();
    cleanup();

    render(<MatchHarness initialPayload={EMPTY_PAYLOAD} />);
    expect(screen.queryByTestId('change-mold-b1')).toBeNull();
    cleanup();

    render(<ReorderHarness initialPayload={EMPTY_PAYLOAD} />);
    expect(screen.queryByTestId('change-mold-b1')).toBeNull();
    cleanup();

    render(<ClozeHarness initialPayload={EMPTY_PAYLOAD} />);
    expect(screen.queryByTestId('change-mold-b1')).toBeNull();
    cleanup();

    render(<GroupSortHarness initialPayload={EMPTY_PAYLOAD} />);
    expect(screen.queryByTestId('change-mold-b1')).toBeNull();
  });

  // The dialog's own rendering (5 options, "Actual"/disabled + reason text)
  // is `ChangeMoldDialog.tsx`'s own concern, decoupled here from
  // QuizBlockEditor's now-hidden trigger (there is no longer any UI path
  // that sets `moldDialogOpen`, so this mounts the dialog directly, exactly
  // as a future re-enabled trigger would open it with `open` forced true).
  // `conversionOptions` itself (current/disabled/reason selection) is
  // already unit-tested in `templateConversion.test.ts`; this test's own
  // job is only the rendering on top of it.
  it('ChangeMoldDialog lists the 5 molds — the current one marked, unavailable ones disabled with their reason', () => {
    const block: QuizBlock = { id: 'b1', type: 'quiz', template: 'match', payload: MATCH_NO_REPEAT_PAYLOAD };
    render(<ChangeMoldDialog lang="es" open block={block} onOpenChange={() => {}} onChoose={() => {}} />);

    expect(screen.getByTestId('change-mold-dialog-b1')).toBeTruthy();
    expect(screen.getAllByTestId(/^change-mold-option-b1-/)).toHaveLength(5);

    const current = screen.getByTestId('change-mold-option-b1-match') as HTMLButtonElement;
    expect(current.textContent).toContain('Actual');
    expect(current.disabled).toBe(true);

    const groupsort = screen.getByTestId('change-mold-option-b1-groupsort') as HTMLButtonElement;
    expect(groupsort.disabled).toBe(true);
    expect(groupsort.textContent).toContain('Necesita al menos dos respuestas repetidas');

    const basic = screen.getByTestId('change-mold-option-b1-basic') as HTMLButtonElement;
    expect(basic.disabled).toBe(false);
  });

  // REMOVED (owner decision 2026-10-19 follow-up, judgment call documented
  // in the delivering agent's report): the 7 tests that used to live here —
  // "choosing a mold converts the content, closes the sheet and shows
  // status", the 4 "names dropped <kind>" tests, "undoing restores the
  // previous mold", and "the live preview reflects the new game" — all
  // drove `handleChooseMold` by clicking `change-mold-b1` then a
  // `change-mold-option-b1-*` button. With the trigger gated to `null`
  // (`CHANGE_MOLD_ENABLED` false), that path is unreachable from any real
  // user action, so these can no longer run as UI-click tests.
  //
  // The DATA each one ultimately checked (dropped-item kinds/counts,
  // promptImages preserved/dropped, the lossless "one conversion, one
  // commit" shape) is already unit-tested directly against `convertBlock`
  // in `templateConversion.test.ts` ("convertBlock — ..." describes),
  // independent of any UI.
  //
  // What is NOT covered elsewhere, and is therefore a real (accepted) gap
  // while this flag stays off: this file's own `droppedPhrase`/
  // `joinNatural`/`DROPPED_NOUNS` — the Spanish/English SENTENCE built from
  // those dropped-item counts ("se quitaron 2 opciones y 1 respuesta
  // extra") — and the dialog-close/undo/live-preview wiring around
  // `handleChooseMold` itself. Both are QuizBlockEditor-internal and only
  // reachable through the hidden trigger; restoring these exact tests
  // (recoverable from git history before this change) alongside
  // un-gating `changeMoldButton` is the intended path back, rather than
  // keeping them green against a trigger nothing can click.
});
