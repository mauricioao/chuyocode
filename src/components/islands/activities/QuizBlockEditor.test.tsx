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
  it('shows the empty-questions message, a primary add button, and no question list', () => {
    render(<Harness initialPayload={EMPTY_PAYLOAD} />);
    const empty = screen.getByTestId('quiz-empty-b1');
    expect(empty.textContent).toContain('Agrega tu primera pregunta');
    expect(screen.queryByTestId('quiz-question-list-b1')).toBeNull();
    const addButton = screen.getByTestId('add-question-b1');
    expect(empty.contains(addButton)).toBe(true);
    expect(addButton.getAttribute('data-variant')).toBe('primary');
  });
});

describe('QuizBlockEditor — adding a question', () => {
  it('adds a question, selects it, and opens its panel', () => {
    render(<Harness initialPayload={EMPTY_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('add-question-b1'));

    expect(screen.getByTestId('quiz-question-list-b1')).toBeTruthy();
    expect(screen.queryByTestId('quiz-empty-b1')).toBeNull();
    // The new question is selected — its RowBlockEditor is rendered.
    const rowLabels = screen.getAllByText('Enunciado (usar ___ para el espacio en blanco)');
    expect(rowLabels).toHaveLength(1);
  });
});

describe('QuizBlockEditor — selecting a question shows its panel', () => {
  it('shows the empty-selection hint until a question is picked, then shows its editor', () => {
    render(<Harness initialPayload={ONE_QUESTION_PAYLOAD} />);
    expect(screen.getByTestId('quiz-panel-empty-b1')).toBeTruthy();

    fireEvent.click(screen.getByTestId('select-question-s1'));
    expect(screen.queryByTestId('quiz-panel-empty-b1')).toBeNull();
    expect(screen.getByTestId('quiz-question-panel-s1')).toBeTruthy();
    expect((screen.getByTestId('row-label-s1') as HTMLTextAreaElement).value).toBe(
      'The cat ___ on the mat',
    );
  });
});

describe('QuizBlockEditor — editing a question', () => {
  it('updates the sentence via RowBlockEditor', () => {
    render(<Harness initialPayload={ONE_QUESTION_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('select-question-s1'));

    const textarea = screen.getByTestId('row-label-s1');
    fireEvent.change(textarea, { target: { value: 'The dog ___ on the rug' } });

    expect(screen.getByText(/1\. The dog/)).toBeTruthy();
  });

  it('changes the mechanic and edits pool options via SlotAnswerEditor', () => {
    render(<Harness initialPayload={ONE_QUESTION_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('select-question-s1'));

    fireEvent.change(screen.getByTestId('mechanic-select-s1'), { target: { value: 'choice' } });
    fireEvent.change(screen.getByTestId('pool-name-s1'), { target: { value: 'opts' } });
    fireEvent.click(screen.getByTestId('add-pool-item-s1'));

    expect(screen.getByTestId('pool-items-s1').querySelectorAll('[data-testid^="pool-item-text-"]')).toHaveLength(
      1,
    );
  });
});

describe('QuizBlockEditor — explanation (D5, "¿Por qué?")', () => {
  it('starts empty for a question with no explanation', () => {
    render(<Harness initialPayload={ONE_QUESTION_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('select-question-s1'));
    const input = screen.getByTestId('quiz-explanation-s1') as HTMLTextAreaElement;
    expect(input.value).toBe('');
  });

  it('shows an already-authored explanation', () => {
    const payload: Payload = {
      pools: {},
      slots: [{ id: 's1', label: 'x', input: 'text', answer: ['sits'], explanation: 'Third person -s.' }],
    };
    render(<Harness initialPayload={payload} />);
    fireEvent.click(screen.getByTestId('select-question-s1'));
    const input = screen.getByTestId('quiz-explanation-s1') as HTMLTextAreaElement;
    expect(input.value).toBe('Third person -s.');
  });

  it('types an explanation and keeps it on the slot', () => {
    render(<Harness initialPayload={ONE_QUESTION_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('select-question-s1'));
    const input = screen.getByTestId('quiz-explanation-s1') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Third person -s.' } });
    expect(input.value).toBe('Third person -s.');
  });

  it('clearing the field back to blank drops the explanation entirely', () => {
    const payload: Payload = {
      pools: {},
      slots: [{ id: 's1', label: 'x', input: 'text', answer: ['sits'], explanation: 'Third person -s.' }],
    };
    render(<Harness initialPayload={payload} />);
    fireEvent.click(screen.getByTestId('select-question-s1'));
    const input = screen.getByTestId('quiz-explanation-s1') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: '   ' } });
    expect(input.value).toBe('');
  });
});

describe('QuizBlockEditor — removing a question', () => {
  it('removes the question and clears its selection', () => {
    render(<Harness initialPayload={ONE_QUESTION_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('select-question-s1'));
    expect(screen.getByTestId('quiz-question-panel-s1')).toBeTruthy();

    fireEvent.click(screen.getByTestId('delete-question-s1'));

    expect(screen.getByTestId('quiz-empty-b1')).toBeTruthy();
    expect(screen.queryByTestId('quiz-question-panel-s1')).toBeNull();
  });
});

describe('QuizBlockEditor — reordering questions', () => {
  // dnd-kit's keyboard sensor needs real layout measurement (`getBoundingClientRect`)
  // to compute a target index, which jsdom does not provide — the same reason
  // `BlockList.test.tsx`'s own reordering suite only asserts the handle exists and
  // is labeled/focusable rather than simulating a full keyboard drag end-to-end.
  it('renders a labeled, focusable drag handle per question, in question order', () => {
    const payload: Payload = {
      pools: {},
      slots: [
        { id: 's1', label: 'First', input: 'text', answer: ['a'] },
        { id: 's2', label: 'Second', input: 'text', answer: ['b'] },
      ],
      blocks: [
        { kind: 'row', id: 'row-s1', slotId: 's1' },
        { kind: 'row', id: 'row-s2', slotId: 's2' },
      ],
    };
    render(<Harness initialPayload={payload} />);

    const items = screen.getAllByText(/^1\.|^2\./);
    expect(items[0]?.textContent).toContain('First');
    expect(items[1]?.textContent).toContain('Second');

    const handles = screen.getAllByLabelText('Reordenar pregunta', { selector: 'button' });
    expect(handles).toHaveLength(2);
    expect(handles.every((h) => h.getAttribute('tabindex') === '0')).toBe(true);
  });
});

describe('QuizBlockEditor — incomplete pointer', () => {
  it('shows the incomplete message on the pointed-to question, once selected', () => {
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
    expect(screen.getByTestId('quiz-incomplete-s1').textContent).toBe(
      'Esta pregunta todavía no tiene una respuesta.',
    );
  });
});
