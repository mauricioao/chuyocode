// @vitest-environment jsdom
/**
 * RowBlockEditor — task 15.3: typing `___` in the sentence textarea
 * produces live gap feedback with no reload or explicit "parse" action.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Slot } from '@/lib/exercisePayload';
import RowBlockEditor from './RowBlockEditor';

afterEach(cleanup);

const SLOT: Slot = { id: 's1', label: '', input: 'text', answer: [] };

describe('RowBlockEditor', () => {
  it('shows "no gap" feedback while the sentence has no blank', () => {
    render(
      <RowBlockEditor slot={SLOT} lang="en" onLabelChange={vi.fn()} onRemove={vi.fn()} />,
    );

    fireEvent.change(screen.getByTestId('row-label-s1'), {
      target: { value: 'The cat sits on the mat' },
    });

    expect(screen.getByTestId('row-gap-preview-s1').textContent).toMatch(/no blank detected/i);
  });

  it('reflects a typed gap LIVE, with no reload or separate parse step', () => {
    const onLabelChange = vi.fn();
    render(
      <RowBlockEditor slot={SLOT} lang="en" onLabelChange={onLabelChange} onRemove={vi.fn()} />,
    );

    fireEvent.change(screen.getByTestId('row-label-s1'), {
      target: { value: 'The cat ___ on the mat' },
    });

    const preview = screen.getByTestId('row-gap-preview-s1').textContent ?? '';
    expect(preview).toContain('The cat');
    expect(preview).toContain('on the mat');
    expect(onLabelChange).toHaveBeenCalledWith('The cat ___ on the mat');
  });

  it('updates the live preview again as more text is typed after the gap', () => {
    render(<RowBlockEditor slot={SLOT} lang="en" onLabelChange={vi.fn()} onRemove={vi.fn()} />);

    const textarea = screen.getByTestId('row-label-s1');
    fireEvent.change(textarea, { target: { value: 'The cat ___' } });
    fireEvent.change(textarea, { target: { value: 'The cat ___ on the mat' } });

    expect(screen.getByTestId('row-gap-preview-s1').textContent).toContain('on the mat');
  });

  it('renders in Spanish when lang="es"', () => {
    render(<RowBlockEditor slot={SLOT} lang="es" onLabelChange={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText(/enunciado/i)).toBeTruthy();
  });

  it('calls onRemove when the remove control is pressed', () => {
    const onRemove = vi.fn();
    render(<RowBlockEditor slot={SLOT} lang="en" onLabelChange={vi.fn()} onRemove={onRemove} />);
    fireEvent.click(screen.getByTestId('remove-row-s1'));
    expect(onRemove).toHaveBeenCalled();
  });
});
