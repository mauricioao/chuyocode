// @vitest-environment jsdom
/**
 * ChoiceRenderer tests — the `choice` mechanic (multiple choice).
 *
 * Proves the renderer draws every pool item, reports the SELECTED ITEM ID (never
 * an index — the whole point of stable ids), reflects a controlled value, and
 * locks once grading has happened.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { PoolItem, Slot } from '@/lib/exercisePayload';
import ChoiceRenderer from './ChoiceRenderer';

const slot: Slot = {
  id: 's1',
  label: 'The cat ___ on the mat',
  input: 'choice',
  pool: 'opts',
  answer: ['b'],
};

const items: PoolItem[] = [
  { id: 'a', text: 'sit' },
  { id: 'b', text: 'sits' },
  { id: 'c', text: 'sitting' },
];

afterEach(cleanup);

describe('ChoiceRenderer', () => {
  it('renders the slot label and one option per pool item', () => {
    render(
      <ChoiceRenderer slot={slot} items={items} value={[]} onChange={vi.fn()} />,
    );

    expect(screen.getByText('The cat ___ on the mat')).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByText('sit')).toBeTruthy();
    expect(screen.getByText('sits')).toBeTruthy();
    expect(screen.getByText('sitting')).toBeTruthy();
  });

  it('reports the selected ITEM ID, not its position', () => {
    const onChange = vi.fn();
    render(
      <ChoiceRenderer slot={slot} items={items} value={[]} onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole('radio', { name: 'sits' }));

    expect(onChange).toHaveBeenCalledWith(['b']);
  });

  // TRIANGULATION: a different option must yield a different id, which is what
  // forces a real lookup instead of a hardcoded return.
  it('reports a different id for a different option', () => {
    const onChange = vi.fn();
    render(
      <ChoiceRenderer slot={slot} items={items} value={[]} onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole('radio', { name: 'sitting' }));

    expect(onChange).toHaveBeenCalledWith(['c']);
  });

  it('marks the controlled value as checked', () => {
    render(
      <ChoiceRenderer
        slot={slot}
        items={items}
        value={['c']}
        onChange={vi.fn()}
      />,
    );

    // `aria-checked` is the accessible STATE the learner's screen reader reads,
    // not a styling detail — asserting it is behavioural.
    expect(
      screen.getByRole('radio', { name: 'sitting' }).getAttribute('aria-checked'),
    ).toBe('true');
    expect(
      screen.getByRole('radio', { name: 'sit' }).getAttribute('aria-checked'),
    ).toBe('false');
  });

  it('locks every option once disabled', () => {
    const onChange = vi.fn();
    render(
      <ChoiceRenderer
        slot={slot}
        items={items}
        value={['b']}
        onChange={onChange}
        disabled
      />,
    );

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    for (const radio of radios) {
      expect(radio.hasAttribute('disabled')).toBe(true);
    }
    fireEvent.click(screen.getByRole('radio', { name: 'sit' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
