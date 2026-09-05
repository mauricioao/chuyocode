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
  SKILL_LABELS,
  TOPIC_LABELS,
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

describe('TOPIC_LABELS', () => {
  // Topic and skill are exercise DATA, not site chrome. Exercise content is
  // English-only by contract (docs/exercise-model.md, "Authoring rules"), so
  // these labels are locale-independent and live beside the slugs they name —
  // never inside `UI_LABELS`, which is keyed by locale.
  it('labels every topic slug', () => {
    for (const topic of TOPICS) {
      expect(typeof TOPIC_LABELS[topic]).toBe('string');
      expect(TOPIC_LABELS[topic].length).toBeGreaterThan(0);
    }
  });

  it('reads a multi-word slug as an English phrase', () => {
    expect(TOPIC_LABELS['family-and-friends']).toBe('Family and friends');
    expect(TOPIC_LABELS['technical-documentation']).toBe(
      'Technical documentation',
    );
  });

  it('uses sentence case, not Title Case', () => {
    // "Code Review" reads like a proper noun and fights the rest of the UI.
    // Only the first word is capitalized, so the badge reads as a label.
    for (const topic of TOPICS) {
      const [first, ...rest] = TOPIC_LABELS[topic].split(' ');
      expect(first[0]).toBe(first[0]?.toUpperCase());
      for (const word of rest) {
        expect(word[0]).toBe(word[0]?.toLowerCase());
      }
    }
  });

  it('carries no key that is not a real topic slug', () => {
    // An orphan label is a slug that was renamed without migrating rows.
    expect(Object.keys(TOPIC_LABELS).sort()).toEqual([...TOPICS].sort());
  });
});

describe('SKILL_LABELS', () => {
  it('labels every skill', () => {
    for (const skill of SKILLS) {
      expect(typeof SKILL_LABELS[skill]).toBe('string');
      expect(SKILL_LABELS[skill].length).toBeGreaterThan(0);
    }
  });

  it('names the three skills in English', () => {
    expect(SKILL_LABELS).toEqual({
      writing: 'Writing',
      listening: 'Listening',
      reading: 'Reading',
    });
  });
});
