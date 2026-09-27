import { describe, it, expect } from 'vitest';
import { COPY, messageFor } from './exerciseValidatorCopy';
import { findVoseo } from './neutralSpanish';
import type { ValidationCode } from './exerciseValidator';

const ALL_CODES: ValidationCode[] = [
  'payload_unparseable',
  'slot_answer_empty',
  'slot_answer_unknown_id',
  'slot_pool_missing',
  'slot_multiple_blanks',
  'slot_unknown_mechanic',
  'pool_duplicate_id',
  'pool_duplicate_text',
  'pool_empty',
  'drop_pool_too_small',
  'listening_requires_audio',
  'slug_invalid',
  'block_coverage_mismatch',
  'exercise_too_few_mechanics',
];

describe('exerciseValidatorCopy', () => {
  it('has an es and en message for every ValidationCode', () => {
    for (const code of ALL_CODES) {
      expect(typeof COPY.es[code]).toBe('string');
      expect(COPY.es[code].length).toBeGreaterThan(0);
      expect(typeof COPY.en[code]).toBe('string');
      expect(COPY.en[code].length).toBeGreaterThan(0);
    }
  });

  it('keeps the Spanish copy in neutral Spanish, never voseo', () => {
    expect(findVoseo(COPY.es)).toEqual([]);
  });

  it('messageFor defaults to Spanish', () => {
    expect(messageFor('slot_answer_empty', 'es')).toBe(COPY.es.slot_answer_empty);
    expect(messageFor('slot_answer_empty', 'unknown')).toBe(COPY.es.slot_answer_empty);
  });

  it('messageFor returns English when asked', () => {
    expect(messageFor('slot_answer_empty', 'en')).toBe(COPY.en.slot_answer_empty);
  });
});
