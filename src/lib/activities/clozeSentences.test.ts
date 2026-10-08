import { describe, expect, it } from 'vitest';
import type { Draft } from '../authoringDraft';
import {
  addClozeSentence,
  applyClozeSentenceText,
  applyDistractorsText,
  deriveClozeGameSentences,
  deriveClozeSentences,
  deriveDistractorsText,
  labelForBlank,
  parseClozeText,
  plainSentence,
  playableSentenceCount,
  reconstructRawText,
  removeClozeSentence,
} from './clozeSentences';
import type { Payload } from '../exercisePayload';

function emptyDraft(): Draft {
  return { pools: {}, slots: [], blocks: [] };
}

function counterNextId() {
  let n = 0;
  return (prefix: string) => {
    n += 1;
    return `b1-${prefix}-${n}`;
  };
}

describe('parseClozeText', () => {
  it('parses a single blank', () => {
    const result = parseClozeText('She [goes] to school by bus.');
    expect(result.blanks).toEqual(['goes']);
    expect(result.segments).toEqual([
      { kind: 'text', text: 'She ' },
      { kind: 'blank', text: 'goes' },
      { kind: 'text', text: ' to school by bus.' },
    ]);
  });

  it('parses several blanks in one sentence', () => {
    const result = parseClozeText('I [was] travelling when I [received] a phone call.');
    expect(result.blanks).toEqual(['was', 'received']);
  });

  it('treats empty brackets as literal text, not a blank', () => {
    const result = parseClozeText('a phone call[].');
    expect(result.blanks).toEqual([]);
    expect(plainSentence(result)).toBe('a phone call[].');
  });

  it('treats an unmatched opening bracket as literal text', () => {
    const result = parseClozeText('I [was travelling');
    expect(result.blanks).toEqual([]);
    expect(result.segments).toEqual([{ kind: 'text', text: 'I [was travelling' }]);
  });

  it('trims whitespace inside brackets', () => {
    const result = parseClozeText('They [ have ] lived here since 2010.');
    expect(result.blanks).toEqual(['have']);
  });

  it('keeps punctuation adjacent to brackets as plain text', () => {
    const result = parseClozeText('We [didn\'t] see the film.');
    expect(result.blanks).toEqual(["didn't"]);
    expect(result.segments[2]).toEqual({ kind: 'text', text: ' see the film.' });
  });

  it('returns no blanks for plain text with no brackets at all', () => {
    const result = parseClozeText('Nothing to fill in here.');
    expect(result.blanks).toEqual([]);
    expect(result.segments).toEqual([{ kind: 'text', text: 'Nothing to fill in here.' }]);
  });
});

describe('labelForBlank / reconstructRawText round trip', () => {
  it('fills every other blank and marks only the requested one', () => {
    const parsed = parseClozeText('I [was] travelling when I [received] a phone call.');
    expect(labelForBlank(parsed, 0)).toBe('I ___ travelling when I received a phone call.');
    expect(labelForBlank(parsed, 1)).toBe('I was travelling when I ___ a phone call.');
  });

  it('reconstructs the original bracket text from every blank label plus the ordered words', () => {
    const original = 'I [was] travelling when I [received] a phone call.';
    const parsed = parseClozeText(original);
    const labels = parsed.blanks.map((_, i) => labelForBlank(parsed, i));
    expect(reconstructRawText(labels, parsed.blanks)).toBe(original);
  });

  it('round-trips a single-blank sentence', () => {
    const original = 'She [goes] to school by bus.';
    const parsed = parseClozeText(original);
    expect(reconstructRawText([labelForBlank(parsed, 0)], parsed.blanks)).toBe(original);
  });

  it('round-trips a word that repeats elsewhere in the sentence', () => {
    const original = 'The cat chased the [cat] away.';
    const parsed = parseClozeText(original);
    expect(reconstructRawText([labelForBlank(parsed, 0)], parsed.blanks)).toBe(original);
  });
});

describe('applyClozeSentenceText / deriveClozeSentences', () => {
  it('creates a 0-blank placeholder for bracket-less text', () => {
    const draft = applyClozeSentenceText(emptyDraft(), 0, 'Just typing', 'b1-cloze-pool', counterNextId());
    const rows = deriveClozeSentences(draft);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.blankCount).toBe(0);
    expect(rows[0]!.text).toBe('Just typing');
  });

  it('creates one drop slot per blank, sharing the given pool', () => {
    const nextId = counterNextId();
    const draft = applyClozeSentenceText(
      emptyDraft(),
      0,
      'They [have] lived here since 2010.',
      'b1-cloze-pool',
      nextId,
    );
    expect(draft.slots).toHaveLength(1);
    expect(draft.slots[0]!.input).toBe('drop');
    expect(draft.slots[0]!.pool).toBe('b1-cloze-pool');
    expect(draft.pools['b1-cloze-pool']).toHaveLength(1);
    expect(draft.pools['b1-cloze-pool']![0]!.text).toBe('have');

    const rows = deriveClozeSentences(draft);
    expect(rows[0]!.blankCount).toBe(1);
    expect(rows[0]!.text).toBe('They [have] lived here since 2010.');
  });

  it('re-derives a multi-blank sentence exactly as authored', () => {
    const nextId = counterNextId();
    const original = 'I [was] travelling when I [received] a phone call.';
    const draft = applyClozeSentenceText(emptyDraft(), 0, original, 'b1-cloze-pool', nextId);
    expect(draft.slots).toHaveLength(2);
    expect(draft.blocks).toHaveLength(2);

    const rows = deriveClozeSentences(draft);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.blankCount).toBe(2);
    expect(rows[0]!.text).toBe(original);
  });

  it('replacing a sentence drops its old pool items and keeps its position', () => {
    const nextId = counterNextId();
    let draft = applyClozeSentenceText(emptyDraft(), 0, 'She [goes] to school.', 'pool', nextId);
    draft = applyClozeSentenceText(draft, 1, 'They [have] arrived.', 'pool', nextId);
    expect(draft.pools['pool']).toHaveLength(2);

    draft = applyClozeSentenceText(draft, 0, 'She [walks] to school.', 'pool', nextId);
    const rows = deriveClozeSentences(draft);
    expect(rows.map((r) => r.seq)).toEqual([0, 1]);
    expect(rows[0]!.text).toBe('She [walks] to school.');
    expect(rows[1]!.text).toBe('They [have] arrived.');
    // The old "goes" pool item is gone, "walks" replaces it, "have" survives untouched.
    const words = draft.pools['pool']!.map((item) => item.text).sort();
    expect(words).toEqual(['have', 'walks']);
  });

  it('addClozeSentence appends after the highest existing sequence', () => {
    const nextId = counterNextId();
    let draft = applyClozeSentenceText(emptyDraft(), 0, 'She [goes] to school.', 'pool', nextId);
    draft = addClozeSentence(draft, 'pool', nextId);
    const rows = deriveClozeSentences(draft);
    expect(rows).toHaveLength(2);
    expect(rows[1]!.seq).toBe(1);
    expect(rows[1]!.blankCount).toBe(0);
  });

  it('removeClozeSentence removes its rows, slots and pool items only', () => {
    const nextId = counterNextId();
    let draft = applyClozeSentenceText(emptyDraft(), 0, 'She [goes] to school.', 'pool', nextId);
    draft = applyClozeSentenceText(draft, 1, 'They [have] arrived.', 'pool', nextId);

    draft = removeClozeSentence(draft, 0, 'pool');
    const rows = deriveClozeSentences(draft);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.seq).toBe(1);
    expect(draft.pools['pool']!.map((i) => i.text)).toEqual(['have']);
  });

  it('playableSentenceCount only counts sentences with >= 1 real blank', () => {
    const nextId = counterNextId();
    let draft = applyClozeSentenceText(emptyDraft(), 0, 'No blanks yet', 'pool', nextId);
    draft = applyClozeSentenceText(draft, 1, 'She [goes] to school.', 'pool', nextId);
    expect(playableSentenceCount(deriveClozeSentences(draft))).toBe(1);
  });
});

describe('distractors', () => {
  it('derives the comma-joined text of unclaimed pool items only', () => {
    const nextId = counterNextId();
    let draft = applyClozeSentenceText(emptyDraft(), 0, 'She [goes] to school.', 'pool', nextId);
    draft = applyDistractorsText(draft, 'pool', 'is, went', nextId);
    expect(deriveDistractorsText(draft, 'pool')).toBe('is, went');
  });

  it('replacing distractors leaves claimed (blank-answer) items untouched', () => {
    const nextId = counterNextId();
    let draft = applyClozeSentenceText(emptyDraft(), 0, 'She [goes] to school.', 'pool', nextId);
    draft = applyDistractorsText(draft, 'pool', 'is, went', nextId);
    draft = applyDistractorsText(draft, 'pool', 'went', nextId);
    const rows = deriveClozeSentences(draft);
    expect(rows[0]!.text).toBe('She [goes] to school.');
    expect(deriveDistractorsText(draft, 'pool')).toBe('went');
  });
});

describe('deriveClozeGameSentences', () => {
  it('reconstructs playable sentences from a persisted payload', () => {
    const nextId = counterNextId();
    const draft = applyClozeSentenceText(
      emptyDraft(),
      0,
      'I [was] travelling when I [received] a phone call.',
      'pool',
      nextId,
    );
    const payload: Payload = { pools: draft.pools, slots: draft.slots, blocks: draft.blocks };
    const sentences = deriveClozeGameSentences(payload);
    expect(sentences).toHaveLength(1);
    expect(sentences[0]!.blankSlotIds).toHaveLength(2);
    const blankTexts = sentences[0]!.segments.filter((s) => s.kind === 'blank').map((s) => s.text);
    expect(blankTexts).toEqual(['was', 'received']);
    const plain = sentences[0]!.segments.map((s) => s.text).join('');
    expect(plain).toBe('I was travelling when I received a phone call.');
  });

  it('skips a bracket-less placeholder sentence entirely', () => {
    const nextId = counterNextId();
    const draft = applyClozeSentenceText(emptyDraft(), 0, 'Still typing', 'pool', nextId);
    const payload: Payload = { pools: draft.pools, slots: draft.slots, blocks: draft.blocks };
    expect(deriveClozeGameSentences(payload)).toEqual([]);
  });

  it('returns [] when the payload has no blocks at all', () => {
    const payload: Payload = { pools: {}, slots: [] };
    expect(deriveClozeGameSentences(payload)).toEqual([]);
  });
});
