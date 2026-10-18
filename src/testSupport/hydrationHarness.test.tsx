// @vitest-environment jsdom
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { renderThenHydrate } from './hydrationHarness';

afterEach(() => {
  cleanup();
});

/**
 * Registers a `window` keydown listener on mount, removes it on unmount —
 * the exact shape `PresentationIsland`'s own global keyboard map uses
 * (`window.addEventListener('keydown', ...)` in a `useEffect` whose cleanup
 * removes it).
 */
function GlobalKeydownProbe({ onEscape }: { onEscape: () => void }) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onEscape();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onEscape]);
  return null;
}

describe('renderThenHydrate', () => {
  it('unmounts the hydrated root — no stray window listener survives for later tests', async () => {
    const onEscape = vi.fn();
    await renderThenHydrate(() => <GlobalKeydownProbe onEscape={onEscape} />);

    // If the hydrated root were never unmounted (the bug this guards
    // against), the probe's `useEffect` cleanup would never run, and this
    // listener would still be attached to the SAME `window` every later
    // test in a shared jsdom file reuses — exactly how
    // `PresentationIsland.test.tsx`'s Escape/QR-overlay assertions went
    // flaky under `--sequence.shuffle`.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(onEscape).not.toHaveBeenCalled();
  });
});
