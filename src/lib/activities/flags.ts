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
