// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import QuestionCard from './QuestionCard';
import type { PoolItem, Slot } from '@/lib/exercisePayload';

afterEach(() => cleanup());

const TEXT_SLOT: Slot = { id: 's1', label: 'The cat ___ on the mat', input: 'text', answer: ['sits'] };
const CHOICE_SLOT: Slot = { id: 's2', label: 'Pick one', input: 'choice', pool: 'opts', answer: ['a'] };
const GAP_SLOT: Slot = { id: 's3', label: 'Fill ___', input: 'select', pool: 'opts', answer: ['a'] };
const CHOICE_POOL: PoolItem[] = [
  { id: 'a', text: 'cat' },
  { id: 'b', text: 'dog' },
];

function noop() {}

function baseProps(overrides: Partial<React.ComponentProps<typeof QuestionCard>> = {}) {
  return {
    slot: TEXT_SLOT,
    index: 1,
    lang: 'es',
    poolItems: [],
    onLabelChange: noop,
    onTypeChange: noop,
    onMarkCorrect: noop,
    onAddOption: noop,
    onRemoveOption: noop,
    onSetOptionText: noop,
    onAnswerChange: noop,
    onExplanationChange: noop,
    onDuplicate: noop,
    onDelete: noop,
    ...overrides,
  } satisfies React.ComponentProps<typeof QuestionCard>;
}

describe('QuestionCard — question text', () => {
  it('shows the current label and reports edits', () => {
    const onLabelChange = vi.fn();
    render(<QuestionCard {...baseProps({ onLabelChange })} />);
    const textarea = screen.getByTestId('question-text-s1') as HTMLTextAreaElement;
    expect(textarea.value).toBe('The cat ___ on the mat');
    fireEvent.change(textarea, { target: { value: 'The dog ___ on the rug' } });
    expect(onLabelChange).toHaveBeenCalledWith('The dog ___ on the rug');
  });

  it('shows nothing technical: no slot id, pool name, or mechanic string in visible text', () => {
    render(<QuestionCard {...baseProps({ slot: CHOICE_SLOT, poolItems: CHOICE_POOL })} />);
    const card = screen.getByTestId('question-card-s2');
    expect(card.textContent).not.toContain('choice');
    expect(card.textContent).not.toContain('opts');
  });
});

describe('QuestionCard — type segmented control', () => {
  it('shows the gap hint chip only for the gap type', () => {
    const { rerender } = render(<QuestionCard {...baseProps({ slot: TEXT_SLOT })} />);
    expect(screen.queryByTestId('gap-hint-s1')).toBeNull();

    rerender(<QuestionCard {...baseProps({ slot: GAP_SLOT, poolItems: CHOICE_POOL })} />);
    expect(screen.getByTestId('gap-hint-s3')).toBeTruthy();
  });

  it('reports the segment and drop flag when the author switches type', () => {
    const onTypeChange = vi.fn();
    render(<QuestionCard {...baseProps({ onTypeChange })} />);
    fireEvent.click(screen.getByTestId('question-type-s1-choice'));
    expect(onTypeChange).toHaveBeenCalledWith('choice', false);
  });

  it('shows the drop toggle only for the gap type, and reports it', () => {
    const onTypeChange = vi.fn();
    render(<QuestionCard {...baseProps({ slot: TEXT_SLOT, onTypeChange })} />);
    expect(screen.queryByTestId('show-as-drop-s1')).toBeNull();

    const { unmount } = render(
      <QuestionCard {...baseProps({ slot: GAP_SLOT, poolItems: CHOICE_POOL, onTypeChange })} />,
    );
    fireEvent.click(screen.getByTestId('show-as-drop-s3'));
    expect(onTypeChange).toHaveBeenCalledWith('gap', true);
    unmount();
  });
});

describe('QuestionCard — options (choice/gap)', () => {
  it('marks the correct option with a ring and a label, and reports marking another one correct', () => {
    const onMarkCorrect = vi.fn();
    render(<QuestionCard {...baseProps({ slot: CHOICE_SLOT, poolItems: CHOICE_POOL, onMarkCorrect })} />);
    const correctRow = screen.getByTestId('question-option-s2-a');
    expect(correctRow.textContent).toContain('Correcta');

    fireEvent.click(screen.getByTestId('question-option-correct-s2-b'));
    expect(onMarkCorrect).toHaveBeenCalledWith('b');
  });

  it('adds an option via the add button', () => {
    const onAddOption = vi.fn();
    render(<QuestionCard {...baseProps({ slot: CHOICE_SLOT, poolItems: CHOICE_POOL, onAddOption })} />);
    fireEvent.click(screen.getByTestId('question-add-option-s2'));
    expect(onAddOption).toHaveBeenCalled();
  });

  it('pressing Enter in the last option field also adds a new option', () => {
    const onAddOption = vi.fn();
    render(<QuestionCard {...baseProps({ slot: CHOICE_SLOT, poolItems: CHOICE_POOL, onAddOption })} />);
    fireEvent.keyDown(screen.getByTestId('question-option-text-s2-b'), { key: 'Enter' });
    expect(onAddOption).toHaveBeenCalled();
  });

  it('pressing Enter in a non-last option field does not add a new option', () => {
    const onAddOption = vi.fn();
    render(<QuestionCard {...baseProps({ slot: CHOICE_SLOT, poolItems: CHOICE_POOL, onAddOption })} />);
    fireEvent.keyDown(screen.getByTestId('question-option-text-s2-a'), { key: 'Enter' });
    expect(onAddOption).not.toHaveBeenCalled();
  });

  it('removes an option', () => {
    const onRemoveOption = vi.fn();
    render(<QuestionCard {...baseProps({ slot: CHOICE_SLOT, poolItems: CHOICE_POOL, onRemoveOption })} />);
    fireEvent.click(screen.getByTestId('question-remove-option-s2-b'));
    expect(onRemoveOption).toHaveBeenCalledWith('b');
  });
});

describe('QuestionCard — accepted answers (text)', () => {
  it('shows each accepted answer as a chip', () => {
    render(<QuestionCard {...baseProps({ slot: { ...TEXT_SLOT, answer: ['sits', 'sit'] } })} />);
    expect(screen.getByTestId('question-answer-chip-s1-0').textContent).toContain('sits');
    expect(screen.getByTestId('question-answer-chip-s1-1').textContent).toContain('sit');
  });

  it('Enter in the answer input adds a chip and clears the input', () => {
    const onAnswerChange = vi.fn();
    render(<QuestionCard {...baseProps({ slot: { ...TEXT_SLOT, answer: [] }, onAnswerChange })} />);
    const input = screen.getByTestId('question-answer-input-s1') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sits' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAnswerChange).toHaveBeenCalledWith(['sits']);
  });

  it('does not add a blank chip', () => {
    const onAnswerChange = vi.fn();
    render(<QuestionCard {...baseProps({ slot: { ...TEXT_SLOT, answer: [] }, onAnswerChange })} />);
    const input = screen.getByTestId('question-answer-input-s1') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAnswerChange).not.toHaveBeenCalled();
  });

  it('removes a chip via its × button', () => {
    const onAnswerChange = vi.fn();
    render(
      <QuestionCard {...baseProps({ slot: { ...TEXT_SLOT, answer: ['sits', 'sit'] }, onAnswerChange })} />,
    );
    fireEvent.click(screen.getByTestId('question-remove-answer-s1-0'));
    expect(onAnswerChange).toHaveBeenCalledWith(['sit']);
  });
});

describe('QuestionCard — footer', () => {
  it('hides the explanation field until "Más opciones" is opened', () => {
    render(<QuestionCard {...baseProps()} />);
    expect(screen.queryByTestId('question-explanation-s1')).toBeNull();
    fireEvent.click(screen.getByTestId('question-more-options-s1'));
    expect(screen.getByTestId('question-explanation-s1')).toBeTruthy();
  });

  it('reports explanation edits', () => {
    const onExplanationChange = vi.fn();
    render(<QuestionCard {...baseProps({ onExplanationChange })} />);
    fireEvent.click(screen.getByTestId('question-more-options-s1'));
    fireEvent.change(screen.getByTestId('question-explanation-s1'), { target: { value: 'Third person -s.' } });
    expect(onExplanationChange).toHaveBeenCalledWith('Third person -s.');
  });

  it('reports duplicate and delete clicks', () => {
    const onDuplicate = vi.fn();
    const onDelete = vi.fn();
    render(<QuestionCard {...baseProps({ onDuplicate, onDelete })} />);
    fireEvent.click(screen.getByTestId('question-duplicate-s1'));
    fireEvent.click(screen.getByTestId('question-delete-s1'));
    expect(onDuplicate).toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalled();
  });
});

describe('QuestionCard — incomplete pointer', () => {
  it('shows the incomplete message when given one', () => {
    render(<QuestionCard {...baseProps({ incompleteMessage: 'Falta una respuesta.' })} />);
    expect(screen.getByTestId('question-incomplete-s1').textContent).toBe('Falta una respuesta.');
  });

  it('shows no incomplete message by default', () => {
    render(<QuestionCard {...baseProps()} />);
    expect(screen.queryByTestId('question-incomplete-s1')).toBeNull();
  });
});
