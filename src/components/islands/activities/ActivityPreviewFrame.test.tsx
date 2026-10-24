// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import ActivityPreviewFrame from './ActivityPreviewFrame';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** jsdom has no real `ResizeObserver` — this fake captures the callback so a test can fire it manually with a fake pane size, the same technique a real browser's own resize would trigger. */
function stubResizeObserver(): { fire: (width: number, height: number) => void } {
  let capturedCallback: ResizeObserverCallback | null = null;
  class FakeResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      capturedCallback = callback;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  return {
    fire: (width: number, height: number) => {
      act(() => {
        capturedCallback?.(
          [{ contentRect: { width, height } } as unknown as ResizeObserverEntry],
          null as unknown as ResizeObserver,
        );
      });
    },
  };
}

describe('ActivityPreviewFrame', () => {
  it('renders the title and level badge via WindowTitleBar', () => {
    render(
      <ActivityPreviewFrame title="Verbos irregulares" levelChip="Básico A2">
        <p data-testid="board">board</p>
      </ActivityPreviewFrame>,
    );
    expect(screen.getByTestId('window-title-bar-title').textContent).toBe('Verbos irregulares');
    expect(screen.getByTestId('window-title-bar-level').textContent).toBe('Básico A2');
  });

  it('renders the real board content inside its own activity-stage', () => {
    render(
      <ActivityPreviewFrame title="Verbos irregulares">
        <p data-testid="board">board</p>
      </ActivityPreviewFrame>,
    );
    const stage = screen.getByTestId('activity-stage');
    expect(stage.contains(screen.getByTestId('board'))).toBe(true);
  });

  it('starts at scale 1 with no ResizeObserver available (graceful fallback)', () => {
    render(
      <ActivityPreviewFrame title="Verbos irregulares">
        <p>board</p>
      </ActivityPreviewFrame>,
    );
    expect(screen.getByTestId('activity-preview-frame').getAttribute('data-scale')).toBe('1');
  });

  it('scales down from the pane size, never past 1:1, once the pane is measured', () => {
    const ro = stubResizeObserver();
    render(
      <ActivityPreviewFrame title="Verbos irregulares">
        <p>board</p>
      </ActivityPreviewFrame>,
    );

    // Pane is exactly half the design viewport on both axes -> scale 0.5.
    ro.fire(620, 374);
    expect(screen.getByTestId('activity-preview-frame').getAttribute('data-scale')).toBe('0.5');

    // A pane bigger than the design viewport never upscales past 1.
    ro.fire(4000, 4000);
    expect(screen.getByTestId('activity-preview-frame').getAttribute('data-scale')).toBe('1');
  });

  it('paints the given background behind its content, via the inner ActivityStage', () => {
    render(
      <ActivityPreviewFrame title="Verbos irregulares" background={{ kind: 'preset', preset: 'lavender' }}>
        <p>board</p>
      </ActivityPreviewFrame>,
    );
    expect(screen.getByTestId('activity-stage-backdrop-preset').style.background).toContain('var(--backdrop-lavender)');
  });

  it('scales by whichever axis is tighter', () => {
    const ro = stubResizeObserver();
    render(
      <ActivityPreviewFrame title="Verbos irregulares">
        <p>board</p>
      </ActivityPreviewFrame>,
    );
    // Width allows 1:1 (1240), height only allows 0.25 (187 / 748) -> 0.25 wins.
    ro.fire(1240, 187);
    expect(screen.getByTestId('activity-preview-frame').getAttribute('data-scale')).toBe('0.25');
  });
});
