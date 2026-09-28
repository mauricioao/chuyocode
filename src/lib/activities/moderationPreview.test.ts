import { describe, it, expect } from 'vitest';
import { zoneAnswerSummary, zoneOptionsSummary, quizSlotAnswerSummary } from './moderationPreview';
import type { Zone } from './blocks';
import type { Payload, Slot } from '../exercisePayload';

function textZone(overrides: Partial<Zone> = {}): Zone {
  return { id: 'z1', x: 0, y: 0, w: 0.1, h: 0.1, kind: 'text', answers: ['gato', 'cat'], ...overrides };
}

describe('zoneAnswerSummary', () => {
  it('joins multiple accepted answers with " / "', () => {
    expect(zoneAnswerSummary(textZone())).toBe('gato / cat');
  });

  it('is empty for a draft zone with no answers yet', () => {
    expect(zoneAnswerSummary(textZone({ answers: [] }))).toBe('');
  });
});

describe('zoneOptionsSummary', () => {
  it('joins a choice zone\'s options', () => {
    const zone = textZone({ kind: 'choice', answers: ['b'], options: ['a', 'b', 'c'] });
    expect(zoneOptionsSummary(zone)).toBe('a / b / c');
  });

  it('is empty for a text zone', () => {
    expect(zoneOptionsSummary(textZone())).toBe('');
  });

  it('is empty for a choice zone with no options yet (draft)', () => {
    expect(zoneOptionsSummary(textZone({ kind: 'choice', answers: [] }))).toBe('');
  });
});

describe('quizSlotAnswerSummary', () => {
  const payload: Payload = {
    pools: { opts: [{ id: 'a', text: 'gato' }, { id: 'b', text: 'perro' }] },
    slots: [],
  };

  it('resolves pool-backed answer ids to their text', () => {
    const slot: Slot = { id: 's1', label: 'x', input: 'choice', pool: 'opts', answer: ['a'] };
    expect(quizSlotAnswerSummary(payload, slot)).toBe('gato');
  });

  it('joins multiple resolved answers', () => {
    const slot: Slot = { id: 's1', label: 'x', input: 'choice', pool: 'opts', answer: ['a', 'b'] };
    expect(quizSlotAnswerSummary(payload, slot)).toBe('gato / perro');
  });

  it('falls back to the raw id when the pool item is missing', () => {
    const slot: Slot = { id: 's1', label: 'x', input: 'choice', pool: 'opts', answer: ['missing'] };
    expect(quizSlotAnswerSummary(payload, slot)).toBe('missing');
  });

  it('falls back to the raw id when the pool itself is missing', () => {
    const slot: Slot = { id: 's1', label: 'x', input: 'choice', pool: 'nope', answer: ['a'] };
    expect(quizSlotAnswerSummary(payload, slot)).toBe('a');
  });

  it('returns literal answers unchanged for a pool-less (typed) slot', () => {
    const slot: Slot = { id: 's1', label: 'x', input: 'text', answer: ['hola', 'hello'] };
    expect(quizSlotAnswerSummary(payload, slot)).toBe('hola / hello');
  });
});
