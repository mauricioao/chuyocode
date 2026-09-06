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
  FOCUSES,
  SKILL_LABELS,
  TOPIC_LABELS,
  FOCUS_LABELS,
  isLevel,
  isTopic,
  isSkill,
  isFocus,
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

describe('FOCUSES', () => {
  it('is a flat list of language points, not a map keyed by level', () => {
    // THE decision of this axis. A focus can legitimately be practised at more
    // than one level — `present-simple` is an A1 introduction and a B1 contrast
    // against the present continuous — so the level belongs on the ROW, not in
    // the taxonomy. A focus -> level map would make the honest case
    // unrepresentable and would have to be edited every time a new level
    // reuses an existing point.
    expect(Array.isArray(FOCUSES)).toBe(true);
    for (const focus of FOCUSES) {
      expect(typeof focus).toBe('string');
    }
  });

  it('carries the language points the section was planned around', () => {
    // Spot-checked across the CEFR span the vocabulary was drawn from, rather
    // than asserting the whole array: a full-list assertion turns every
    // addition into a test edit for no extra safety.
    for (const focus of [
      'present-simple',
      'question-forms',
      'past-simple',
      'modal-verbs',
      'second-conditional',
      'phrasal-verbs',
      'third-conditional',
      'idioms',
    ] as const) {
      expect(FOCUSES).toContain(focus);
    }
  });

  it('holds no duplicate slug', () => {
    // A duplicate would silently double a facet count: the grouping tallies per
    // row, but the render loop walks FOCUSES and would emit the chip twice.
    expect(new Set(FOCUSES).size).toBe(FOCUSES.length);
  });

  it('uses URL-safe lowercase kebab-case slugs, like every other axis', () => {
    // These land in `/[lang]/ingles/[level]/[focus]/[slug]`, so an underscore
    // or a capital would be a permanent wart in a shared link.
    for (const focus of FOCUSES) {
      expect(focus).toMatch(/^[a-z]+(?:-[a-z]+)*$/);
    }
  });

  it('does not collide with the topic vocabulary', () => {
    // The two axes answer different questions and are rendered side by side. A
    // shared slug would make "Travel" ambiguous in a URL and in a badge row.
    for (const focus of FOCUSES) {
      expect(TOPICS).not.toContain(focus as never);
    }
  });
});

describe('isFocus', () => {
  it('accepts a language point in the taxonomy', () => {
    expect(isFocus('present-perfect')).toBe(true);
  });

  it('rejects a focus outside the enum, so the route can 404 before querying', () => {
    expect(isFocus('subjunctive-mood')).toBe(false);
  });

  it('rejects the sentinel the migration parks unclassified rows under', () => {
    // 0004_exercises_focus.sql writes `focus = 'unassigned'` for any row it
    // could not classify, DELIBERATELY outside the taxonomy: if such a row is
    // ever republished by hand, every guard must discard it rather than route
    // to a language point that is a lie.
    expect(isFocus('unassigned')).toBe(false);
  });

  it('rejects an empty segment', () => {
    expect(isFocus('')).toBe(false);
  });

  it('rejects a non-string param', () => {
    expect(isFocus(undefined)).toBe(false);
  });
});

describe('FOCUS_LABELS', () => {
  it('labels every focus slug', () => {
    for (const focus of FOCUSES) {
      expect(typeof FOCUS_LABELS[focus]).toBe('string');
      expect(FOCUS_LABELS[focus].length).toBeGreaterThan(0);
    }
  });

  it('carries no key that is not a real focus slug', () => {
    // An orphan label is a slug that was renamed without migrating rows.
    expect(Object.keys(FOCUS_LABELS).sort()).toEqual([...FOCUSES].sort());
  });

  it('reads a multi-word slug as an English phrase', () => {
    expect(FOCUS_LABELS['present-perfect-continuous']).toBe(
      'Present perfect continuous',
    );
    expect(FOCUS_LABELS['adverbs-of-frequency']).toBe('Adverbs of frequency');
  });

  it('uses sentence case, not Title Case', () => {
    // Same rule as TOPIC_LABELS: "Phrasal Verbs" reads as a proper noun, and
    // these are labels on a badge, not titles.
    for (const focus of FOCUSES) {
      const [first, ...rest] = FOCUS_LABELS[focus].split(' ');
      expect(first[0]).toBe(first[0]?.toUpperCase());
      for (const word of rest) {
        expect(word[0]).toBe(word[0]?.toLowerCase());
      }
    }
  });

  it('is English in every locale, like the other taxonomy labels', () => {
    // `focus` is exercise DATA, not site chrome (docs/exercise-model.md,
    // "Authoring rules"). The guard that keeps it OUT of `UI_LABELS` lives in
    // i18n.test.ts; this one just pins that the labels really are English.
    expect(FOCUS_LABELS['present-simple']).toBe('Present simple');
    expect(FOCUS_LABELS['passive-voice']).toBe('Passive voice');
    for (const spanish of ['Presente', 'Condicional', 'Pasado', 'Voz pasiva']) {
      expect(Object.values(FOCUS_LABELS)).not.toContain(spanish);
    }
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
