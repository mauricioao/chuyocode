/**
 * iconTooltip — the one shared "icon button + hover/focus tooltip" pattern
 * (practice page action-bar redesign, T2): Compartir/Duplicar/Reportar/
 * Presentar/Imprimir all became icon-only buttons, each needing a tooltip
 * that shows its label on hover AND keyboard focus. Used identically by
 * plain Astro-rendered links (`[id].astro`'s own present/print/guest-fallback
 * links) and by the React island buttons (`ShareDialog`, `DuplicateActivityButton`,
 * `ReportActivityButton`) — ONE consistent implementation for both, per the
 * owner's own requirement.
 *
 * Pure CSS (`group` + `group-hover`/`group-focus-within`), the same mechanism
 * `WorksheetPlayer`'s own speak-badge/explanation-popover already use — no JS
 * is needed to show/hide the bubble, so it works even before an island
 * hydrates (progressive enhancement, same posture as `chromeVisibility.ts`).
 *
 * ACCESSIBLE NAME: the caller ALWAYS sets `aria-label` on the trigger to the
 * same label text (never only the native `title`, which several platforms'
 * accessibility trees ignore) — this bubble is the SIGHTED affordance,
 * wired to the trigger via `aria-describedby` so a screen reader that does
 * announce descriptions is not told the same name twice two different ways.
 *
 * NEVER CLIPPED BY ITS CONTAINER: `max-w-[min(12rem,calc(100vw-2rem))]` is
 * the same "never forces horizontal scroll, even anchored near a screen
 * edge" guarantee `QuizFirstRunTip` already uses for its own anchored
 * bubble — a CSS-only guarantee, not a runtime measurement. The bubble
 * itself renders BELOW the trigger (`top-full`), inside the practice card's
 * remaining content height, never past its own clipped edges.
 */

/**
 * The trigger's own box — a ≥44px (`size-11`) touch target, matching
 * `variant="outline" size="icon-lg"` from `@/components/ui/button` (the
 * house icon-button look) wherever a caller renders a plain element instead
 * of that shared component. `group` + `relative` are load-bearing: the
 * bubble below anchors to, and reveals on hover/focus of, exactly this
 * element.
 *
 * PART 6a phone layout fix (owner spec 2026-10-06): every caller of this
 * class lives in the practice page's own window title bar, which has no
 * room for six 44px squares below the `desk:` breakpoint — `size-9` (36px)
 * there, back to the full `size-11` touch target at `desk:` and up where
 * the title bar has the width to spare. The narrower size is a deliberate,
 * scoped trade against the usual ≥44px touch-target guideline (every
 * trigger still carries its own tooltip + `aria-label`, so the ACCESSIBLE
 * NAME never shrinks, only the hit box).
 */
export const ICON_TOOLTIP_TRIGGER_CLASS =
  'group relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 desk:size-11';

/** The tooltip bubble itself — a sibling/child of the trigger, shown via `group-hover`/`group-focus-within` (never `group-focus`, which would skip touch/click focus-without-:focus-visible-support edge cases this codebase already favors elsewhere — see `WorksheetPlayer`'s own explanation popover). */
export const ICON_TOOLTIP_BUBBLE_CLASS =
  'pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-max max-w-[min(12rem,calc(100vw-2rem))] -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-xs whitespace-nowrap text-background opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100';
