/**
 * Shared "bulk paste" machinery for every template editor's row inputs
 * (owner spec N5, "paste a whole list"): a paste that carries 2+ non-empty
 * lines splits into one row per line instead of landing as literal newlines
 * inside a single-line `<input>`. A single-line paste is NOT a bulk paste —
 * callers must leave the browser's own default paste behaviour alone for it
 * (see each editor's own `onPaste` handler).
 *
 * `Reordenar` and `Completar la frase` need nothing more than this: one
 * sentence per line, verbatim (cloze's `[blank]` brackets are never touched
 * here — `parseSentencesPaste` is this module's own name for that shape).
 * `MatchPairsEditor`/`GroupSortEditor` layer their own per-line parsing on
 * top (`pasteMatchPairs.ts`/`pasteGroupSort.ts`).
 */

/** Every line, trimmed, with blank lines dropped entirely (never kept as an empty row). */
export function nonEmptyLines(text: string): string[] {
  return text
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Whether `text` is worth splitting into rows — 2 or more non-empty lines. A single line (blank ones ignored) is not a bulk paste. */
export function isMultilinePaste(text: string): boolean {
  return nonEmptyLines(text).length >= 2;
}

/** Reorder's/Cloze's own shape: one sentence per line, exactly as typed. */
export function parseSentencesPaste(text: string): string[] {
  return nonEmptyLines(text);
}
