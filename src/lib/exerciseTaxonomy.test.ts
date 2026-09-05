/**
 * Taxonomy guard tests (docs/exercise-model.md, "Authoring rules").
 *
 * These values are PERMANENT once content exists — renaming a topic orphans
 * published rows. The guards are what keep an unknown `level`/`topic` from ever
 * reaching a query, which is how the detail route returns 404 instead of 500.
 */
import { describe, it, expect } from 'vitest';
import {
  LEVELS,
  TOPICS,
  SKILLS,
  isLevel,
  isTopic,
  isSkill,
} from './exerciseTaxonomy';

describe('LEVELS', () => {
  it('lists the six CEFR levels from lowest to highest', () => {
    expect(LEVELS).toEqual(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
  });
});

describe('isLevel', () => {
  it('accepts a CEFR level', () => {
    expect(isLevel('B1')).toBe(true);
  });

  it('rejects a level outside the CEFR scale', () => {
    expect(isLevel('B3')).toBe(false);
  });

  it('rejects a lowercase level (route params are matched exactly)', () => {
    expect(isLevel('b1')).toBe(false);
  });

  it('rejects a non-string param', () => {
    expect(isLevel(undefined)).toBe(false);
  });
});

describe('TOPICS', () => {
  it('lists the eight confirmed topic slugs', () => {
    expect(TOPICS).toEqual([
      'daily-life',
      'travel',
      'food',
      'family-and-friends',
      'code-review',
      'daily-standup',
      'technical-documentation',
      'job-interview',
    ]);
  });
});

describe('isTopic', () => {
  it('accepts a confirmed topic slug', () => {
    expect(isTopic('job-interview')).toBe(true);
  });

  // Spec — Scenario: Invalid topic rejected.
  it('rejects a topic outside the enum', () => {
    expect(isTopic('space-travel')).toBe(false);
  });

  it('rejects an empty segment', () => {
    expect(isTopic('')).toBe(false);
  });
});

describe('isSkill', () => {
  it('accepts a filter-label skill', () => {
    expect(isSkill('listening')).toBe(true);
  });

  it('rejects a skill that is not an auto-gradeable filter label', () => {
    expect(isSkill('speaking')).toBe(false);
  });
});

describe('SKILLS', () => {
  it('lists only the three filter labels the model supports', () => {
    expect(SKILLS).toEqual(['writing', 'listening', 'reading']);
  });
});
