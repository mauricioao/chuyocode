/**
 * ScrollToTop — floating "back to top" button.
 *
 * TWO MODES, one component (reused per the task's own "reuse the island with
 * a targetRef prop" instruction):
 *  - GLOBAL (no `targetRef`): mounted once in `BaseLayout.astro`, `client:load`
 *    like `UserMenu` (always-relevant chrome). Tracks WINDOW scroll, is
 *    `fixed` to the viewport, and horizontally aligns to the site's content
 *    container edge (`max-w-6xl`, same width `Footer.astro` uses) rather than
 *    the bare viewport edge on wide screens — a `right` value computed with
 *    `max()`/`calc()` so no extra wrapper element is needed. It also watches
 *    the `<footer>` with an `IntersectionObserver` and hides itself the
 *    moment the footer becomes visible, so it can never sit on top of it.
 *  - SCOPED (`targetRef` given): used inside the activity editor for its own
 *    block-list scroll container. Tracks that container's OWN scroll instead
 *    of the window, is `absolute` (the caller provides a `relative`
 *    ancestor — the editor card), and skips the footer/window logic
 *    entirely, since it never leaves that card.
 *
 * GLASS FLOATING (PR 1, premium design system): translucent blurred surface
 * (`.glass-floating`, global.css) + hairline ring + `--shadow-floating`
 * lift, accent-colored icon — same treatment as `BackButton.astro`,
 * superseding the earlier solid brand-yellow fill. A thin circular progress
 * ring (SVG `stroke-dashoffset`, geometry in `@lib/scrollProgress`) is drawn
 * behind the icon, filling in as the tracked scroll source (window or
 * `targetRef`'s container) approaches its end.
 *
 * SCOPED MODE'S "NEVER APPEARS" BUG, FIXED: the appear threshold used to be
 * ONLY `container height * APPEAR_AFTER_VIEWPORTS` (a full container height
 * of scroll). That is a reasonable page-level threshold, but the editor
 * card's block-list container is comfortably taller than a phone screen and
 * nowhere near a full page — requiring a FULL container height of scroll
 * before showing it meant, in ordinary use, it essentially never appeared.
 * `APPEAR_AFTER_MAX_PX` below caps the threshold at ~300px too (owner
 * feedback: "~1 container height or 300px scrolled, whichever is smaller"),
 * which is what actually makes it show up for a normally-sized block list.
 * The OTHER half of "never appears" in the editor was a wrong `targetRef` —
 * see `ActivityEditorIsland.tsx`'s own header for that half of the fix.
 *
 * Motion: the appear/disappear transition is CSS (opacity + a small
 * translate, ~200ms), gated behind `motion-reduce:` — read at RENDER time
 * only through the CSS variant, never `window.matchMedia` during render
 * (see `ExerciseIsland.tsx`'s header for the SSR/client mismatch that
 * pattern caused once already in this codebase). The CLICK handler is
 * different: `prefers-reduced-motion` is safe to read there because it only
 * ever runs after a user gesture, never during SSR or the first render.
 */
import { useCallback, useEffect, useState, type RefObject } from 'react';
import { ArrowUpIcon } from '@phosphor-icons/react/dist/ssr/ArrowUp';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { computeScrollProgress, ringDashOffset } from '@/lib/scrollProgress';

/** Progress-ring geometry: radius + stroke chosen to sit just inside the
 * 44px (`size-11`) circular button without touching its edge. */
const RING_RADIUS = 18;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export interface ScrollToTopProps {
  lang: Lang;
  /**
   * Ref to a scrollable container to scope this button to (e.g. the
   * activity editor's block list). When omitted, the button tracks WINDOW
   * scroll and floats fixed to the viewport instead.
   */
  targetRef?: RefObject<HTMLElement | null>;
}

/** How many container/viewport heights of scroll before the button appears. */
const APPEAR_AFTER_VIEWPORTS = 1;

/**
 * The largest scroll-distance threshold before the button appears, in
 * pixels (nav buttons pass, owner feedback: "use ~1 container height or
 * 300px scrolled, whichever is smaller"). Load-bearing for the SCOPED mode:
 * the editor card's block-list container is comfortably taller than 300px
 * but nowhere near as tall as a full page, so requiring a full container
 * height of scroll (`APPEAR_AFTER_VIEWPORTS` alone) before showing it meant
 * it practically never appeared during ordinary use — this caps the
 * threshold instead of only scaling it.
 */
const APPEAR_AFTER_MAX_PX = 300;

/** Read only at CLICK time — see the file header for why never at render time. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export default function ScrollToTop({ lang, targetRef }: ScrollToTopProps) {
  const label = UI_LABELS[lang].common.scrollToTop;
  const scoped = Boolean(targetRef);

  const [pastThreshold, setPastThreshold] = useState(false);
  const [progress, setProgress] = useState(0);
  // Always true in scoped mode — there is no footer to hide behind inside
  // the editor card, so it never suppresses visibility there.
  const [footerHidden, setFooterHidden] = useState(true);

  useEffect(() => {
    const scrollEl = targetRef?.current ?? null;
    const scrollSource: { addEventListener: Window['addEventListener']; removeEventListener: Window['removeEventListener'] } =
      scrollEl ?? window;

    function measure() {
      const top = scrollEl ? scrollEl.scrollTop : window.scrollY;
      const viewport = scrollEl ? scrollEl.clientHeight : window.innerHeight;
      const full = scrollEl ? scrollEl.scrollHeight : document.documentElement.scrollHeight;
      const threshold = Math.min(APPEAR_AFTER_MAX_PX, viewport * APPEAR_AFTER_VIEWPORTS);
      setPastThreshold(top > threshold);
      setProgress(computeScrollProgress(top, viewport, full));
    }

    measure();
    scrollSource.addEventListener('scroll', measure, { passive: true });
    return () => scrollSource.removeEventListener('scroll', measure);
  }, [targetRef]);

  useEffect(() => {
    if (scoped) return undefined;
    if (typeof document === 'undefined' || typeof IntersectionObserver === 'undefined') {
      return undefined;
    }
    const footer = document.querySelector('footer');
    if (!footer) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setFooterHidden(!entry.isIntersecting);
        }
      },
      { threshold: 0 },
    );
    observer.observe(footer);
    return () => observer.disconnect();
  }, [scoped]);

  const handleClick = useCallback(() => {
    const behavior: ScrollBehavior = prefersReducedMotion() ? 'auto' : 'smooth';
    const scrollEl = targetRef?.current;
    if (scrollEl) {
      scrollEl.scrollTo({ top: 0, behavior });
    } else {
      window.scrollTo({ top: 0, behavior });
    }
  }, [targetRef]);

  const shown = pastThreshold && footerHidden;

  return (
    <button
      type="button"
      data-testid={scoped ? 'scroll-to-top-scoped' : 'scroll-to-top'}
      onClick={handleClick}
      aria-label={label}
      title={label}
      aria-hidden={!shown}
      tabIndex={shown ? 0 : -1}
      className={cn(
        'glass-floating relative z-40 inline-flex h-11 w-11 items-center justify-center rounded-(--radius-pill) text-accent ring-1 ring-white/10 shadow-(--shadow-floating) transition-all duration-(--transition-duration-control) ease-(--ease-control)',
        'hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_rgb(250_204_21/0.4),0_8px_24px_-6px_rgb(250_204_21/0.35)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        scoped
          ? 'absolute right-4 bottom-4 hidden lg:inline-flex'
          : 'fixed right-4 bottom-6 lg:right-[max(1rem,calc((100vw-72rem)/2+1rem))]',
        shown ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0',
      )}
    >
      <svg
        className="pointer-events-none absolute inset-0 -rotate-90"
        viewBox="0 0 40 40"
        aria-hidden="true"
      >
        <circle
          cx={20}
          cy={20}
          r={RING_RADIUS}
          strokeWidth={2}
          className="fill-none stroke-white/15"
        />
        <circle
          data-testid={scoped ? 'scroll-progress-ring-scoped' : 'scroll-progress-ring'}
          cx={20}
          cy={20}
          r={RING_RADIUS}
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={ringDashOffset(progress, RING_RADIUS)}
          className="fill-none stroke-accent transition-[stroke-dashoffset] duration-200 ease-out motion-reduce:transition-none"
        />
      </svg>
      <ArrowUpIcon size={20} weight="bold" aria-hidden="true" />
    </button>
  );
}
