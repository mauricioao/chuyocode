import { describe, it, expect } from 'vitest';
import { hasContent } from './draftContent';
import type { Block, QuizBlock, WorksheetBlock } from './blocks';

/**
 * The six fresh starting molds `ActivityStartIsland.tsx` itself POSTs on
 * creation — copied LITERALLY from there (not re-derived), since a drift
 * between the two would make a brand-new activity wrongly offer (or
 * wrongly fail to offer) the discard prompt on its very first close.
 */
const FRESH_WORKSHEET: Block = { id: 'b1', type: 'worksheet', rotation: 0, zones: [] };
const FRESH_BASIC: Block = { id: 'b1', type: 'quiz', payload: { pools: {}, slots: [] } };
const FRESH_MATCH: Block = { id: 'b1', type: 'quiz', template: 'match', payload: { pools: {}, slots: [] } };
const FRESH_REORDER: Block = { id: 'b1', type: 'quiz', template: 'reorder', payload: { pools: {}, slots: [] } };
const FRESH_CLOZE: Block = { id: 'b1', type: 'quiz', template: 'cloze', payload: { pools: {}, slots: [] } };
const FRESH_GROUPSORT: Block = { id: 'b1', type: 'quiz', template: 'groupsort', payload: { pools: {}, slots: [] } };

/** A blank question — added by the editor, never typed into. */
const BLANK_ROW_BLOCK: QuizBlock = {
  id: 'b1',
  type: 'quiz',
  template: 'match',
  payload: { pools: {}, slots: [{ id: 's1', label: '', input: 'text', answer: [] }] },
};

/** A pool holding one item with neither `text` nor `media` set. */
const BLANK_ITEM_BLOCK: QuizBlock = {
  id: 'b1',
  type: 'quiz',
  template: 'match',
  payload: { pools: { p1: [{ id: 'i1' }] }, slots: [{ id: 's1', label: '', input: 'choice', pool: 'p1', answer: [] }] },
};

describe('hasContent — false (no real authored content yet)', () => {
  it('is false for an empty block list', () => {
    expect(hasContent([])).toBe(false);
  });

  it('is false for each of the six fresh starting molds', () => {
    for (const block of [
      FRESH_WORKSHEET,
      FRESH_BASIC,
      FRESH_MATCH,
      FRESH_REORDER,
      FRESH_CLOZE,
      FRESH_GROUPSORT,
    ]) {
      expect(hasContent([block])).toBe(false);
    }
  });

  it('is false for a blank row (a question with no label and no answer yet)', () => {
    expect(hasContent([BLANK_ROW_BLOCK])).toBe(false);
  });

  it('is false for a blank pool item (neither text nor media)', () => {
    expect(hasContent([BLANK_ITEM_BLOCK])).toBe(false);
  });

  it('is false for whitespace-only label/answer/item text (trimmed to blank)', () => {
    const block: QuizBlock = {
      id: 'b1',
      type: 'quiz',
      template: 'match',
      payload: {
        pools: { p1: [{ id: 'i1', text: '   ' }] },
        slots: [{ id: 's1', label: '   ', input: 'choice', pool: 'p1', answer: ['   '], explanation: '   ' }],
      },
    };
    expect(hasContent([block])).toBe(false);
  });

  it('is false for a preset background over otherwise-blank rows', () => {
    const block: QuizBlock = {
      id: 'b1',
      type: 'quiz',
      template: 'match',
      background: { kind: 'preset', preset: 'sky' },
      payload: { pools: {}, slots: [{ id: 's1', label: '', input: 'text', answer: [] }] },
    };
    expect(hasContent([block])).toBe(false);
  });
});

describe('hasContent — true (something an author actually typed or uploaded)', () => {
  it('is true for a worksheet image', () => {
    const block: WorksheetBlock = {
      id: 'b1',
      type: 'worksheet',
      rotation: 0,
      zones: [],
      image: { path: 'activity-images/act-1/img.webp', width: 800, height: 600 },
    };
    expect(hasContent([block])).toBe(true);
  });

  it('is true for a question label', () => {
    const block: QuizBlock = {
      id: 'b1',
      type: 'quiz',
      template: 'match',
      payload: { pools: {}, slots: [{ id: 's1', label: 'Mi pregunta', input: 'text', answer: [] }] },
    };
    expect(hasContent([block])).toBe(true);
  });

  it('is true for an answer only (label still blank)', () => {
    const block: QuizBlock = {
      id: 'b1',
      type: 'quiz',
      template: 'match',
      payload: { pools: {}, slots: [{ id: 's1', label: '', input: 'text', answer: ['gato'] }] },
    };
    expect(hasContent([block])).toBe(true);
  });

  it('is true for an explanation ("¿Por qué?")', () => {
    const block: QuizBlock = {
      id: 'b1',
      type: 'quiz',
      template: 'match',
      payload: {
        pools: {},
        slots: [{ id: 's1', label: '', input: 'text', answer: [], explanation: 'Porque sí' }],
      },
    };
    expect(hasContent([block])).toBe(true);
  });

  it('is true for pool item text', () => {
    const block: QuizBlock = {
      id: 'b1',
      type: 'quiz',
      template: 'match',
      payload: {
        pools: { p1: [{ id: 'i1', text: 'gato' }] },
        slots: [{ id: 's1', label: '', input: 'choice', pool: 'p1', answer: [] }],
      },
    };
    expect(hasContent([block])).toBe(true);
  });

  it('is true for pool item media', () => {
    const block: QuizBlock = {
      id: 'b1',
      type: 'quiz',
      template: 'match',
      payload: {
        pools: { p1: [{ id: 'i1', media: 'activity-images/act-1/pool.webp' }] },
        slots: [{ id: 's1', label: '', input: 'choice', pool: 'p1', answer: [] }],
      },
    };
    expect(hasContent([block])).toBe(true);
  });

  it('is true for a prompt (question context) image', () => {
    const block: QuizBlock = {
      id: 'b1',
      type: 'quiz',
      template: 'match',
      payload: { pools: {}, slots: [{ id: 's1', label: '', input: 'text', answer: [] }] },
      promptImages: { s1: { path: 'activity-images/act-1/question-x.webp', width: 400, height: 300 } },
    };
    expect(hasContent([block])).toBe(true);
  });

  it('is true for a background image', () => {
    const block: QuizBlock = {
      id: 'b1',
      type: 'quiz',
      template: 'match',
      background: { kind: 'image', path: 'activity-images/act-1/background-x.webp', width: 800, height: 600 },
      payload: { pools: {}, slots: [{ id: 's1', label: '', input: 'text', answer: [] }] },
    };
    expect(hasContent([block])).toBe(true);
  });

  it('is true for payload.media.audio', () => {
    const block: QuizBlock = {
      id: 'b1',
      type: 'quiz',
      template: 'match',
      payload: {
        pools: {},
        slots: [{ id: 's1', label: '', input: 'text', answer: [] }],
        media: { audio: 'https://example.test/a.mp3' },
      },
    };
    expect(hasContent([block])).toBe(true);
  });

  it('is true for a prose block', () => {
    const block: QuizBlock = {
      id: 'b1',
      type: 'quiz',
      template: 'match',
      payload: {
        pools: {},
        slots: [{ id: 's1', label: '', input: 'text', answer: [] }],
        blocks: [
          { kind: 'prose', id: 'p1', text: 'Algo de contexto' },
          { kind: 'row', id: 'r1', slotId: 's1' },
        ],
      },
    };
    expect(hasContent([block])).toBe(true);
  });

  it('is true for a media block image', () => {
    const block: QuizBlock = {
      id: 'b1',
      type: 'quiz',
      template: 'match',
      payload: {
        pools: {},
        slots: [{ id: 's1', label: '', input: 'text', answer: [] }],
        blocks: [
          { kind: 'media', id: 'm1', image: 'https://example.test/m.webp' },
          { kind: 'row', id: 'r1', slotId: 's1' },
        ],
      },
    };
    expect(hasContent([block])).toBe(true);
  });

  it('is true for a media block audio', () => {
    const block: QuizBlock = {
      id: 'b1',
      type: 'quiz',
      template: 'match',
      payload: {
        pools: {},
        slots: [{ id: 's1', label: '', input: 'text', answer: [] }],
        blocks: [
          { kind: 'media', id: 'm1', audio: 'https://example.test/m.mp3' },
          { kind: 'row', id: 'r1', slotId: 's1' },
        ],
      },
    };
    expect(hasContent([block])).toBe(true);
  });
});
