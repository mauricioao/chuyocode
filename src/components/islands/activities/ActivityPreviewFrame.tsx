/**
 * ActivityPreviewFrame — the template editor's own "exactly what the
 * student sees" viewport (owner audit, `PROPUESTA-PLANTILLAS-2026-10-23.md`
 * §c): a FIXED design viewport (1240×748 — the desk window's own content
 * box at a 1440×900 screen, title bar included) rendered at NATIVE size and
 * shrunk with `transform: scale(s)`, never with a responsive layout that
 * would make the SAME board lay out differently in the editor than it does
 * for the student. `WindowTitleBar` replicates the real desk window's own
 * chrome so the preview's frame reads exactly like the window the board
 * will actually sit inside; `ActivityStage` makes the floating Comprobar
 * (and anything else `fixed`) resolve against THIS frame's own edges.
 *
 * `s = min(paneW / 1240, paneH / 748, 1)`, measured via `ResizeObserver` on
 * the OUTER pane — never upscaled past 1:1 even in a huge pane, same
 * reasoning a photo viewer never blows a thumbnail up past its own native
 * size. The outer pane is sized to the SCALED box (`1240*s × 748*s`) so it
 * reserves exactly the right amount of room in the surrounding layout; the
 * inner viewport stays at the native 1240×748 and is only visually shrunk
 * (`transformOrigin: 'top left'`), so every pixel value inside it (the real
 * player's own layout) is computed at FULL size — pixel-identical to what
 * the student's own browser lays out — and only the paint is scaled down,
 * never the layout math itself.
 */
import { createContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import ActivityStage from './ActivityStage';
import WindowTitleBar from './WindowTitleBar';
import type { BlockBackground } from '@/lib/activities/blocks';

/** The desk window's own content box at a 1440×900 screen (content width 1240, height = window height including its 61px title bar) — see this file's own header. */
const DESIGN_WIDTH = 1240;
const DESIGN_HEIGHT = 748;

/**
 * Code-review fix: `useLayoutEffect` is a no-op (with a console warning) on
 * the server — Astro SSR has no layout to measure anyway — so this falls
 * back to plain `useEffect` there and only switches to the synchronous,
 * pre-paint version in the browser, same isomorphic-effect idiom other SSR
 * frameworks use.
 */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * `true` for every descendant of an `ActivityPreviewFrame` (owner audit
 * `PROPUESTA-PLANTILLAS-2026-10-23.md` §c) — `GameResult` reads this to make
 * its own "Otra actividad" render but stay INERT, for every mold's own
 * `GameResult` render (the four drag templates, plus this frame's own
 * `QuizLivePreview` path), without any of them needing to know they are
 * inside a preview or thread a prop down to it. `false` outside any preview
 * (every real host), which is also `GameResult`'s own default when this
 * context never wraps it at all (e.g. a unit test rendering it standalone).
 */
export const ActivityPreviewContext = createContext(false);

export interface ActivityPreviewFrameProps {
  title: string;
  levelChip?: string | null;
  /** A molded quiz block's own decorative background (`blocks.ts`'s own `BlockBackground`), threaded straight to the inner `ActivityStage`. `undefined` keeps its plain grey canvas. */
  background?: BlockBackground;
  children: ReactNode;
}

export default function ActivityPreviewFrame({ title, levelChip, background, children }: ActivityPreviewFrameProps) {
  const paneRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useIsomorphicLayoutEffect(() => {
    const pane = paneRef.current;
    if (!pane || typeof ResizeObserver === 'undefined') return undefined;

    // Synchronous first measurement, BEFORE paint (code-review fix: `scale`
    // used to start at 1 and only correct itself once ResizeObserver's own
    // first callback fired — which happens ASYNCHRONOUSLY, after the
    // browser's next layout pass — so the 1240×748 frame visibly flashed at
    // full size for one frame on every mount). `getBoundingClientRect`
    // reads the exact same box the observer itself reports; under jsdom
    // (no real layout) it comes back all-zero, so this is a no-op there —
    // the existing `ResizeObserver`-driven tests are unaffected.
    const rect = pane.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setScale(Math.min(rect.width / DESIGN_WIDTH, rect.height / DESIGN_HEIGHT, 1));
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;
      setScale(Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT, 1));
    });
    observer.observe(pane);
    return () => observer.disconnect();
  }, []);

  return (
    <div data-testid="activity-preview-pane" ref={paneRef} className="flex w-full justify-center">
      <div
        data-testid="activity-preview-frame"
        data-scale={scale}
        className="overflow-hidden"
        style={{ width: DESIGN_WIDTH * scale, height: DESIGN_HEIGHT * scale }}
      >
        <div
          style={{
            width: DESIGN_WIDTH,
            height: DESIGN_HEIGHT,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
          className="flex flex-col overflow-hidden rounded-[20px] bg-card shadow-elevation-2"
        >
          <WindowTitleBar title={title} levelChip={levelChip} />
          <ActivityPreviewContext.Provider value={true}>
            <ActivityStage className="min-h-0 flex-1" background={background}>
              {children}
            </ActivityStage>
          </ActivityPreviewContext.Provider>
        </div>
      </div>
    </div>
  );
}
