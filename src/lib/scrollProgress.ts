/**
 * scrollProgress — pure math behind `ScrollToTop`'s circular progress ring.
 *
 * Split out from the component so the geometry is directly unit-testable
 * (node project, no jsdom/SVG rendering needed) instead of only ever being
 * exercised through a rendered `<circle>`'s attributes.
 */

/**
 * How far `top` is through the scrollable range `[0, full - viewport]`, as a
 * percentage (0-100). Both `ScrollToTop`'s modes reduce to this same
 * top/viewport/full triple — window scroll (`scrollY`/`innerHeight`/
 * `document.documentElement.scrollHeight`) and a scoped container's own
 * `scrollTop`/`clientHeight`/`scrollHeight`.
 */
export function computeScrollProgress(top: number, viewport: number, full: number): number {
  const maxScroll = Math.max(full - viewport, 0);
  if (maxScroll <= 0) return 0;
  return Math.min(100, Math.max(0, (top / maxScroll) * 100));
}

/**
 * `stroke-dashoffset` for an SVG circle of the given `radius` at
 * `progress` percent (0 = ring is entirely "unfilled" via the dash offset;
 * 100 = fully filled, offset 0). Pair with `stroke-dasharray={circumference}`.
 */
export function ringDashOffset(progress: number, radius: number): number {
  const circumference = 2 * Math.PI * radius;
  return circumference - (Math.min(100, Math.max(0, progress)) / 100) * circumference;
}
