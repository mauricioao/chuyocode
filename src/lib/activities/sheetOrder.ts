/**
 * Pure reorder/delete helpers for a legacy multi-sheet activity's own block
 * list (owner report, PLAN-OCTUBRE.md "Pendientes nuevos": "ya no hay forma
 * de borrar o reordenar" the sheets of an activity saved before the
 * one-sheet redesign — see `BlockList.tsx`'s own "Más" menu on its active
 * sheet bar, which is the only caller).
 *
 * Zero I/O, same posture as `history.ts`: each function takes the CURRENT
 * `blocks` and returns either a brand-new array (one discrete change, fit
 * for one `onBlocksChange`/`pushHistory` step upstream) or the exact same
 * array reference when there is nothing to do — so a caller can tell a
 * real change apart from a no-op without re-deriving it.
 */
import type { Block } from './blocks';

/**
 * Moves `blockId` one position toward the start. Returns `blocks` unchanged
 * (same reference) when `blockId` is missing or already first.
 */
export function moveBlockLeft(blocks: Block[], blockId: string): Block[] {
  const index = blocks.findIndex((b) => b.id === blockId);
  if (index <= 0) return blocks;
  return swap(blocks, index, index - 1);
}

/**
 * Moves `blockId` one position toward the end. Returns `blocks` unchanged
 * (same reference) when `blockId` is missing or already last.
 */
export function moveBlockRight(blocks: Block[], blockId: string): Block[] {
  const index = blocks.findIndex((b) => b.id === blockId);
  if (index === -1 || index >= blocks.length - 1) return blocks;
  return swap(blocks, index, index + 1);
}

function swap(blocks: Block[], i: number, j: number): Block[] {
  const next = blocks.slice();
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

/**
 * Removes `blockId`. Returns `blocks` unchanged (same reference) when
 * `blockId` is missing — a caller never has to special-case "nothing was
 * removed" separately from "the list didn't need to change".
 */
export function removeBlock(blocks: Block[], blockId: string): Block[] {
  if (!blocks.some((b) => b.id === blockId)) return blocks;
  return blocks.filter((b) => b.id !== blockId);
}
