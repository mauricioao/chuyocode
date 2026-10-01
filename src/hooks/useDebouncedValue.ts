/**
 * useDebouncedValue — returns `value`, but only after it has stopped
 * changing for `delayMs`. First caller: the quiz editor's live preview
 * (owner build item 3), so fast typing in a question card does not re-render
 * (and reset) `QuizBlockPractice` on every keystroke.
 *
 * Pure timing, no browser-only API — `setTimeout`/`clearTimeout` exist in
 * every environment this runs in, so this needs no SSR guard and no
 * hydration-harness coverage of its own (unlike `useIsDesktop`/
 * `usePrefersReducedMotion`, which read `window`).
 */
import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
