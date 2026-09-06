/**
 * Pure presentation helpers for the English section.
 *
 * Everything here exists because the Astro routes cannot be asserted:
 * `AstroContainer` cannot render the React island on the detail route
 * (`src/pages/[lang]/libros/libros.test.ts:47` is `it.skip`'d), so the page
 * tests only prove status codes. Anything that could silently be WRONG — a
 * heading that changes on reload, a card title that reads as a slug — belongs
 * in a function with tests, not in a template expression.
 */
import { describe, it, expect } from 'vitest';
import { humanizeSlug, pickStable, stableIndex } from './exerciseCopy';

describe('stableIndex', () => {
  it('returns the same index for the same seed, every time', () => {
    // THE WHOLE POINT. `Math.random()` on the SSR render path would change the
    // heading on every reload of the same URL, which reads as a glitch — the
    // same reasoning that made the related-exercise ORDER deterministic.
    const first = stableIndex('quantifiers-and-present-simple', 3);
    for (let i = 0; i < 50; i += 1) {
      expect(stableIndex('quantifiers-and-present-simple', 3)).toBe(first);
    }
  });

  it('stays inside the array bounds for any seed', () => {
    const seeds = [
      '',
      'a',
      'at-the-airport',
      'standup-update',
      'review-comments',
      '¿qué?',
      '----',
      'x'.repeat(500),
    ];
    for (const seed of seeds) {
      const index = stableIndex(seed, 4);
      expect(Number.isInteger(index)).toBe(true);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(4);
    }
  });

  it('spreads different seeds across the whole range', () => {
    // A hash that always answers 0 would pass every test above while making the
    // "varied" heading a constant. Prove it actually varies.
    const seeds = [
      'at-the-airport',
      'standup-update',
      'review-comments',
      'ordering-coffee',
      'quantifiers-and-present-simple',
      'writing-a-bug-report',
      'asking-for-directions',
      'pair-programming',
      'sprint-planning',
      'meeting-the-team',
    ];
    const hit = new Set(seeds.map((seed) => stableIndex(seed, 3)));
    expect([...hit].sort()).toEqual([0, 1, 2]);
  });

  it('separates seeds that differ only in their last character', () => {
    // Two exercises in the same topic usually share a long prefix. A hash that
    // only looked at the first characters would give an entire topic the same
    // heading.
    const a = stableIndex('review-comments-1', 6);
    const b = stableIndex('review-comments-2', 6);
    expect(a).not.toBe(b);
  });

  it('answers 0 for an empty seed instead of NaN', () => {
    expect(stableIndex('', 3)).toBe(0);
  });

  it('answers 0 rather than dividing by a length it cannot use', () => {
    // `%` by 0 is NaN, and NaN as an array index reads `undefined` — which is
    // an empty <h2> in the page and nothing at all in the console.
    expect(stableIndex('any-slug', 0)).toBe(0);
    expect(stableIndex('any-slug', -3)).toBe(0);
    expect(stableIndex('any-slug', 2.5)).toBe(0);
  });
});

describe('pickStable', () => {
  const headings = ['Otros ejercicios', 'Tal vez te interese', 'Para seguir'];

  it('picks the entry the index points at', () => {
    expect(pickStable(headings, 'at-the-airport')).toBe(
      headings[stableIndex('at-the-airport', headings.length)],
    );
  });

  it('returns the same entry for the same seed', () => {
    const first = pickStable(headings, 'review-comments');
    expect(pickStable(headings, 'review-comments')).toBe(first);
    expect(headings).toContain(first);
  });

  it('never returns undefined, whatever the seed looks like', () => {
    for (const seed of ['', ' ', '---', '¿?', 'x'.repeat(300)]) {
      const picked = pickStable(headings, seed);
      expect(typeof picked).toBe('string');
      expect(headings).toContain(picked);
    }
  });

  it('returns an empty string rather than undefined when there is nothing to pick', () => {
    // Unreachable through the routes — the heading arrays are consts with three
    // entries — but an `undefined` heading renders as the literal word
    // "undefined" in Astro, and that is the failure this guards.
    expect(pickStable([], 'any-slug')).toBe('');
  });

  it('reaches every entry across a realistic set of slugs', () => {
    const seeds = [
      'at-the-airport',
      'standup-update',
      'review-comments',
      'ordering-coffee',
      'quantifiers-and-present-simple',
      'writing-a-bug-report',
      'asking-for-directions',
      'pair-programming',
    ];
    const picked = new Set(seeds.map((seed) => pickStable(headings, seed)));
    expect([...picked].sort()).toEqual([...headings].sort());
  });
});

describe('humanizeSlug', () => {
  it('reads a hyphenated slug as an English phrase', () => {
    // Exercise slugs are English and permanent (they are in the URL and in
    // every published row), so they are usable as a title as-is once the
    // hyphens are gone. No locale variant: exercise data is never translated.
    expect(humanizeSlug('review-comments')).toBe('Review comments');
    expect(humanizeSlug('quantifiers-and-present-simple')).toBe(
      'Quantifiers and present simple',
    );
  });

  it('leaves a single-word slug alone beyond capitalizing it', () => {
    expect(humanizeSlug('greetings')).toBe('Greetings');
  });

  it('collapses separators instead of leaving gaps', () => {
    expect(humanizeSlug('at--the__airport')).toBe('At the airport');
  });

  it('trims stray separators at the edges', () => {
    expect(humanizeSlug('-standup-update-')).toBe('Standup update');
  });

  it('returns an empty string for an empty slug', () => {
    // The callers fall back to the slug only when there is no better title, so
    // this must not throw on the degenerate row.
    expect(humanizeSlug('')).toBe('');
    expect(humanizeSlug('---')).toBe('');
  });
});
