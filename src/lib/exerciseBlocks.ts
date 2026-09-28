/**
 * Groups `payload.blocks` around the slot on screen for one stepper index
 * (openspec/changes/user-authored-exercises, design.md §6, "Renderer
 * integration"; specs/exercise-blocks/spec.md).
 *
 * Zero I/O, no React. `ExerciseIsland`'s stepper binds 1:1 to `payload.slots`
 * and is UNTOUCHED by this module (`ExerciseIsland.tsx`, the `step`/`slot`
 * lines) — `blocks` only supplies the `prose`/`media` context that renders
 * around the current mechanic, never the slot itself.
 */
import type { Block, Payload } from './exercisePayload';

/**
 * The blocks belonging to step `index`: any leading `prose`/`media` blocks,
 * plus the `row` block for that step's slot.
 *
 * Grouping walks `blocks` in authored order, accumulating non-row blocks into
 * a buffer. Reaching a `row` block closes a group: the buffer plus that row.
 * Any blocks left over after the LAST row (trailing context) attach to that
 * last group — there is nowhere else for them to belong, since every group
 * after them would put them out of authored order.
 *
 * Absent `payload.blocks`, or a step with no slot, degrades to `[]` — the
 * legacy render path is already correct on its own and this module adds
 * nothing to it.
 */
export function blocksForStep(payload: Payload, index: number): Block[] {
  const blocks = payload.blocks;
  const slot = payload.slots[index];
  if (!blocks || !slot) return [];

  const groups: Block[][] = [];
  let buffer: Block[] = [];
  for (const block of blocks) {
    if (block.kind === 'row') {
      groups.push([...buffer, block]);
      buffer = [];
    } else {
      buffer.push(block);
    }
  }
  if (buffer.length > 0) {
    if (groups.length > 0) {
      groups[groups.length - 1]!.push(...buffer);
    } else {
      groups.push(buffer);
    }
  }

  return groups.find((g) => g.some((b) => b.kind === 'row' && b.slotId === slot.id)) ?? [];
}
