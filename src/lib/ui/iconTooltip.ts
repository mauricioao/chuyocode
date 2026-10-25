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
 * The trigger's own box — a flat 36px (`size-9`) touch target at every
 * width, the same dimensions as `variant="outline" size="icon-lg"` from
 * `@/components/ui/button` (also `size-9` there — see that file's own
 * `size` variants). This trigger just cannot BE that shared component
 * wherever a caller renders a plain `<a>`/`<button>`/`<label>` acting as a
 * button instead (every consumer here is one of those, not a real
 * `<Button>`). `group` + `relative` are load-bearing: the bubble below
 * anchors to, and reveals on hover/focus of, exactly this element.
 *
 * T2 titlebar polish (owner report, 2026-10-25: "quita los bordes de esos
 * íconos; no aportan nada salvo hacer más alta la barra superior"): this
 * used to step UP to `desk:size-11` (44px) at the `desk:` breakpoint and up
 * (PART 6a phone layout fix, 2026-10-06) — the owner's own report is a
 * request to shrink the bar, not just the phone layout, so 36px is now the
 * floor everywhere, not only below `desk:`. Still below the usual ≥44px
 * touch-target guideline, same deliberate, scoped trade as before (every
 * trigger still carries its own tooltip + `aria-label`, so the ACCESSIBLE
 * NAME never shrinks, only the hit box).
 *
 * `border border-transparent` (not `border-border`): the `border` utility
 * stays, so the box model never shifts on focus, but it paints nothing at
 * rest — the visible square around every icon button added height and
 * visual weight the owner never asked for. `focus-visible:border-ring`
 * still shows a real, meaningful border on keyboard focus.
 */
export const ICON_TOOLTIP_TRIGGER_CLASS =
  'group relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-transparent bg-background text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

/** The tooltip bubble itself — a sibling/child of the trigger, shown via `group-hover`/`group-focus-within` (never `group-focus`, which would skip touch/click focus-without-:focus-visible-support edge cases this codebase already favors elsewhere — see `WorksheetPlayer`'s own explanation popover). */
export const ICON_TOOLTIP_BUBBLE_CLASS =
  'pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-max max-w-[min(12rem,calc(100vw-2rem))] -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-xs whitespace-nowrap text-background opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100';

/**
 * MENU_ITEM_CLASS — the practice window's own "Más" overflow menu row (N6
 * follow-up, 2026-10-12 owner report: the menu's icon-only buttons carried
 * no visible text at all, just a hover tooltip — unusable on a touch
 * device with no hover). Every entry inside that menu (Imprimir, Duplicar,
 * Reportar always; Compartir/Presentar below the `sm` breakpoint too, see
 * `[id].astro`'s own header) uses this instead of
 * {@link ICON_TOOLTIP_TRIGGER_CLASS} — icon + an ALWAYS-visible text
 * label, left-aligned, full width, >=44px tall (`min-h-11`) so it reads as
 * one ordinary vertical menu list rather than a row of icon tiles. No
 * tooltip bubble needed alongside it (the label is already visible, so a
 * redundant hover echo would just be noise).
 */
export const MENU_ITEM_CLASS =
  'group relative flex min-h-11 w-full items-center justify-start gap-3 rounded-md px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';
