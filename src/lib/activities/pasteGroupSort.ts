/**
 * `groupsort` template ("Ordenar por grupos") bulk-paste parsing (owner spec
 * N5, "paste a whole list") — pure, no React, no I/O, same posture as
 * `groupSort.ts`. Each line is one of two shapes: `Group: item, item` (or
 * `;`-separated) creates/fills a group named `Group` with those items; a
 * line with no `:` has no group name of its own — it adds its items to
 * whichever group the paste is CURRENTLY filling (the nearest preceding
 * `'group'` op in this same paste, or the group the caret was in when
 * nothing precedes it — the caller's own job, see `GroupSortEditor.tsx`'s
 * `onPasteGroups`).
 */
import { nonEmptyLines } from './pasteLines';

export type GroupSortPasteOp = { kind: 'group'; label: string; items: string[] } | { kind: 'items'; items: string[] };

/** Comma- or semicolon-separated items, trimmed, empties dropped. */
function splitItems(text: string): string[] {
  return text
    .split(/[,;]/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0);
}

/** Every pasted line as one op, in order — see this module's own header. */
export function parseGroupSortPaste(text: string): GroupSortPasteOp[] {
  return nonEmptyLines(text).map((line) => {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) return { kind: 'items', items: splitItems(line) };
    return { kind: 'group', label: line.slice(0, colonIndex).trim(), items: splitItems(line.slice(colonIndex + 1)) };
  });
}
