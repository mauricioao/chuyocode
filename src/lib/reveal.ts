/**
 * reveal — scroll-triggered fade-up motion (design decision #6).
 *
 * A dependency-free scroll-reveal: elements tagged with the `.reveal` class are
 * observed with a single `IntersectionObserver`; when one scrolls into view the
 * `.revealed` class is added (the CSS in `global.css` drives the fade-up) and
 * the element is unobserved so it never re-animates. No external library, no
 * client island — `BaseLayout` runs this from an inline module script.
 *
 * Accessibility (decision #6 + spec: prefers-reduced-motion): when the user has
 * `prefers-reduced-motion: reduce`, we short-circuit entirely — every `.reveal`
 * element is marked `.revealed` immediately (content visible, zero animation)
 * and NO observer is created. The CSS media query additionally zeroes the
 * transition, so even the class flip produces no motion.
 *
 * Safe to call repeatedly (View Transitions re-run it after `astro:after-swap`):
 * already-revealed elements are skipped, and each call only observes elements
 * not yet revealed.
 */

/** Class applied to elements that should fade up on scroll. */
export const REVEAL_CLASS = 'reveal';
/** Class applied once an element has entered the viewport. */
export const REVEALED_CLASS = 'revealed';

/** Options for {@link initReveals}. */
export interface InitRevealsOptions {
  /** Observer root; defaults to the viewport (`null`). */
  root?: Element | null;
  /** Visibility ratio that triggers the reveal (0–1). Defaults to `0.1`. */
  threshold?: number;
}

/**
 * Does the current environment prefer reduced motion?
 *
 * Guards `matchMedia` so it stays safe under SSR / older jsdom where the API
 * may be missing — treated as "no reduced-motion preference" in that case.
 */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Observe every `.reveal` element and reveal it on scroll.
 *
 * - No `.reveal` elements → no-op.
 * - `prefers-reduced-motion: reduce` OR no `IntersectionObserver` support →
 *   reveal everything immediately, create no observer.
 * - Otherwise → observe each not-yet-revealed element; on intersection add
 *   `.revealed` and unobserve it.
 *
 * @param opts - Optional observer `root` / `threshold` overrides.
 */
export function initReveals(opts: InitRevealsOptions = {}): void {
  if (typeof document === 'undefined') {
    return;
  }

  const elements = Array.from(
    document.querySelectorAll<HTMLElement>(`.${REVEAL_CLASS}`),
  );
  if (elements.length === 0) {
    return;
  }

  // Reduced-motion OR no IO support → show content immediately, skip observer.
  if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
    for (const el of elements) {
      el.classList.add(REVEALED_CLASS);
    }
    return;
  }

  const observer = new IntersectionObserver(
    (entries, obs) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add(REVEALED_CLASS);
          obs.unobserve(entry.target);
        }
      }
    },
    { root: opts.root ?? null, threshold: opts.threshold ?? 0.1 },
  );

  for (const el of elements) {
    // Skip elements already revealed by a previous call (View Transitions).
    if (!el.classList.contains(REVEALED_CLASS)) {
      observer.observe(el);
    }
  }
}

/**
 * Alias for {@link initReveals} kept for call-site symmetry / naming stability.
 */
export const initReveal = initReveals;
