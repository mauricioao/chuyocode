import { describe, it, expect } from 'vitest';
// buildSections is the production function we are TDD-ing — it does NOT exist yet.
// The import below WILL fail at typecheck/compile time; that is intentional.
// This is the RED phase of the TDD cycle.
import { buildSections, type SectionInput } from './sections';

// ---- Helpers ----

/** A minimal section input with english body. */
function sectionWithEn(): SectionInput {
  return {
    image: {
      asset: { url: 'https://cdn.sanity.io/img.jpg', metadata: { lqip: 'blur' } },
    },
    alt: '',
    body: {
      es: [{ _type: 'block', children: [{ text: 'Hola mundo', _type: 'span' }] }],
      en: [{ _type: 'block', children: [{ text: 'Hello world', _type: 'span' }] }],
    },
  };
}

/** A minimal section input (spanish-only body). */
function sectionWithEs(): SectionInput {
  return {
    image: {
      asset: { url: 'https://cdn.sanity.io/img2.jpg' },
    },
    alt: '',
    body: {
      es: [{ _type: 'block', children: [{ text: 'En español', _type: 'span' }] }],
    },
  };
}

// ---- Spec scenarios (from spec #378) ----

describe('buildSections', () => {
  // Scenario: Single section, seeded rng returns 0.9
  it('returns side=left when rng yields > 0.5', () => {
    const result = buildSections([sectionWithEn()], 'en', () => 0.9);
    expect(result).toHaveLength(1);
    expect(result[0].side).toBe('left');
  });

  // Scenario: Single section, seeded rng returns 0.2
  it('returns side=right when rng yields <= 0.5', () => {
    const result = buildSections([sectionWithEn()], 'en', () => 0.2);
    expect(result).toHaveLength(1);
    expect(result[0].side).toBe('right');
  });

  // Scenario: Empty sections array
  it('returns empty array for []', () => {
    const result = buildSections([], 'es');
    expect(result).toEqual([]);
  });

  // Scenario: Null input
  it('returns empty array for null', () => {
    const result = buildSections(null, 'es');
    expect(result).toEqual([]);
  });

  // Scenario: Undefined input
  it('returns empty array for undefined', () => {
    const result = buildSections(undefined, 'es');
    expect(result).toEqual([]);
  });

  // Scenario: Many sections, each side independent
  it('assigns an independent side to each section (cycling rng)', () => {
    let calls = 0;
    const values = [0.9, 0.1, 0.9];
    const cyclingRng = () => values[calls++ % values.length];

    const result = buildSections(
      [sectionWithEn(), sectionWithEn(), sectionWithEn()],
      'en',
      cyclingRng,
    );
    expect(result).toHaveLength(3);
    expect(result.map((s) => s.side)).toEqual(['left', 'right', 'left']);
  });

  // Scenario: Language selection — en
  it("selects body.en when lang='en'", () => {
    const result = buildSections([sectionWithEn()], 'en', () => 0.5);
    expect(result).toHaveLength(1);
    // body.en is the english array of blocks
    expect(result[0].body).toEqual(sectionWithEn().body!.en);
  });

  // Scenario: Language selection — es
  it("selects body.es when lang='es'", () => {
    const result = buildSections([sectionWithEn()], 'es', () => 0.5);
    expect(result).toHaveLength(1);
    expect(result[0].body).toEqual(sectionWithEn().body!.es);
  });

  // ---- Triangulation: edge cases ----

  // Falls back to body.es when requested lang body is missing
  it("falls back to body.es when lang='en' body is missing", () => {
    const result = buildSections([sectionWithEs()], 'en', () => 0.5);
    expect(result).toHaveLength(1);
    expect(result[0].body).toEqual(sectionWithEs().body!.es);
  });

  // Preserves image asset info
  it('passes through image.asset unmodified', () => {
    const sec = sectionWithEn();
    const result = buildSections([sec], 'en', () => 0.5);
    expect(result[0].image).toBe(sec.image);
  });

  // alt defaults to '' when missing
  it("coalesces alt to '' when not provided", () => {
    const sec = sectionWithEn();
    delete (sec as Record<string, unknown>).alt;
    const result = buildSections([sec], 'en', () => 0.5);
    expect(result[0].alt).toBe('');
  });

  // Explicit alt text is preserved
  it('preserves explicit alt text', () => {
    const sec: SectionInput = { ...sectionWithEn(), alt: 'A custom alt' };
    const result = buildSections([sec], 'en', () => 0.5);
    expect(result[0].alt).toBe('A custom alt');
  });

  // Null image becomes empty object
  it('falls back to empty image object when image is null', () => {
    const sec: SectionInput = { ...sectionWithEn(), image: null };
    const result = buildSections([sec], 'en', () => 0.5);
    expect(result[0].image).toEqual({});
  });

  // Missing body becomes empty string
  it("falls back to '' when no body at all", () => {
    const sec: SectionInput = { image: sectionWithEn().image, alt: '' };
    const result = buildSections([sec], 'es', () => 0.5);
    expect(result[0].body).toBe('');
  });
});
