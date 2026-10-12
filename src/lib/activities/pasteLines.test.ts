import { describe, it, expect } from 'vitest';
import { isMultilinePaste, nonEmptyLines, parseSentencesPaste } from './pasteLines';

describe('nonEmptyLines', () => {
  it('splits on \\n, trims each line, and drops blank lines', () => {
    expect(nonEmptyLines('  dog  \n\n cat \n')).toEqual(['dog', 'cat']);
  });

  it('splits on \\r\\n and bare \\r too', () => {
    expect(nonEmptyLines('a\r\nb\rc')).toEqual(['a', 'b', 'c']);
  });

  it('returns an empty array for blank/whitespace-only text', () => {
    expect(nonEmptyLines('   \n  \n')).toEqual([]);
    expect(nonEmptyLines('')).toEqual([]);
  });

  it('returns one entry for a single-line text', () => {
    expect(nonEmptyLines('just one line')).toEqual(['just one line']);
  });
});

describe('isMultilinePaste', () => {
  it('is false for zero or one non-empty line', () => {
    expect(isMultilinePaste('')).toBe(false);
    expect(isMultilinePaste('only one line')).toBe(false);
    expect(isMultilinePaste('one line\n\n')).toBe(false);
  });

  it('is true for 2+ non-empty lines, blank lines not counted', () => {
    expect(isMultilinePaste('a\nb')).toBe(true);
    expect(isMultilinePaste('a\n\nb\n\n')).toBe(true);
  });
});

describe('parseSentencesPaste', () => {
  it('is one sentence per line, trimmed, blank lines dropped', () => {
    expect(parseSentencesPaste('I like green apples\n\nShe [is] my teacher\n')).toEqual([
      'I like green apples',
      'She [is] my teacher',
    ]);
  });

  it('keeps cloze bracket syntax untouched', () => {
    expect(parseSentencesPaste('I [was] travelling when I [received] a call.')).toEqual([
      'I [was] travelling when I [received] a call.',
    ]);
  });
});
