/**
 * Facet-building tests (src/lib/exerciseFacets.ts).
 *
 * Zero I/O, zero mocks — the whole point of extracting this module is that the
 * entry screen's logic is provable without rendering a page. Every decision
 * worth testing lives HERE rather than inside a template expression.
 *
 * The axis is `(level, focus)`. `topic` is secondary context and is not grouped
 * on at all: someone opening the section is choosing a LANGUAGE POINT to
 * practise, not a setting, and a nullable column cannot key a grid anyway.
 */
import { describe, it, expect } from 'vitest';
import { LEVELS, FOCUSES } from './exerciseTaxonomy';
import {
  buildFacets,
  pickDefaultLevel,
  resolveLevel,
  focusesForLevel,
  type FacetRow,
} from './exerciseFacets';

/** Shorthand for a published (level, focus) pair as the flat query returns it. */
function row(level: string, focus: string): FacetRow {
  return { level, focus } as FacetRow;
}

describe('buildFacets', () => {
  it('always reports all six CEFR levels, in taxonomy order', () => {
    const facets = buildFacets([row('B1', 'past-simple')]);

    expect(facets.map((f) => f.level)).toEqual([...LEVELS]);
  });

  it('counts the exercises published at each level', () => {
    const facets = buildFacets([
      row('A1', 'present-simple'),
      row('A1', 'present-simple'),
      row('A1', 'articles'),
      row('B2', 'third-conditional'),
    ]);

    const byLevel = Object.fromEntries(facets.map((f) => [f.level, f.count]));
    expect(byLevel.A1).toBe(3);
    expect(byLevel.B2).toBe(1);
    expect(byLevel.C1).toBe(0);
  });

  it('lists only the focuses that actually have exercises at that level', () => {
    const facets = buildFacets([
      row('A1', 'past-simple'),
      row('A1', 'past-simple'),
      row('A1', 'present-simple'),
    ]);

    const a1 = facets.find((f) => f.level === 'A1');
    // Every other language point has nothing at A1, so offering it would be a
    // dead chip routing to a guaranteed empty screen.
    expect(a1?.focuses).toEqual([
      { focus: 'present-simple', count: 1 },
      { focus: 'past-simple', count: 2 },
    ]);
  });

  it('orders focuses by the taxonomy, not by insertion or count', () => {
    // `idioms` is last in FOCUSES, `present-simple` first — fed in reverse, and
    // with the later one holding the bigger count so a count sort would show.
    const facets = buildFacets([
      row('B1', 'idioms'),
      row('B1', 'idioms'),
      row('B1', 'idioms'),
      row('B1', 'present-simple'),
    ]);

    const b1 = facets.find((f) => f.level === 'B1');
    expect(b1?.focuses.map((f) => f.focus)).toEqual([
      'present-simple',
      'idioms',
    ]);
    expect(FOCUSES.indexOf('present-simple')).toBeLessThan(
      FOCUSES.indexOf('idioms'),
    );
  });

  it('leaves a level with no exercises holding an empty focus list', () => {
    const facets = buildFacets([row('A1', 'articles')]);

    const c2 = facets.find((f) => f.level === 'C2');
    expect(c2?.count).toBe(0);
    expect(c2?.focuses).toEqual([]);
  });

  it('keeps each level count equal to the sum of its focus counts', () => {
    const facets = buildFacets([
      row('A2', 'quantifiers'),
      row('A2', 'modal-verbs'),
      row('A2', 'modal-verbs'),
    ]);

    const a2 = facets.find((f) => f.level === 'A2');
    const summed = (a2?.focuses ?? []).reduce((n, f) => n + f.count, 0);
    expect(a2?.count).toBe(3);
    expect(summed).toBe(3);
  });

  it('groups the SAME focus practised at two levels under each level separately', () => {
    // The reason FOCUSES is a flat list rather than a map keyed by level: a
    // language point genuinely recurs up the CEFR scale, and each occurrence
    // belongs to the level on its own row.
    const facets = buildFacets([
      row('A1', 'present-simple'),
      row('B1', 'present-simple'),
      row('B1', 'present-simple'),
    ]);

    expect(focusesForLevel(facets, 'A1')).toEqual([
      { focus: 'present-simple', count: 1 },
    ]);
    expect(focusesForLevel(facets, 'B1')).toEqual([
      { focus: 'present-simple', count: 2 },
    ]);
  });

  it('ignores `topic` entirely — it is context, not an axis', () => {
    // A row with no context at all is ordinary (a pure grammar drill), so a
    // missing or null `topic` must not cost the row its place in the grid.
    const rows = [
      { level: 'A1', focus: 'articles', topic: 'food' },
      { level: 'A1', focus: 'articles', topic: null },
      { level: 'A1', focus: 'articles' },
    ] as unknown as FacetRow[];

    expect(focusesForLevel(buildFacets(rows), 'A1')).toEqual([
      { focus: 'articles', count: 3 },
    ]);
  });

  it('discards rows whose level left the taxonomy, rather than rendering a dead chip', () => {
    // A row published under a retired level must not invent a seventh chip.
    const facets = buildFacets([row('B1', 'past-simple'), row('Z9', 'past-simple')]);

    expect(facets).toHaveLength(LEVELS.length);
    expect(facets.find((f) => f.level === 'B1')?.count).toBe(1);
  });

  it('discards rows whose focus left the taxonomy', () => {
    const facets = buildFacets([
      row('B1', 'past-simple'),
      row('B1', 'subjunctive-mood'),
    ]);

    const b1 = facets.find((f) => f.level === 'B1');
    // The orphan is dropped from BOTH the chip list and the level count, so the
    // number on the chip always matches what the grid can actually show.
    expect(b1?.count).toBe(1);
    expect(b1?.focuses).toEqual([{ focus: 'past-simple', count: 1 }]);
  });

  it('discards the sentinel the migration parks unclassified rows under', () => {
    // `0004_exercises_focus.sql` writes `focus = 'unassigned'` and unpublishes
    // the row. Should one ever be republished by hand, it must not reach a chip
    // that routes to a language point nobody chose.
    const facets = buildFacets([
      row('A2', 'quantifiers'),
      row('A2', 'unassigned'),
    ]);

    const a2 = facets.find((f) => f.level === 'A2');
    expect(a2?.count).toBe(1);
    expect(a2?.focuses).toEqual([{ focus: 'quantifiers', count: 1 }]);
  });

  it('returns six empty levels for the fail-safe empty result', () => {
    const facets = buildFacets([]);

    expect(facets).toHaveLength(LEVELS.length);
    expect(facets.every((f) => f.count === 0 && f.focuses.length === 0)).toBe(
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
      row('A1', 'articles'),
      null,
      undefined,
      {},
      { level: 'A1' },
      { focus: 'articles' },
      { level: 42, focus: 'articles' },
    ] as unknown as FacetRow[];

    const facets = buildFacets(junk);

    expect(facets.find((f) => f.level === 'A1')?.count).toBe(1);
  });
});

describe('pickDefaultLevel', () => {
  it('picks the lowest level that actually has content', () => {
    const facets = buildFacets([row('B1', 'past-simple'), row('C1', 'idioms')]);

    expect(pickDefaultLevel(facets)).toBe('B1');
  });

  it('skips empty lower levels rather than landing on an empty screen', () => {
    // A1 and A2 are empty; a naive "first level" default would open on nothing.
    const facets = buildFacets([row('C2', 'inversion')]);

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
  const facets = buildFacets([row('B1', 'past-simple'), row('C1', 'idioms')]);

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

describe('focusesForLevel', () => {
  const facets = buildFacets([
    row('B1', 'phrasal-verbs'),
    row('B1', 'present-perfect'),
  ]);

  it('returns the focuses published at the given level', () => {
    expect(focusesForLevel(facets, 'B1').map((f) => f.focus)).toEqual([
      'present-perfect',
      'phrasal-verbs',
    ]);
  });

  it('returns an empty list for a level with nothing published', () => {
    // Empty because B2 genuinely has no rows — the caller renders the
    // "nothing at this level" state rather than a blank grid.
    expect(focusesForLevel(facets, 'B2')).toEqual([]);
  });
});
