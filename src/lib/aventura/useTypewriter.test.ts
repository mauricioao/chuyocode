// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useTypewriter, DEFAULT_SPEED_MS } from './useTypewriter';

describe('useTypewriter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts empty and reveals one character per tick', () => {
    const { result } = renderHook(() => useTypewriter('Hi!'));
    expect(result.current.displayed).toBe('');
    expect(result.current.done).toBe(false);

    act(() => vi.advanceTimersByTime(DEFAULT_SPEED_MS));
    expect(result.current.displayed).toBe('H');

    act(() => vi.advanceTimersByTime(DEFAULT_SPEED_MS));
    expect(result.current.displayed).toBe('Hi');

    act(() => vi.advanceTimersByTime(DEFAULT_SPEED_MS));
    expect(result.current.displayed).toBe('Hi!');
    expect(result.current.done).toBe(true);
  });

  it('skip() reveals the rest immediately and marks done', () => {
    const { result } = renderHook(() => useTypewriter('Hello there!'));
    act(() => vi.advanceTimersByTime(DEFAULT_SPEED_MS));
    expect(result.current.displayed).toBe('H');

    act(() => result.current.skip());
    expect(result.current.displayed).toBe('Hello there!');
    expect(result.current.done).toBe(true);

    // No further tick changes anything once skipped/done.
    act(() => vi.advanceTimersByTime(DEFAULT_SPEED_MS * 5));
    expect(result.current.displayed).toBe('Hello there!');
  });

  it('renders instantly with no interval when instant=true', () => {
    const { result } = renderHook(() => useTypewriter('Instant.', { instant: true }));
    expect(result.current.displayed).toBe('Instant.');
    expect(result.current.done).toBe(true);
  });

  it('resets and retypes when the text prop changes', () => {
    const { result, rerender } = renderHook(({ text }) => useTypewriter(text), {
      initialProps: { text: 'First' },
    });
    act(() => vi.advanceTimersByTime(DEFAULT_SPEED_MS * 5));
    expect(result.current.displayed).toBe('First');
    expect(result.current.done).toBe(true);

    rerender({ text: 'Second line' });
    expect(result.current.displayed).toBe('');
    expect(result.current.done).toBe(false);

    act(() => vi.advanceTimersByTime(DEFAULT_SPEED_MS));
    expect(result.current.displayed).toBe('S');
  });

  it('treats an empty string as immediately done', () => {
    const { result } = renderHook(() => useTypewriter(''));
    expect(result.current.displayed).toBe('');
    expect(result.current.done).toBe(true);
  });
});
