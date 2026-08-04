/**
 * reveal — scroll-triggered fade-up motion (design decision #6).
 *
 * A dependency-free scroll-reveal: elements tagged with the `.reveal` class are
 * observed with a single `IntersectionObserver`; when one scrolls into view the
 * `.revealed` class is added (the CSS in `global.css` drives the fade-up) and
 * the element is unobserved so it never re-animates. No external library, no
 * client island — `BaseLayout` runs this from an inline module script.
 *
 * Motion policy (product decision): the fade-up ALWAYS plays — it is NOT gated
 * behind `prefers-reduced-motion`. As a real capability fallback (not a
 * preference), when `IntersectionObserver` is unavailable we reveal everything
 * immediately so content is never stuck hidden.
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
 * Observe every `.reveal` element and reveal it on scroll.
 *
 * - No `.reveal` elements → no-op.
 * - No `IntersectionObserver` support → reveal everything immediately, create no
 *   observer (capability fallback so content is never stuck hidden).
 * - Otherwise → observe each not-yet-revealed element; on intersection add
 *   `.revealed` and unobserve it.
 *
 * The reveal animation is intentionally NOT gated behind
 * `prefers-reduced-motion` (product decision — UI animations always play).
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

  // No IntersectionObserver support → show content immediately, skip observer.
  // (Capability fallback only; reduced-motion is intentionally NOT checked.)
  if (typeof IntersectionObserver === 'undefined') {
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
