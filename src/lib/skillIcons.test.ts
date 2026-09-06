import { describe, it, expect } from 'vitest';
import { SKILLS } from '@lib/exerciseTaxonomy';
import { SKILL_ICON_PATHS, skillIconPaths } from '@lib/skillIcons';

describe('skillIconPaths — known skills', () => {
  it('returns at least one path for every shipped skill', () => {
    // Guards the authoring gap: a skill added to SKILLS with no glyph would
    // render a bare label, which is legal but almost certainly an oversight.
    for (const skill of SKILLS) {
      expect(skillIconPaths(skill).length).toBeGreaterThan(0);
    }
  });

  it('gives every skill a DISTINCT glyph', () => {
    // A copy-paste that pointed two skills at the same geometry would still
    // pass every other test here while making the icon useless as a signal.
    const drawn = SKILLS.map((skill) => skillIconPaths(skill).join('|'));
    expect(new Set(drawn).size).toBe(SKILLS.length);
  });

  it('returns the headphones geometry for listening', () => {
    expect(skillIconPaths('listening')).toEqual(SKILL_ICON_PATHS.listening);
    expect(skillIconPaths('listening')[0]).toContain('M3 14h3a2 2 0 0 1 2 2v3');
  });

  it('returns the two-path book-open geometry for reading', () => {
    expect(skillIconPaths('reading')).toEqual(SKILL_ICON_PATHS.reading);
    expect(skillIconPaths('reading')).toHaveLength(2);
    expect(skillIconPaths('reading')[0]).toBe('M12 5v16');
  });

  it('returns the two-path pen-line geometry for writing', () => {
    expect(skillIconPaths('writing')).toEqual(SKILL_ICON_PATHS.writing);
    expect(skillIconPaths('writing')).toHaveLength(2);
    expect(skillIconPaths('writing')[0]).toBe('M13 21h8');
  });

  it('emits only non-empty path data', () => {
    // An empty `d` renders an invisible <path> — present in the DOM, absent on
    // screen, and invisible to every assertion that only counts elements.
    for (const skill of SKILLS) {
      for (const d of skillIconPaths(skill)) {
        expect(typeof d).toBe('string');
        expect(d.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe('skillIconPaths — unknown values render NO icon', () => {
  // `src/lib/exercises.ts` casts `row.skill as Skill` without checking it, so a
  // value outside the taxonomy genuinely can arrive here from the database.
  it('returns [] for a skill that is not in the taxonomy', () => {
    expect(skillIconPaths('speaking')).toEqual([]);
  });

  it('returns [] for a near-miss of a real skill', () => {
    // Matched exactly, like every other taxonomy guard in this codebase.
    expect(skillIconPaths('Reading')).toEqual([]);
    expect(skillIconPaths('listening ')).toEqual([]);
  });

  it('returns [] for the empty string', () => {
    expect(skillIconPaths('')).toEqual([]);
  });

  it('returns [] for non-string values', () => {
    for (const value of [undefined, null, 0, 1, true, {}, [], () => {}]) {
      expect(skillIconPaths(value)).toEqual([]);
    }
  });

  it('never returns undefined, so a template needs no second guard', () => {
    for (const value of ['speaking', undefined, null, 42]) {
      expect(skillIconPaths(value)).toBeInstanceOf(Array);
    }
  });

  it('returns a value whose .map() renders nothing', () => {
    // The exact expression the template runs: zero paths means zero elements,
    // never the literal word "undefined".
    expect(skillIconPaths('speaking').map((d) => d)).toEqual([]);
  });
});
