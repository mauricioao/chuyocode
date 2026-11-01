/**
 * Small, reversible on/off switches for activity creation and discovery.
 * Each flag cites the owner decision that turned it off; re-enabling is a
 * one-line change back to `true`.
 */

/**
 * Owner decision (2026-10-19): "Varios juegos" serves too many purposes and
 * will get out of hand — polish activity types one at a time, starting by
 * hiding this one. While `false`:
 *  - nobody can CREATE a new "Varios juegos" activity (the `/crear` start
 *    picker and the empty-activity "add block" picker both drop the
 *    "questions" card — `BlockTypePicker.tsx`), and converting an existing
 *    activity INTO "Varios juegos" via "Cambiar molde" is not offered
 *    (`templateConversion.ts`'s `conversionOptions`);
 *  - existing "Varios juegos" activities stop being LISTED in public
 *    discovery (community list, "Para ti hoy", folder counts —
 *    `activities.ts`), but stay reachable by direct link, editable by their
 *    author, and visible to moderation.
 */
export const VARIOS_JUEGOS_ENABLED = false;

/**
 * Owner decision (2026-10-19 follow-up): "vamos primero por el único
 * propósito" — each activity keeps the single mold it was created with, for
 * now. While `false`, no editor renders the "Cambiar de molde" trigger
 * (`QuizBlockEditor.tsx`'s `SheetHeader` action); `ChangeMoldDialog.tsx` and
 * `templateConversion.ts`'s conversion logic stay intact and unit-tested,
 * just unreachable from the UI.
 */
export const CHANGE_MOLD_ENABLED = false;

/**
 * Owner decision (2026-10-31): the presentation icon stays hidden for now.
 * While `false`:
 *  - the practice page's title-bar "Presentar" icon link
 *    (`[id].astro`'s `data-testid="activity-present-link"`, `sm:` and up)
 *    and the phone "Más" menu row (`data-testid="activity-present-link-menu"`)
 *    are both dropped;
 *  - the editor's "Ver como presentación" icon
 *    (`ActivityEditorIsland.tsx`'s `data-testid="view-as-presentation-button"`,
 *    desktop actions and phone menu) is dropped, and its "Usar en clase"
 *    primary action (`data-testid="use-in-class-button"`) falls back to the
 *    action the editor would otherwise show for that same state (e.g.
 *    "Compartir" for a live activity).
 * The route itself, `/[lang]/ingles/actividades/[id]/presentar`, stays
 * reachable by direct link — only these UI entry points are gated. The
 * route's own defensive 404 logic, the presentation island and the
 * presentation libs (`presentationSlides.ts`, etc.) stay intact and tested.
 */
export const PRESENTATION_ENABLED = false;
