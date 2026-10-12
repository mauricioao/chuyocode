import { describe, it, expect } from 'vitest';
import { parseGroupSortPaste } from './pasteGroupSort';

describe('parseGroupSortPaste', () => {
  it('parses "Group: item, item" into a group op, comma-separated items trimmed', () => {
    expect(parseGroupSortPaste('Animals: cat, dog')).toEqual([{ kind: 'group', label: 'Animals', items: ['cat', 'dog'] }]);
  });

  it('also splits items on a semicolon', () => {
    expect(parseGroupSortPaste('Animals: cat; dog')).toEqual([{ kind: 'group', label: 'Animals', items: ['cat', 'dog'] }]);
  });

  it('a line with no colon is an items-only op, no group of its own', () => {
    expect(parseGroupSortPaste('cat, dog')).toEqual([{ kind: 'items', items: ['cat', 'dog'] }]);
  });

  it('parses several lines in order, mixing group and items-only ops', () => {
    expect(parseGroupSortPaste('Animals: cat, dog\nbird, fish\nColors: red, blue')).toEqual([
      { kind: 'group', label: 'Animals', items: ['cat', 'dog'] },
      { kind: 'items', items: ['bird', 'fish'] },
      { kind: 'group', label: 'Colors', items: ['red', 'blue'] },
    ]);
  });

  it('drops blank lines and trims the label', () => {
    expect(parseGroupSortPaste('  Animals :cat\n\n')).toEqual([{ kind: 'group', label: 'Animals', items: ['cat'] }]);
  });

  it('a group line with no items after the colon still has its label', () => {
    expect(parseGroupSortPaste('Animals:')).toEqual([{ kind: 'group', label: 'Animals', items: [] }]);
  });
});
