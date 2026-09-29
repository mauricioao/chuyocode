import { describe, it, expect } from 'vitest';
import {
  isSortOrder,
  isBlockTypeFilter,
  normalizeSearchQuery,
  escapeIlikePattern,
  normalizeAccents,
  buildTitleIlikePattern,
  SEARCH_QUERY_MAX_LENGTH,
} from './discoveryQuery';

describe('isSortOrder', () => {
  it('accepts the three known sort orders', () => {
    expect(isSortOrder('recientes')).toBe(true);
    expect(isSortOrder('gustadas')).toBe(true);
    expect(isSortOrder('vistas')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isSortOrder('populares')).toBe(false);
    expect(isSortOrder('')).toBe(false);
    expect(isSortOrder(null)).toBe(false);
    expect(isSortOrder(undefined)).toBe(false);
    expect(isSortOrder(1)).toBe(false);
  });
});

describe('isBlockTypeFilter', () => {
  it('accepts worksheet and quiz', () => {
    expect(isBlockTypeFilter('worksheet')).toBe(true);
    expect(isBlockTypeFilter('quiz')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isBlockTypeFilter('video')).toBe(false);
    expect(isBlockTypeFilter('')).toBe(false);
    expect(isBlockTypeFilter(null)).toBe(false);
  });
});

describe('normalizeSearchQuery', () => {
  it('returns null for null, undefined, or empty input', () => {
    expect(normalizeSearchQuery(null)).toBeNull();
    expect(normalizeSearchQuery(undefined)).toBeNull();
    expect(normalizeSearchQuery('')).toBeNull();
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeSearchQuery('  present simple  ')).toBe('present simple');
  });

  it('returns null when the query is whitespace only', () => {
    expect(normalizeSearchQuery('   ')).toBeNull();
  });

  it(`caps the query at ${SEARCH_QUERY_MAX_LENGTH} characters`, () => {
    const long = 'a'.repeat(200);
    const result = normalizeSearchQuery(long);
    expect(result).toHaveLength(SEARCH_QUERY_MAX_LENGTH);
    expect(result).toBe('a'.repeat(SEARCH_QUERY_MAX_LENGTH));
  });

  it('trims before capping, so a too-long query with padding is not truncated mid-word unnecessarily', () => {
    const raw = `  ${'b'.repeat(90)}  `;
    expect(normalizeSearchQuery(raw)).toBe('b'.repeat(SEARCH_QUERY_MAX_LENGTH));
  });
});

describe('escapeIlikePattern', () => {
  it('escapes percent signs', () => {
    expect(escapeIlikePattern('50%')).toBe('50\\%');
  });

  it('escapes underscores', () => {
    expect(escapeIlikePattern('a_b')).toBe('a\\_b');
  });

  it('escapes backslashes themselves, before they could re-escape another char', () => {
    expect(escapeIlikePattern('a\\b')).toBe('a\\\\b');
  });

  it('leaves ordinary characters (including accents) untouched', () => {
    expect(escapeIlikePattern('inglés técnico')).toBe('inglés técnico');
  });

  it('handles a query with every special character at once', () => {
    expect(escapeIlikePattern('100%_off\\sale')).toBe('100\\%\\_off\\\\sale');
  });
});

describe('normalizeAccents', () => {
  it('strips acute accents', () => {
    expect(normalizeAccents('canción')).toBe('cancion');
    expect(normalizeAccents('inglés técnico')).toBe('ingles tecnico');
  });

  it('folds ñ to n (NFD decomposes it to n + combining tilde)', () => {
    expect(normalizeAccents('año')).toBe('ano');
  });

  it('leaves plain ASCII untouched', () => {
    expect(normalizeAccents('present simple')).toBe('present simple');
  });

  it('handles every Spanish vowel accent', () => {
    expect(normalizeAccents('áéíóú')).toBe('aeiou');
  });
});

describe('buildTitleIlikePattern', () => {
  it('wraps the escaped query in wildcards', () => {
    expect(buildTitleIlikePattern('present')).toBe('%present%');
  });

  it('escapes special characters before wrapping', () => {
    expect(buildTitleIlikePattern('50%_off')).toBe('%50\\%\\_off%');
  });

  it('lowercases the query', () => {
    expect(buildTitleIlikePattern('PRESENT Simple')).toBe('%present simple%');
  });

  it('strips accents, so "cancion" and "canción" build the same pattern', () => {
    expect(buildTitleIlikePattern('canción')).toBe('%cancion%');
    expect(buildTitleIlikePattern('cancion')).toBe('%cancion%');
  });

  it('folds case AND accents together', () => {
    expect(buildTitleIlikePattern('CANCIÓN')).toBe('%cancion%');
  });
});
