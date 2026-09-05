/**
 * Facet-building tests (src/lib/exerciseFacets.ts).
 *
 * Zero I/O, zero mocks — the whole point of extracting this module is that the
 * entry screen's logic is provable without rendering a page. AstroContainer
 * cannot render the React islands the layout mounts (see
 * `src/pages/[lang]/libros/libros.test.ts:47`), so page tests assert status
 * codes only; every decision worth testing has to live HERE instead.
 */
import { describe, it, expect } from 'vitest';
import { LEVELS, TOPICS } from './exerciseTaxonomy';
import {
  buildFacets,
  pickDefaultLevel,
  resolveLevel,
  topicsForLevel,
  type FacetRow,
} from './exerciseFacets';

/** Shorthand for a published (level, topic) pair as the flat query returns it. */
function row(level: string, topic: string): FacetRow {
  return { level, topic } as FacetRow;
}

describe('buildFacets', () => {
  it('always reports all six CEFR levels, in taxonomy order', () => {
    const facets = buildFacets([row('B1', 'travel')]);

    expect(facets.map((f) => f.level)).toEqual([...LEVELS]);
  });

  it('counts the exercises published at each level', () => {
    const facets = buildFacets([
      row('A1', 'food'),
      row('A1', 'food'),
      row('A1', 'travel'),
      row('B2', 'code-review'),
    ]);

    const byLevel = Object.fromEntries(facets.map((f) => [f.level, f.count]));
    expect(byLevel.A1).toBe(3);
    expect(byLevel.B2).toBe(1);
    expect(byLevel.C1).toBe(0);
  });

  it('lists only the topics that actually have exercises at that level', () => {
    const facets = buildFacets([
      row('A1', 'food'),
      row('A1', 'food'),
      row('A1', 'travel'),
    ]);

    const a1 = facets.find((f) => f.level === 'A1');
    // `daily-life` and the other five topics have nothing at A1, so offering
    // them would be a dead chip.
    expect(a1?.topics).toEqual([
      { topic: 'travel', count: 1 },
      { topic: 'food', count: 2 },
    ]);
  });

  it('orders topics by the taxonomy, not by insertion or count', () => {
    // `job-interview` is last in TOPICS, `daily-life` first — fed in reverse.
    const facets = buildFacets([
      row('B1', 'job-interview'),
      row('B1', 'job-interview'),
      row('B1', 'job-interview'),
      row('B1', 'daily-life'),
    ]);

    const b1 = facets.find((f) => f.level === 'B1');
    expect(b1?.topics.map((t) => t.topic)).toEqual([
      'daily-life',
      'job-interview',
    ]);
    expect(TOPICS.indexOf('daily-life')).toBeLessThan(
      TOPICS.indexOf('job-interview'),
    );
  });

  it('leaves a level with no exercises holding an empty topic list', () => {
    const facets = buildFacets([row('A1', 'food')]);

    const c2 = facets.find((f) => f.level === 'C2');
    expect(c2?.count).toBe(0);
    expect(c2?.topics).toEqual([]);
  });

  it('keeps each level count equal to the sum of its topic counts', () => {
    const facets = buildFacets([
      row('A2', 'food'),
      row('A2', 'travel'),
      row('A2', 'travel'),
    ]);

    const a2 = facets.find((f) => f.level === 'A2');
    const summed = (a2?.topics ?? []).reduce((n, t) => n + t.count, 0);
    expect(a2?.count).toBe(3);
    expect(summed).toBe(3);
  });

  it('discards rows whose level left the taxonomy, rather than rendering a dead chip', () => {
    // A row published under a retired level must not invent a seventh chip.
    const facets = buildFacets([row('B1', 'travel'), row('Z9', 'travel')]);

    expect(facets).toHaveLength(LEVELS.length);
    expect(facets.find((f) => f.level === 'B1')?.count).toBe(1);
  });

  it('discards rows whose topic left the taxonomy', () => {
    const facets = buildFacets([
      row('B1', 'travel'),
      row('B1', 'space-travel'),
    ]);

    const b1 = facets.find((f) => f.level === 'B1');
    // The orphan is dropped from BOTH the chip list and the level count, so the
    // number on the chip always matches what the grid can actually show.
    expect(b1?.count).toBe(1);
    expect(b1?.topics).toEqual([{ topic: 'travel', count: 1 }]);
  });

  it('returns six empty levels for the fail-safe empty result', () => {
    const facets = buildFacets([]);

    expect(facets).toHaveLength(LEVELS.length);
    expect(facets.every((f) => f.count === 0 && f.topics.length === 0)).toBe(
      true,
    );
  });

  it('survives null and undefined instead of throwing on the render path', () => {
    for (const input of [null, undefined]) {
      const facets = buildFacets(input);
      expect(facets.map((f) => f.level)).toEqual([...LEVELS]);
      expect(facets.every((f) => f.count === 0)).toBe(true);
    }
  });

  it('drops malformed rows without losing the well-formed ones beside them', () => {
    const junk = [
      row('A1', 'food'),
      null,
      undefined,
      {},
      { level: 'A1' },
      { topic: 'food' },
      { level: 42, topic: 'food' },
    ] as unknown as FacetRow[];

    const facets = buildFacets(junk);

    expect(facets.find((f) => f.level === 'A1')?.count).toBe(1);
  });
});

describe('pickDefaultLevel', () => {
  it('picks the lowest level that actually has content', () => {
    const facets = buildFacets([row('B1', 'travel'), row('C1', 'food')]);

    expect(pickDefaultLevel(facets)).toBe('B1');
  });

  it('skips empty lower levels rather than landing on an empty screen', () => {
    // A1 and A2 are empty; a naive "first level" default would open on nothing.
    const facets = buildFacets([row('C2', 'food')]);

    expect(pickDefaultLevel(facets)).toBe('C2');
  });

  it('falls back to A1 when nothing is published anywhere', () => {
    expect(pickDefaultLevel(buildFacets([]))).toBe('A1');
  });

  it('falls back to A1 for a malformed facet list', () => {
    expect(pickDefaultLevel([])).toBe('A1');
  });
});

describe('resolveLevel', () => {
  const facets = buildFacets([row('B1', 'travel'), row('C1', 'food')]);

  it('honours an explicitly requested level', () => {
    expect(resolveLevel(facets, 'C1')).toBe('C1');
  });

  it('falls back to the default when the parameter is absent', () => {
    expect(resolveLevel(facets, null)).toBe('B1');
    expect(resolveLevel(facets, undefined)).toBe('B1');
  });

  it('falls back to the default when the parameter is not a CEFR level', () => {
    expect(resolveLevel(facets, 'Z9')).toBe('B1');
    // Levels are matched exactly — the URL segment casing is part of the value.
    expect(resolveLevel(facets, 'b1')).toBe('B1');
  });

  it('keeps a VALID but empty level selected so its empty state is reachable', () => {
    // A2 has nothing, but it is a real level. Silently redirecting to B1 would
    // lie about what the user asked for; the grid shows "nothing here yet".
    expect(resolveLevel(facets, 'A2')).toBe('A2');
  });
});

describe('topicsForLevel', () => {
  const facets = buildFacets([row('B1', 'travel'), row('B1', 'food')]);

  it('returns the topics published at the given level', () => {
    expect(topicsForLevel(facets, 'B1').map((t) => t.topic)).toEqual([
      'travel',
      'food',
    ]);
  });

  it('returns an empty list for a level with nothing published', () => {
    // Empty because B2 genuinely has no rows — the caller renders the
    // "nothing at this level" state rather than a blank grid.
    expect(topicsForLevel(facets, 'B2')).toEqual([]);
  });
});
