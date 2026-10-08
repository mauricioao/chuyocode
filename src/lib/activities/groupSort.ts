/**
 * `groupsort` template ("Ordenar por grupos") — the authoring round-trip,
 * all pure (no React, no I/O), same posture as `clozeSentences.ts`.
 *
 * ONE GROUP = ONE `row` BLOCK + ONE `Slot` (`gameModes.ts`'s own
 * `GroupSortGroup` doc): the group's name is `slot.label`, its mechanic is
 * the reserved `input: 'group'`, and `slot.answer` holds every pool item id
 * that belongs in it. Every group slot in one block shares the SAME pool
 * name, so a tile (one item) belongs to exactly one group's `answer` and
 * removing a group removes exactly the items it claimed — nothing another
 * group could still be pointing at.
 *
 * SIMPLE TO CREATE, ON PURPOSE (owner spec): adding an item is "type it,
 * press Enter", and a comma-separated paste adds several at once —
 * {@link addGroupSortItems} treats both the same way (split on comma, keep
 * the non-empty trimmed pieces).
 */
import type { Draft } from '../authoringDraft';
import type { PoolItem, RowBlock, Slot } from '../exercisePayload';

/** A board stays big and readable with at most this many groups (owner spec, "keep it to 4 max"). */
export const MAX_GROUPSORT_GROUPS = 4;

/** A group needs at least this many items to be worth playing — mirrors `gameModes.ts`'s own `MIN_GROUPSORT_ITEMS_PER_GROUP`. */
export const MIN_GROUPSORT_ITEMS_PER_GROUP = 2;

function isGroupSortSlot(slot: Slot): boolean {
  return slot.input === 'group';
}

/** One item as the editor shows it: its pool item id plus its resolved text. */
export interface GroupSortItemInput {
  id: string;
  text: string;
}

/** One group row, as the editor's whole view model. */
export interface GroupSortGroupRow {
  rowId: string;
  slotId: string;
  label: string;
  items: GroupSortItemInput[];
}

/** Every authored group, reconstructed from the draft's own rows/slots/pool — the editor's whole view model. */
export function deriveGroupSortRows(draft: Draft, poolName: string): GroupSortGroupRow[] {
  const pool = draft.pools[poolName] ?? [];
  const itemById = new Map(pool.map((item) => [item.id, item]));
  const rows: GroupSortGroupRow[] = [];

  for (const block of draft.blocks) {
    if (block.kind !== 'row') continue;
    const slot = draft.slots.find((s) => s.id === block.slotId);
    if (!slot || !isGroupSortSlot(slot)) continue;
    rows.push({
      rowId: block.id,
      slotId: slot.id,
      label: slot.label,
      items: slot.answer.map((itemId) => ({ id: itemId, text: itemById.get(itemId)?.text ?? '' })),
    });
  }

  return rows;
}

/** Append a brand-new, empty group (no name, no items yet). */
export function addGroupSortGroup(draft: Draft, rowId: string, slotId: string, poolName: string): Draft {
  const slot: Slot = { id: slotId, label: '', input: 'group', pool: poolName, answer: [] };
  const block: RowBlock = { kind: 'row', id: rowId, slotId };
  return { ...draft, slots: [...draft.slots, slot], blocks: [...draft.blocks, block] };
}

/** Remove one group entirely — its row, its slot, and every pool item it claimed (no other group ever references them). */
export function removeGroupSortGroup(draft: Draft, rowId: string, poolName: string): Draft {
  const target = draft.blocks.find((b) => b.id === rowId);
  const blocks = draft.blocks.filter((b) => b.id !== rowId);
  if (target?.kind !== 'row') return { ...draft, blocks };

  const slot = draft.slots.find((s) => s.id === target.slotId);
  const staleItemIds = new Set(slot?.answer ?? []);
  const slots = draft.slots.filter((s) => s.id !== target.slotId);
  const existingPool = draft.pools[poolName] ?? [];
  const pools = { ...draft.pools, [poolName]: existingPool.filter((item) => !staleItemIds.has(item.id)) };

  return { ...draft, blocks, slots, pools };
}

/**
 * Add one or more items to a group — `text` is split on commas so a single
 * typed word and a pasted "dog, cat, horse" list are the SAME code path (see
 * this module's own header). Each surviving word mints a brand-new pool item
 * plus claims its id on the group's own `answer`. A blank/whitespace-only
 * `text` (nothing survives the split) is a no-op.
 */
export function addGroupSortItems(
  draft: Draft,
  slotId: string,
  poolName: string,
  text: string,
  nextId: (prefix: string) => string,
): Draft {
  const words = text
    .split(',')
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
  if (words.length === 0) return draft;

  const newItems: PoolItem[] = words.map((word) => ({ id: nextId('item'), text: word }));
  const existingPool = draft.pools[poolName] ?? [];
  const pools = { ...draft.pools, [poolName]: [...existingPool, ...newItems] };
  const slots = draft.slots.map((s) =>
    s.id === slotId ? { ...s, answer: [...s.answer, ...newItems.map((item) => item.id)] } : s,
  );

  return { ...draft, slots, pools };
}

/** Remove one item from its group's `answer` AND from the shared pool — no other group ever claims it. */
export function removeGroupSortItem(draft: Draft, slotId: string, poolName: string, itemId: string): Draft {
  const slots = draft.slots.map((s) => (s.id === slotId ? { ...s, answer: s.answer.filter((a) => a !== itemId) } : s));
  const existingPool = draft.pools[poolName] ?? [];
  const pools = { ...draft.pools, [poolName]: existingPool.filter((item) => item.id !== itemId) };
  return { ...draft, slots, pools };
}
