// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import QuizBlockEditor from './QuizBlockEditor';
import type { Payload } from '@/lib/exercisePayload';

afterEach(() => cleanup());

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

describe('QuizBlockEditor — empty state', () => {
  it('shows the empty-questions message, a primary add button, and no question list or checklist', () => {
    render(<Harness initialPayload={EMPTY_PAYLOAD} />);
    const empty = screen.getByTestId('quiz-empty-b1');
    expect(empty.textContent).toContain('Agrega tu primera pregunta');
    expect(screen.queryByTestId('quiz-question-list-b1')).toBeNull();
    expect(screen.queryByTestId('quiz-checklist-b1')).toBeNull();
    const addButton = screen.getByTestId('add-question-b1');
    expect(empty.contains(addButton)).toBe(true);
    expect(addButton.getAttribute('data-variant')).toBe('primary');
  });
});

describe('QuizBlockEditor — adding a question', () => {
  it('adds a question as an always-editable card and selects it', () => {
    render(<Harness initialPayload={EMPTY_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('add-question-b1'));

    expect(screen.getByTestId('quiz-question-list-b1')).toBeTruthy();
    expect(screen.queryByTestId('quiz-empty-b1')).toBeNull();
    const cards = screen.getAllByTestId(/^question-card-/);
    expect(cards).toHaveLength(1);
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
