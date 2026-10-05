import { describe, it, expect } from 'vitest';
import { normalizeDisplayName } from './displayName';

// T3 (Perfil page): the one validation rule both `ProfileNameForm` (nicer
// UX) and `/api/cuenta/nombre.ts` (the actual authority) apply.
describe('normalizeDisplayName', () => {
  it('trims leading/trailing whitespace', () => {
    expect(normalizeDisplayName('  Juan Perez  ')).toBe('Juan Perez');
  });

  it('collapses internal whitespace runs (including a pasted newline/tab) to one space', () => {
    expect(normalizeDisplayName('Juan   \t\n  Perez')).toBe('Juan Perez');
  });

  it('rejects an empty or whitespace-only value', () => {
    expect(normalizeDisplayName('')).toBeNull();
    expect(normalizeDisplayName('   ')).toBeNull();
  });

  it('accepts exactly 60 characters and rejects 61', () => {
    expect(normalizeDisplayName('a'.repeat(60))).toBe('a'.repeat(60));
    expect(normalizeDisplayName('a'.repeat(61))).toBeNull();
  });

  it('rejects disallowed control characters (e.g. a null byte)', () => {
    expect(normalizeDisplayName('Juan\u0000Perez')).toBeNull();
  });

  it('rejects a non-string value', () => {
    expect(normalizeDisplayName(42)).toBeNull();
    expect(normalizeDisplayName(null)).toBeNull();
    expect(normalizeDisplayName(undefined)).toBeNull();
  });
});
