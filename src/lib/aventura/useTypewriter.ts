/**
 * useTypewriter — reveals `text` one character at a time (the classic RPG
 * dialog-box effect), skippable at any point via {@link UseTypewriterResult.skip}
 * (a click on the dialog box, or Enter/Space/Z while it is still typing).
 *
 * `instant` (driven by `usePrefersReducedMotion` at the call site) renders the
 * full text immediately with no interval at all — matches the brief
 * ("skippable; reduced motion → instant").
 */
import { useEffect, useRef, useState } from 'react';

export interface UseTypewriterOptions {
  /** Milliseconds between characters. Defaults to {@link DEFAULT_SPEED_MS}. */
  speedMs?: number;
  /** Render the full text immediately, no animation — `prefers-reduced-motion`. */
  instant?: boolean;
}

export interface UseTypewriterResult {
  /** The text revealed so far (the full string once `done`). */
  displayed: string;
  /** `true` once every character has been revealed (by the timer or by `skip`). */
  done: boolean;
  /** Reveal the rest of `text` immediately. A no-op once already `done`. */
  skip: () => void;
}

export const DEFAULT_SPEED_MS = 24;

export function useTypewriter(text: string, options: UseTypewriterOptions = {}): UseTypewriterResult {
  const { speedMs = DEFAULT_SPEED_MS, instant = false } = options;
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (instant || text.length === 0) {
      setDisplayed(text);
      setDone(true);
      return undefined;
    }

    setDisplayed('');
    setDone(false);
    let i = 0;
    intervalRef.current = setInterval(() => {
      i += 1;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        setDone(true);
      }
    }, speedMs);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [text, speedMs, instant]);

  function skip() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setDisplayed(text);
    setDone(true);
  }

  return { displayed, done, skip };
}
