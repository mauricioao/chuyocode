/**
 * Unit tests for `src/lib/exerciseSlug.ts` (slice 17, design.md §8 "Slug
 * collisions"). Pure, zero I/O.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { slugify, withCollisionSuffix } from './exerciseSlug';

describe('slugify', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(slugify('Present Perfect Basics')).toBe('present-perfect-basics');
  });

  it('collapses runs of non-alphanumeric characters into one hyphen', () => {
    expect(slugify('spot the error!! (easy)')).toBe('spot-the-error-easy');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('  --hello world--  ')).toBe('hello-world');
  });

  it('produces the empty string for input with no alphanumeric characters', () => {
    expect(slugify('!!!')).toBe('');
  });
});

describe('withCollisionSuffix', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('appends a 4-character base-36 suffix separated by a hyphen', () => {
    const result = withCollisionSuffix('ordering-coffee');
    expect(result).toMatch(/^ordering-coffee-[0-9a-z]{4}$/);
  });

  it('is random, never a deterministic -2 style suffix', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20; i += 1) {
      seen.add(withCollisionSuffix('ordering-coffee'));
    }
    // 20 draws from a 36^4 space should not collide down to one value; a
    // deterministic implementation (e.g. always `-2`) would fail this by
    // producing exactly one distinct result.
    expect(seen.size).toBeGreaterThan(1);
  });

  it('draws every character from the base-36 alphabet', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(withCollisionSuffix('slug')).toBe('slug-0000');
    vi.spyOn(Math, 'random').mockReturnValue(0.9999);
    expect(withCollisionSuffix('slug')).toBe('slug-zzzz');
  });
});
