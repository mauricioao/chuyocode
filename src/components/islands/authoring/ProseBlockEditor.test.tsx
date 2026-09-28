// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ProseBlock } from '@/lib/exercisePayload';
import ProseBlockEditor from './ProseBlockEditor';

afterEach(cleanup);

const BLOCK: ProseBlock = { kind: 'prose', id: 'p1', text: 'hello' };

describe('ProseBlockEditor', () => {
  it('shows the current text', () => {
    render(<ProseBlockEditor block={BLOCK} lang="en" onChange={vi.fn()} onRemove={vi.fn()} />);
    expect((screen.getByTestId('prose-text-p1') as HTMLTextAreaElement).value).toBe('hello');
  });

  it('reports every edit', () => {
    const onChange = vi.fn();
    render(<ProseBlockEditor block={BLOCK} lang="en" onChange={onChange} onRemove={vi.fn()} />);
    fireEvent.change(screen.getByTestId('prose-text-p1'), { target: { value: 'updated' } });
    expect(onChange).toHaveBeenCalledWith('updated');
  });

  it('calls onRemove when the remove control is pressed', () => {
    const onRemove = vi.fn();
    render(<ProseBlockEditor block={BLOCK} lang="en" onChange={vi.fn()} onRemove={onRemove} />);
    fireEvent.click(screen.getByTestId('remove-block-p1'));
    expect(onRemove).toHaveBeenCalled();
  });
});
