/**
 * `choose` template ("Elegir la respuesta") bulk-paste parsing (owner spec
 * N5, "paste a whole list") — pure, no React, no I/O, same posture as
 * `pasteMatchPairs.ts`/`pasteGroupSort.ts`. One question per line:
 *
 *   oración | correcta | otra | otra
 *
 * Every field is trimmed; blank lines are skipped (`pasteLines.ts`). The
 * first field is the sentence, the rest its options in order — the correct
 * one FIRST, as in the editor. A line with no `|` is a sentence with no
 * options yet (the editor still shows its two empty option fields).
 *
 * An empty field in the MIDDLE keeps its place (`S | | go` leaves the
 * correct option empty rather than silently promoting "go" to correct);
 * only empty fields at the END of a line (a trailing `|`) are dropped.
 * At most {@link MAX_CHOOSE_OPTIONS} options are kept.
 */
import { MAX_CHOOSE_OPTIONS } from './chooseAuthoring';
import { nonEmptyLines } from './pasteLines';

export interface ChoosePasteRow {
  sentence: string;
  options: string[];
}

function parseLine(line: string): ChoosePasteRow {
  const [sentence = '', ...options] = line.split('|').map((field) => field.trim());
  while (options.length > 0 && options[options.length - 1] === '') options.pop();
  return { sentence, options: options.slice(0, MAX_CHOOSE_OPTIONS) };
}

/** Every pasted line as one question, in order. */
export function parseChoosePaste(text: string): ChoosePasteRow[] {
  return nonEmptyLines(text).map(parseLine);
}
