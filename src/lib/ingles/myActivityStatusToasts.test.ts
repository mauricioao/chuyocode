import { describe, it, expect } from 'vitest';
import { diffMyActivityStatusSnapshot, type MyActivityStatusSnapshot } from './myActivityStatusToasts';

function entry(id: string, title: string, status: string) {
  return { id, title, status };
}

describe('diffMyActivityStatusSnapshot', () => {
  it('shows no toasts on the first visit (no previous snapshot), but seeds one silently', () => {
    const { toasts, snapshot } = diffMyActivityStatusSnapshot(null, [entry('a1', 'Animals', 'pending_review')]);
    expect(toasts).toEqual([]);
    expect(snapshot).toEqual({ a1: { title: 'Animals', status: 'pending_review' } });
  });

  it('toasts a publish: pending_review -> live', () => {
    const previous: MyActivityStatusSnapshot = { a1: { title: 'Animals', status: 'pending_review' } };
    const { toasts } = diffMyActivityStatusSnapshot(previous, [entry('a1', 'Animals', 'live')]);
    expect(toasts).toEqual([{ id: 'a1', title: 'Animals', kind: 'published' }]);
  });

  it('toasts a rejection: pending_review -> rejected', () => {
    const previous: MyActivityStatusSnapshot = { a1: { title: 'Animals', status: 'pending_review' } };
    const { toasts } = diffMyActivityStatusSnapshot(previous, [entry('a1', 'Animals', 'rejected')]);
    expect(toasts).toEqual([{ id: 'a1', title: 'Animals', kind: 'rejected' }]);
  });

  it('never toasts an unchanged status', () => {
    const previous: MyActivityStatusSnapshot = { a1: { title: 'Animals', status: 'live' } };
    const { toasts } = diffMyActivityStatusSnapshot(previous, [entry('a1', 'Animals', 'live')]);
    expect(toasts).toEqual([]);
  });

  it('never toasts an activity created since the last visit (missing from the previous snapshot)', () => {
    const previous: MyActivityStatusSnapshot = {};
    const { toasts } = diffMyActivityStatusSnapshot(previous, [entry('new1', 'Brand new', 'live')]);
    expect(toasts).toEqual([]);
  });

  it('never toasts a silent transition (e.g. draft -> pending_review)', () => {
    const previous: MyActivityStatusSnapshot = { a1: { title: 'Animals', status: 'draft' } };
    const { toasts } = diffMyActivityStatusSnapshot(previous, [entry('a1', 'Animals', 'pending_review')]);
    expect(toasts).toEqual([]);
  });

  it('caps at 3 toasts per load, in list order, even with more changes', () => {
    const previous: MyActivityStatusSnapshot = {
      a1: { title: 'One', status: 'pending_review' },
      a2: { title: 'Two', status: 'pending_review' },
      a3: { title: 'Three', status: 'pending_review' },
      a4: { title: 'Four', status: 'pending_review' },
    };
    const current = [
      entry('a1', 'One', 'live'),
      entry('a2', 'Two', 'rejected'),
      entry('a3', 'Three', 'live'),
      entry('a4', 'Four', 'rejected'),
    ];
    const { toasts, snapshot } = diffMyActivityStatusSnapshot(previous, current);
    expect(toasts).toHaveLength(3);
    expect(toasts).toEqual([
      { id: 'a1', title: 'One', kind: 'published' },
      { id: 'a2', title: 'Two', kind: 'rejected' },
      { id: 'a3', title: 'Three', kind: 'published' },
    ]);
    // The snapshot itself still records EVERY current activity, capped or not.
    expect(snapshot).toEqual({
      a1: { title: 'One', status: 'live' },
      a2: { title: 'Two', status: 'rejected' },
      a3: { title: 'Three', status: 'live' },
      a4: { title: 'Four', status: 'rejected' },
    });
  });
});
