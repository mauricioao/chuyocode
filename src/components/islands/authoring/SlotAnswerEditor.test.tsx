// @vitest-environment jsdom
/**
 * SlotAnswerEditor — task 16.1: per-mechanic (choice/select/text/drop)
 * answer and pool editors render the correct controls for that mechanic.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { PoolItem, Slot } from '@/lib/exercisePayload';
import SlotAnswerEditor from './SlotAnswerEditor';

afterEach(cleanup);

function baseProps(overrides: Partial<Parameters<typeof SlotAnswerEditor>[0]> = {}) {
  return {
    slot: { id: 's1', label: 'x', input: 'text', answer: [] } as Slot,
    lang: 'en',
    poolItems: [] as PoolItem[],
    poolNames: [] as string[],
    onMechanicChange: vi.fn(),
    onPoolNameChange: vi.fn(),
    onAnswerChange: vi.fn(),
    onAddPoolItem: vi.fn(),
    onRemovePoolItem: vi.fn(),
    onSetPoolItemText: vi.fn(),
    onSetPoolItemMedia: vi.fn(),
    ...overrides,
  };
}

describe('SlotAnswerEditor — text mechanic', () => {
  it('renders literal accepted-answer inputs, no pool editor', () => {
    const slot: Slot = { id: 's1', label: 'x', input: 'text', answer: ['sits', 'is sitting'] };
    render(<SlotAnswerEditor {...baseProps({ slot })} />);

    expect(screen.getByTestId('text-answer-s1-0')).toBeTruthy();
    expect(screen.getByTestId('text-answer-s1-1')).toBeTruthy();
    expect(screen.queryByTestId(`pool-editor-s1`)).toBeNull();
  });

  it('editing one answer reports the whole updated array', () => {
    const onAnswerChange = vi.fn();
    const slot: Slot = { id: 's1', label: 'x', input: 'text', answer: ['sits'] };
    render(<SlotAnswerEditor {...baseProps({ slot, onAnswerChange })} />);

    fireEvent.change(screen.getByTestId('text-answer-s1-0'), { target: { value: 'sit' } });
    expect(onAnswerChange).toHaveBeenCalledWith(['sit']);
  });

  it('adding an answer appends an empty string', () => {
    const onAnswerChange = vi.fn();
    const slot: Slot = { id: 's1', label: 'x', input: 'text', answer: ['sits'] };
    render(<SlotAnswerEditor {...baseProps({ slot, onAnswerChange })} />);

    fireEvent.click(screen.getByTestId('add-text-answer-s1'));
    expect(onAnswerChange).toHaveBeenCalledWith(['sits', '']);
  });
});

describe.each(['choice', 'select', 'drop'] as const)('SlotAnswerEditor — %s mechanic', (mechanic) => {
  it('renders the pool editor, not the text-answers editor', () => {
    const slot: Slot = { id: 's1', label: 'x', input: mechanic, pool: 'opts', answer: ['a'] };
    render(<SlotAnswerEditor {...baseProps({ slot })} />);

    expect(screen.getByTestId('pool-editor-s1')).toBeTruthy();
    expect(screen.queryByTestId('text-answers-s1')).toBeNull();
  });

  it('shows a pool-name prompt until a name is set, and pool items once it is', () => {
    const slot: Slot = { id: 's1', label: 'x', input: mechanic, pool: 'opts', answer: ['a'] };
    const items: PoolItem[] = [{ id: 'a', text: 'sit' }, { id: 'b', text: 'sits' }];
    render(<SlotAnswerEditor {...baseProps({ slot, poolItems: items })} />);

    expect(screen.getByTestId('pool-items-s1')).toBeTruthy();
    expect(screen.getByTestId('pool-item-text-s1-a')).toBeTruthy();
    expect(screen.getByTestId('pool-item-text-s1-b')).toBeTruthy();
  });

  it('marks the current answer id as the selected correct-answer radio', () => {
    const slot: Slot = { id: 's1', label: 'x', input: mechanic, pool: 'opts', answer: ['b'] };
    const items: PoolItem[] = [{ id: 'a', text: 'sit' }, { id: 'b', text: 'sits' }];
    render(<SlotAnswerEditor {...baseProps({ slot, poolItems: items })} />);

    expect((screen.getByTestId('pool-item-correct-s1-b') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId('pool-item-correct-s1-a') as HTMLInputElement).checked).toBe(false);
  });

  it('picking a different correct answer reports that item id alone', () => {
    const onAnswerChange = vi.fn();
    const slot: Slot = { id: 's1', label: 'x', input: mechanic, pool: 'opts', answer: ['a'] };
    const items: PoolItem[] = [{ id: 'a', text: 'sit' }, { id: 'b', text: 'sits' }];
    render(<SlotAnswerEditor {...baseProps({ slot, poolItems: items, onAnswerChange })} />);

    fireEvent.click(screen.getByTestId('pool-item-correct-s1-b'));
    expect(onAnswerChange).toHaveBeenCalledWith(['b']);
  });
});

describe('SlotAnswerEditor — mechanic switching', () => {
  it('reports a new mechanic choice', () => {
    const onMechanicChange = vi.fn();
    render(<SlotAnswerEditor {...baseProps({ onMechanicChange })} />);

    fireEvent.change(screen.getByTestId('mechanic-select-s1'), { target: { value: 'choice' } });
    expect(onMechanicChange).toHaveBeenCalledWith('choice');
  });

  it('needs a pool name before it will add an option', () => {
    const onAddPoolItem = vi.fn();
    const slot: Slot = { id: 's1', label: 'x', input: 'choice', answer: [] };
    render(<SlotAnswerEditor {...baseProps({ slot, onAddPoolItem })} />);

    expect(screen.getByText(/type a pool name/i)).toBeTruthy();
    expect(screen.queryByTestId('add-pool-item-s1')).toBeNull();

    fireEvent.change(screen.getByTestId('pool-name-s1'), { target: { value: 'opts' } });
    fireEvent.click(screen.getByTestId('add-pool-item-s1'));
    expect(onAddPoolItem).toHaveBeenCalledWith('');
  });
});
