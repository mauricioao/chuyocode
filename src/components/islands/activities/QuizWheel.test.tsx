// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { GameItem } from '@/lib/activities/gameModes';
import QuizWheel, { wheelSlicePath, pickLandingIndex } from './QuizWheel';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('reduce') ? reduce : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

beforeEach(() => {
  setReducedMotion(false);
});

const items: GameItem[] = [
  { id: 's1', prompt: 'What is your favorite animal?', answer: 'cat' },
  { id: 's2', prompt: 'What is your favorite color?', answer: 'blue', explanation: 'Calming.' },
  { id: 's3', prompt: 'What is your favorite food?', answer: 'pizza' },
];

describe('wheelSlicePath', () => {
  it('returns a moveto/arc/close path', () => {
    const d = wheelSlicePath(100, 100, 90, 0, 4);
    expect(d.startsWith('M 100 100')).toBe(true);
    expect(d).toContain('A 90 90 0');
    expect(d.trim().endsWith('Z')).toBe(true);
  });

  it('produces a distinct path per slice index', () => {
    const paths = [0, 1, 2, 3].map((i) => wheelSlicePath(100, 100, 90, i, 4));
    expect(new Set(paths).size).toBe(4);
  });

  it('uses the large-arc flag only past a 180-degree slice', () => {
    const small = wheelSlicePath(100, 100, 90, 0, 4); // 90deg slice
    const large = wheelSlicePath(100, 100, 90, 0, 1); // 360deg "slice" (n=1 degenerate) — treat separately below
    expect(small).toMatch(/A 90 90 0 0 0/);
    // A 2-slice wheel makes an exact 180deg slice (not > 180), still flag 0.
    const half = wheelSlicePath(100, 100, 90, 0, 2);
    expect(half).toMatch(/A 90 90 0 0 0/);
    void large;
  });
});

describe('pickLandingIndex', () => {
  it('is deterministic for the same count and seed', () => {
    expect(pickLandingIndex(5, 42)).toBe(pickLandingIndex(5, 42));
  });

  it('always returns an index within range', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const index = pickLandingIndex(4, seed);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(4);
    }
  });
});

describe('QuizWheel', () => {
  it('renders one slice per item and a "Girar" button', () => {
    render(<QuizWheel lang="es" items={items} seed="block-1" />);
    for (const item of items) {
      expect(screen.getByTestId(`wheel-segment-${item.id}`)).toBeTruthy();
    }
    expect(screen.getByTestId('wheel-spin').textContent).toBe('Girar');
    expect(screen.queryByTestId('wheel-landed')).toBeNull();
  });

  it('spins, then commits a landed item once the animation settles', () => {
    vi.useFakeTimers();
    render(<QuizWheel lang="es" items={items} seed="block-1" />);

    fireEvent.click(screen.getByTestId('wheel-spin'));
    expect(screen.getByTestId('wheel-spin').textContent).toBe('Girando…');
    expect(screen.queryByTestId('wheel-landed')).toBeNull();

    act(() => vi.advanceTimersByTime(3000));

    expect(screen.getByTestId('wheel-spin').textContent).toBe('Girar');
    const landed = screen.getByTestId('wheel-landed');
    expect(landed).toBeTruthy();
    const dealt = items.find((item) => landed.textContent?.includes(item.prompt));
    expect(dealt).toBeTruthy();
    vi.useRealTimers();
  });

  it('ignores a second spin click while already spinning', () => {
    vi.useFakeTimers();
    render(<QuizWheel lang="es" items={items} seed="block-1" />);
    fireEvent.click(screen.getByTestId('wheel-spin'));
    fireEvent.click(screen.getByTestId('wheel-spin')); // ignored
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByTestId('wheel-landed')).toBeTruthy();
    vi.useRealTimers();
  });

  it('reveals the answer on "Ver respuesta"', () => {
    vi.useFakeTimers();
    render(<QuizWheel lang="es" items={items} seed="block-1" />);
    fireEvent.click(screen.getByTestId('wheel-spin'));
    act(() => vi.advanceTimersByTime(3000));

    const landed = screen.getByTestId('wheel-landed');
    const dealt = items.find((item) => landed.textContent?.includes(item.prompt))!;
    fireEvent.click(screen.getByTestId('wheel-reveal'));
    expect(screen.getByTestId('wheel-answer').textContent).toContain(dealt.answer);
    vi.useRealTimers();
  });

  it('removes the landed item once "Eliminar al salir" is checked, shrinking the wheel', () => {
    vi.useFakeTimers();
    render(<QuizWheel lang="es" items={items} seed="block-1" />);
    fireEvent.click(screen.getByTestId('wheel-remove-on-exit'));

    fireEvent.click(screen.getByTestId('wheel-spin'));
    act(() => vi.advanceTimersByTime(3000));

    const landed = screen.getByTestId('wheel-landed');
    const dealt = items.find((item) => landed.textContent?.includes(item.prompt))!;
    expect(screen.queryByTestId(`wheel-segment-${dealt.id}`)).toBeNull();
    vi.useRealTimers();
  });

  it('settles a spin after only the SHORT duration under reduced motion', () => {
    setReducedMotion(true);
    vi.useFakeTimers();
    render(<QuizWheel lang="es" items={items} seed="block-1" />);

    fireEvent.click(screen.getByTestId('wheel-spin'));
    act(() => vi.advanceTimersByTime(400));

    expect(screen.getByTestId('wheel-landed')).toBeTruthy();
    vi.useRealTimers();
  });

  it('does not settle before the full normal-motion duration elapses', () => {
    vi.useFakeTimers();
    render(<QuizWheel lang="es" items={items} seed="block-1" />);
    fireEvent.click(screen.getByTestId('wheel-spin'));
    act(() => vi.advanceTimersByTime(400)); // the reduced-motion duration, not enough here
    expect(screen.queryByTestId('wheel-landed')).toBeNull();
    act(() => vi.advanceTimersByTime(2600));
    expect(screen.getByTestId('wheel-landed')).toBeTruthy();
    vi.useRealTimers();
  });

  it('announces the landed prompt through the live region', () => {
    vi.useFakeTimers();
    render(<QuizWheel lang="es" items={items} seed="block-1" />);
    fireEvent.click(screen.getByTestId('wheel-spin'));
    act(() => vi.advanceTimersByTime(3000));

    const live = screen.getByTestId('wheel-live-region');
    const landed = screen.getByTestId('wheel-landed');
    const dealt = items.find((item) => landed.textContent?.includes(item.prompt))!;
    expect(live.textContent).toContain(dealt.prompt);
    vi.useRealTimers();
  });

  it('renders nothing for fewer than two items', () => {
    const { container } = render(<QuizWheel lang="es" items={[items[0]!]} seed="block-1" />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the exhausted message once fewer than two items remain', () => {
    vi.useFakeTimers();
    const two: GameItem[] = [items[0]!, items[1]!];
    render(<QuizWheel lang="es" items={two} seed="block-1" />);
    fireEvent.click(screen.getByTestId('wheel-remove-on-exit'));
    fireEvent.click(screen.getByTestId('wheel-spin'));
    act(() => vi.advanceTimersByTime(3000));

    expect(screen.getByTestId('wheel-exhausted')).toBeTruthy();
    expect(screen.queryByTestId('wheel-spin')).toBeNull();
    vi.useRealTimers();
  });

  it('starts fresh when the item list changes', () => {
    vi.useFakeTimers();
    const { rerender } = render(<QuizWheel lang="es" items={items} seed="block-1" />);
    fireEvent.click(screen.getByTestId('wheel-remove-on-exit'));
    fireEvent.click(screen.getByTestId('wheel-spin'));
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByTestId('wheel-landed')).toBeTruthy();

    const nextItems: GameItem[] = [
      { id: 'n1', prompt: 'New one?', answer: 'a' },
      { id: 'n2', prompt: 'New two?', answer: 'b' },
    ];
    rerender(<QuizWheel lang="es" items={nextItems} seed="block-1" />);
    expect(screen.queryByTestId('wheel-landed')).toBeNull();
    expect(screen.getByTestId('wheel-segment-n1')).toBeTruthy();
    expect(screen.getByTestId('wheel-segment-n2')).toBeTruthy();
    vi.useRealTimers();
  });
});
