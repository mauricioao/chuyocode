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
      setPastThreshold(top > viewport * APPEAR_AFTER_VIEWPORTS);
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
        'z-40 inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-base-soft text-accent shadow-elevation-2 transition-all duration-200 ease-out hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none',
        scoped
          ? 'absolute right-4 bottom-4 hidden lg:inline-flex'
          : 'fixed right-4 bottom-6 lg:right-[max(1rem,calc((100vw-72rem)/2+1rem))]',
        shown ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0',
      )}
    >
      <ArrowUpIcon size={20} aria-hidden="true" />
    </button>
  );
}
