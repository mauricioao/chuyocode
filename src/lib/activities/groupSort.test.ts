import { describe, expect, it } from 'vitest';
import type { Draft } from '../authoringDraft';
import {
  MAX_GROUPSORT_GROUPS,
  addGroupSortGroup,
  addGroupSortItems,
  deriveGroupSortRows,
  removeGroupSortGroup,
  removeGroupSortItem,
} from './groupSort';

function emptyDraft(): Draft {
  return { pools: {}, slots: [], blocks: [] };
}

function counterNextId() {
  let n = 0;
  return (prefix: string) => {
    n += 1;
    return `b1-${prefix}-${n}`;
  };
}

const POOL = 'b1-groupsort-pool';

describe('addGroupSortGroup / deriveGroupSortRows', () => {
  it('adds an empty group with no items yet', () => {
    const draft = addGroupSortGroup(emptyDraft(), 'row-1', 'slot-1', POOL);
    const rows = deriveGroupSortRows(draft, POOL);
    expect(rows).toEqual([{ rowId: 'row-1', slotId: 'slot-1', label: '', items: [] }]);
  });

  it('keeps several groups in authored (row) order', () => {
    let draft = addGroupSortGroup(emptyDraft(), 'row-1', 'slot-1', POOL);
    draft = addGroupSortGroup(draft, 'row-2', 'slot-2', POOL);
    const rows = deriveGroupSortRows(draft, POOL);
    expect(rows.map((r) => r.slotId)).toEqual(['slot-1', 'slot-2']);
  });

  it('ignores a row/slot whose mechanic is not "group" (e.g. a plain Básico question)', () => {
    const draft: Draft = {
      pools: {},
      slots: [{ id: 's1', label: 'Q', input: 'text', answer: ['a'] }],
      blocks: [{ kind: 'row', id: 'row-1', slotId: 's1' }],
    };
    expect(deriveGroupSortRows(draft, POOL)).toEqual([]);
  });
});

describe('addGroupSortItems', () => {
  it('adds a single typed item, minting one pool item and claiming its id', () => {
    let draft = addGroupSortGroup(emptyDraft(), 'row-1', 'slot-1', POOL);
    draft = addGroupSortItems(draft, 'slot-1', POOL, 'dog', counterNextId());

    const rows = deriveGroupSortRows(draft, POOL);
    expect(rows[0]!.items).toEqual([{ id: 'b1-item-1', text: 'dog' }]);
  });

  it('splits a comma-separated paste into several items, same code path as a single word', () => {
    let draft = addGroupSortGroup(emptyDraft(), 'row-1', 'slot-1', POOL);
    draft = addGroupSortItems(draft, 'slot-1', POOL, 'dog, cat,  horse ', counterNextId());

    const rows = deriveGroupSortRows(draft, POOL);
    expect(rows[0]!.items.map((i) => i.text)).toEqual(['dog', 'cat', 'horse']);
  });

  it('is a no-op for blank/whitespace-only text', () => {
    let draft = addGroupSortGroup(emptyDraft(), 'row-1', 'slot-1', POOL);
    draft = addGroupSortItems(draft, 'slot-1', POOL, '   , , ', counterNextId());
    expect(deriveGroupSortRows(draft, POOL)[0]!.items).toEqual([]);
  });

  it('only claims items onto the targeted group, leaving a sibling group untouched', () => {
    let draft = addGroupSortGroup(emptyDraft(), 'row-1', 'slot-1', POOL);
    draft = addGroupSortGroup(draft, 'row-2', 'slot-2', POOL);
    draft = addGroupSortItems(draft, 'slot-1', POOL, 'dog', counterNextId());

    const rows = deriveGroupSortRows(draft, POOL);
    expect(rows.find((r) => r.slotId === 'slot-1')!.items).toHaveLength(1);
    expect(rows.find((r) => r.slotId === 'slot-2')!.items).toHaveLength(0);
  });
});

describe('removeGroupSortItem', () => {
  it('removes the item from its group AND from the shared pool', () => {
    let draft = addGroupSortGroup(emptyDraft(), 'row-1', 'slot-1', POOL);
    draft = addGroupSortItems(draft, 'slot-1', POOL, 'dog, cat', counterNextId());
    const itemId = deriveGroupSortRows(draft, POOL)[0]!.items[0]!.id;

    draft = removeGroupSortItem(draft, 'slot-1', POOL, itemId);

    expect(deriveGroupSortRows(draft, POOL)[0]!.items.map((i) => i.text)).toEqual(['cat']);
    expect(draft.pools[POOL]!.map((i) => i.id)).not.toContain(itemId);
  });
});

describe('removeGroupSortGroup', () => {
  it('removes the row, the slot, and every item it claimed', () => {
    const nextId = counterNextId();
    let draft = addGroupSortGroup(emptyDraft(), 'row-1', 'slot-1', POOL);
    draft = addGroupSortItems(draft, 'slot-1', POOL, 'dog, cat', nextId);
    draft = addGroupSortGroup(draft, 'row-2', 'slot-2', POOL);
    draft = addGroupSortItems(draft, 'slot-2', POOL, 'bread', nextId);

    draft = removeGroupSortGroup(draft, 'row-1', POOL);

    const rows = deriveGroupSortRows(draft, POOL);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.slotId).toBe('slot-2');
    // The removed group's items are gone from the shared pool too — never
    // left as orphaned, unreachable entries.
    expect(draft.pools[POOL]!.map((i) => i.text)).toEqual(['bread']);
  });

  it('is a no-op for an unknown row id', () => {
    const draft = addGroupSortGroup(emptyDraft(), 'row-1', 'slot-1', POOL);
    const next = removeGroupSortGroup(draft, 'not-a-row', POOL);
    expect(deriveGroupSortRows(next, POOL)).toHaveLength(1);
  });
});

describe('MAX_GROUPSORT_GROUPS', () => {
  it('is 4, the board stays readable at a glance', () => {
    expect(MAX_GROUPSORT_GROUPS).toBe(4);
  });
});
