import { describe, it, expect } from 'vitest';
import {
  parseBlocks,
  findIncompleteBlock,
  MAX_BLOCKS,
  MAX_ZONES_PER_WORKSHEET,
  MAX_ZONE_SPEAK_LENGTH,
  MAX_ZONE_EXPLANATION_LENGTH,
  MAX_AUDIO_MARKERS_PER_WORKSHEET,
  type Block,
  type WorksheetBlock,
} from './blocks';
import { uploadPath, uploadAudioPath } from './paths';

const USER = 'a1b2c3d4-0000-4000-8000-000000000001';
const OBJECT = 'f1e2d3c4-0000-4000-8000-0000000000ff';
const IMAGE_PATH = uploadPath(USER, OBJECT);
const AUDIO_OBJECT = 'a9b8c7d6-0000-4000-8000-0000000000aa';
const AUDIO_PATH = uploadAudioPath(USER, AUDIO_OBJECT, 'webm');

function audioMarker(overrides: Record<string, unknown> = {}) {
  return { id: 'a1', x: 0.2, y: 0.3, path: AUDIO_PATH, ...overrides };
}

function textZone(overrides: Record<string, unknown> = {}) {
  return {
    id: 'z1',
    x: 0.1,
    y: 0.1,
    w: 0.2,
    h: 0.1,
    kind: 'text',
    answers: ['cat'],
    ...overrides,
  };
}

function choiceZone(overrides: Record<string, unknown> = {}) {
  return {
    id: 'z1',
    x: 0.1,
    y: 0.1,
    w: 0.2,
    h: 0.1,
    kind: 'choice',
    answers: ['cat'],
    options: ['cat', 'dog'],
    ...overrides,
  };
}

function worksheetBlock(overrides: Record<string, unknown> = {}) {
  return {
    id: 'b1',
    type: 'worksheet',
    image: { path: IMAGE_PATH, width: 800, height: 600 },
    zones: [textZone()],
    ...overrides,
  };
}

const MINIMAL_PAYLOAD = {
  pools: {},
  slots: [{ id: 's1', label: 'cat', input: 'text', answer: ['cat'] }],
};

function quizBlock(overrides: Record<string, unknown> = {}) {
  return {
    id: 'b1',
    type: 'quiz',
    payload: MINIMAL_PAYLOAD,
    ...overrides,
  };
}

describe('parseBlocks — top level', () => {
  it('accepts an empty list (a fresh draft with no blocks yet)', () => {
    expect(parseBlocks([])).toEqual([]);
  });

  it('rejects a non-array', () => {
    expect(parseBlocks({})).toBeNull();
    expect(parseBlocks(null)).toBeNull();
    expect(parseBlocks('nope')).toBeNull();
    expect(parseBlocks(undefined)).toBeNull();
  });

  it('accepts exactly MAX_BLOCKS blocks', () => {
    const blocks = Array.from({ length: MAX_BLOCKS }, (_, i) => quizBlock({ id: `b${i}` }));
    const result = parseBlocks(blocks);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(MAX_BLOCKS);
  });

  it('rejects more than MAX_BLOCKS blocks', () => {
    const blocks = Array.from({ length: MAX_BLOCKS + 1 }, (_, i) => quizBlock({ id: `b${i}` }));
    expect(parseBlocks(blocks)).toBeNull();
  });

  it('rejects the whole list when one block is malformed (all-or-nothing)', () => {
    expect(parseBlocks([quizBlock({ id: 'ok' }), { id: 'bad', type: 'worksheet' }])).toBeNull();
  });

  it('rejects duplicate block ids', () => {
    expect(parseBlocks([quizBlock({ id: 'dup' }), quizBlock({ id: 'dup' })])).toBeNull();
  });

  it('rejects a block with no id', () => {
    expect(parseBlocks([{ type: 'quiz', payload: MINIMAL_PAYLOAD }])).toBeNull();
  });

  it('rejects a block with an empty-string id', () => {
    expect(parseBlocks([quizBlock({ id: '' })])).toBeNull();
  });

  it('rejects an unknown block type', () => {
    expect(parseBlocks([{ id: 'b1', type: 'flashcard' }])).toBeNull();
  });

  it('drops unknown top-level keys on a valid block rather than passing them through', () => {
    const result = parseBlocks([quizBlock({ extra: 'nope' })]);
    expect(result).toEqual([{ id: 'b1', type: 'quiz', payload: expect.any(Object) }]);
    expect((result as Block[])[0]).not.toHaveProperty('extra');
  });
});

describe('parseBlocks — quiz block', () => {
  it('accepts a quiz block wrapping a valid payload', () => {
    const result = parseBlocks([quizBlock()]);
    expect(result).toEqual([
      { id: 'b1', type: 'quiz', payload: { pools: {}, slots: MINIMAL_PAYLOAD.slots } },
    ]);
  });

  it('rejects a quiz block whose payload cannot be parsed', () => {
    expect(parseBlocks([quizBlock({ payload: { slots: [] } })])).toBeNull();
  });

  it('rejects a quiz block missing payload entirely', () => {
    expect(parseBlocks([{ id: 'b1', type: 'quiz' }])).toBeNull();
  });
});

describe('parseBlocks — quiz block: template (build item 2, template plumbing)', () => {
  it('accepts a missing template (undefined = "Básico")', () => {
    const result = parseBlocks([quizBlock()]);
    expect((result as Block[])[0]).not.toHaveProperty('template');
  });

  it('accepts the "match" template, in both submit and draft mode', () => {
    expect(parseBlocks([quizBlock({ template: 'match' })])).toEqual([
      { id: 'b1', type: 'quiz', payload: expect.any(Object), template: 'match' },
    ]);
    expect(parseBlocks([quizBlock({ template: 'match' })], 'draft')).toEqual([
      { id: 'b1', type: 'quiz', payload: expect.any(Object), template: 'match' },
    ]);
  });

  it('accepts every reserved template name', () => {
    for (const template of ['match', 'reorder', 'cloze', 'groupsort']) {
      const result = parseBlocks([quizBlock({ template })]);
      expect((result as Block[])[0]).toMatchObject({ template });
    }
  });

  it('rejects an unknown template in submit mode (fails the whole block)', () => {
    expect(parseBlocks([quizBlock({ template: 'bingo' })])).toBeNull();
    expect(parseBlocks([quizBlock({ template: 'bingo' })], 'submit')).toBeNull();
  });

  it('ignores (not rejects) an unknown template in draft mode', () => {
    const result = parseBlocks([quizBlock({ template: 'bingo' })], 'draft');
    expect(result).not.toBeNull();
    expect((result as Block[])[0]).not.toHaveProperty('template');
  });

  it('rejects a non-string template in submit mode, ignores it in draft mode', () => {
    expect(parseBlocks([quizBlock({ template: 42 })])).toBeNull();
    const draft = parseBlocks([quizBlock({ template: 42 })], 'draft');
    expect(draft).not.toBeNull();
    expect((draft as Block[])[0]).not.toHaveProperty('template');
  });
});

describe('parseBlocks — worksheet block: image', () => {
  it('accepts a worksheet block with a valid image and one zone', () => {
    const result = parseBlocks([worksheetBlock()]);
    expect(result).toEqual([
      {
        id: 'b1',
        type: 'worksheet',
        rotation: 0,
        image: { path: IMAGE_PATH, width: 800, height: 600 },
        zones: [textZone()],
      },
    ]);
  });

  it('accepts a worksheet block with zero zones (mid-authoring draft)', () => {
    const result = parseBlocks([worksheetBlock({ zones: [] })]);
    expect(result).toEqual([
      { id: 'b1', type: 'worksheet', rotation: 0, image: { path: IMAGE_PATH, width: 800, height: 600 }, zones: [] },
    ]);
  });

  it.each([
    ['a bare URL', 'https://evil.example/x.webp'],
    ['a path with traversal', `${IMAGE_PATH}/../../etc/passwd`],
    ['a path in an unknown bucket', `other-bucket/${USER}/${OBJECT}.webp`],
    ['a non-string path', 123],
    ['a missing path', undefined],
  ])('rejects an image with %s', (_label, path) => {
    expect(parseBlocks([worksheetBlock({ image: { path, width: 800, height: 600 } })])).toBeNull();
  });

  it.each([
    ['zero width', 0],
    ['negative width', -10],
    ['non-numeric width', 'wide'],
    ['NaN width', NaN],
  ])('rejects an image with %s', (_label, width) => {
    expect(parseBlocks([worksheetBlock({ image: { path: IMAGE_PATH, width, height: 600 } })])).toBeNull();
  });

  it('rejects a missing image', () => {
    expect(parseBlocks([{ id: 'b1', type: 'worksheet', zones: [textZone()] }])).toBeNull();
  });
});

describe('parseBlocks — worksheet block: zones', () => {
  it('rejects more than MAX_ZONES_PER_WORKSHEET zones', () => {
    const zones = Array.from({ length: MAX_ZONES_PER_WORKSHEET + 1 }, (_, i) =>
      textZone({ id: `z${i}` }),
    );
    expect(parseBlocks([worksheetBlock({ zones })])).toBeNull();
  });

  it('accepts exactly MAX_ZONES_PER_WORKSHEET zones', () => {
    const zones = Array.from({ length: MAX_ZONES_PER_WORKSHEET }, (_, i) =>
      textZone({ id: `z${i}` }),
    );
    const result = parseBlocks([worksheetBlock({ zones })]);
    expect(result).not.toBeNull();
  });

  it.each([
    ['x below 0', { x: -0.1 }],
    ['x above 1', { x: 1.1 }],
    ['y below 0', { y: -0.1 }],
    ['y above 1', { y: 1.1 }],
    ['w zero', { w: 0 }],
    ['w negative', { w: -0.1 }],
    ['h zero', { h: 0 }],
    ['h negative', { h: -0.1 }],
    ['x + w over 1', { x: 0.9, w: 0.2 }],
    ['y + h over 1', { y: 0.9, h: 0.2 }],
    ['non-numeric x', { x: 'left' }],
  ])('rejects a zone with %s', (_label, overrides) => {
    expect(parseBlocks([worksheetBlock({ zones: [textZone(overrides)] })])).toBeNull();
  });

  it('accepts a zone touching the far edge exactly (x + w === 1)', () => {
    const result = parseBlocks([worksheetBlock({ zones: [textZone({ x: 0.8, w: 0.2 })] })]);
    expect(result).not.toBeNull();
  });

  it('rejects a zone with no id', () => {
    expect(
      parseBlocks([worksheetBlock({ zones: [textZone({ id: undefined })] })]),
    ).toBeNull();
  });

  it('rejects an unknown zone kind', () => {
    expect(parseBlocks([worksheetBlock({ zones: [textZone({ kind: 'audio' })] })])).toBeNull();
  });

  it('rejects a zone with zero answers', () => {
    expect(parseBlocks([worksheetBlock({ zones: [textZone({ answers: [] })] })])).toBeNull();
  });

  it('trims and drops blank/non-string answers', () => {
    const result = parseBlocks([
      worksheetBlock({ zones: [textZone({ answers: ['  cat  ', '', 42, 'dog'] })] }),
    ]);
    expect(result).toEqual([
      expect.objectContaining({
        zones: [expect.objectContaining({ answers: ['cat', 'dog'] })],
      }),
    ]);
  });

  it('rejects a zone whose answers are all blank after trimming', () => {
    expect(parseBlocks([worksheetBlock({ zones: [textZone({ answers: ['   ', ''] })] })])).toBeNull();
  });
});

describe('parseBlocks — choice zones', () => {
  it('accepts a choice zone whose options cover every answer', () => {
    const result = parseBlocks([worksheetBlock({ zones: [choiceZone()] })]);
    expect(result).toEqual([
      expect.objectContaining({
        zones: [
          {
            id: 'z1',
            x: 0.1,
            y: 0.1,
            w: 0.2,
            h: 0.1,
            kind: 'choice',
            answers: ['cat'],
            options: ['cat', 'dog'],
          },
        ],
      }),
    ]);
  });

  it('accepts multiple answers when options cover all of them', () => {
    const result = parseBlocks([
      worksheetBlock({
        zones: [choiceZone({ answers: ['cat', 'dog'], options: ['cat', 'dog', 'bird'] })],
      }),
    ]);
    expect(result).not.toBeNull();
  });

  it('rejects a choice zone with fewer than 2 options', () => {
    expect(
      parseBlocks([worksheetBlock({ zones: [choiceZone({ options: ['cat'] })] })]),
    ).toBeNull();
  });

  it('rejects a choice zone missing options entirely', () => {
    expect(
      parseBlocks([worksheetBlock({ zones: [choiceZone({ options: undefined })] })]),
    ).toBeNull();
  });

  it('rejects a choice zone whose answer is not among its options', () => {
    expect(
      parseBlocks([
        worksheetBlock({ zones: [choiceZone({ answers: ['fish'], options: ['cat', 'dog'] })] }),
      ]),
    ).toBeNull();
  });

  it('rejects a choice zone where only some answers are covered by options', () => {
    expect(
      parseBlocks([
        worksheetBlock({
          zones: [choiceZone({ answers: ['cat', 'fish'], options: ['cat', 'dog'] })],
        }),
      ]),
    ).toBeNull();
  });

  it('ignores an options array on a text zone (not part of the Zone type)', () => {
    const result = parseBlocks([
      worksheetBlock({ zones: [textZone({ options: ['cat', 'dog'] })] }),
    ]);
    expect(result).toEqual([
      expect.objectContaining({
        zones: [
          { id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: ['cat'] },
        ],
      }),
    ]);
  });
});

describe('parseBlocks — zone speak text (D4, "Escuchar/Listen")', () => {
  it('accepts a zone with no speak text at all', () => {
    const result = parseBlocks([worksheetBlock({ zones: [textZone()] })]);
    expect(result).toEqual([expect.objectContaining({ zones: [expect.objectContaining({ id: 'z1' })] })]);
    expect((result as Block[])[0]).toMatchObject({ zones: [{ id: 'z1' }] });
    expect(((result as Block[])[0] as WorksheetBlock).zones[0]).not.toHaveProperty('speak');
  });

  it('accepts and trims a valid speak text', () => {
    const result = parseBlocks([worksheetBlock({ zones: [textZone({ speak: '  The cat sits.  ' })] })]);
    expect(result).toEqual([
      expect.objectContaining({ zones: [expect.objectContaining({ speak: 'The cat sits.' })] }),
    ]);
  });

  it('treats a blank-after-trim speak text as absent, not an error', () => {
    const result = parseBlocks([worksheetBlock({ zones: [textZone({ speak: '   ' })] })]);
    expect(result).not.toBeNull();
    expect(((result as Block[])[0] as WorksheetBlock).zones[0]).not.toHaveProperty('speak');
  });

  it('accepts a speak text at exactly MAX_ZONE_SPEAK_LENGTH characters', () => {
    const speak = 'a'.repeat(MAX_ZONE_SPEAK_LENGTH);
    const result = parseBlocks([worksheetBlock({ zones: [textZone({ speak })] })]);
    expect(result).not.toBeNull();
  });

  it('rejects a speak text over MAX_ZONE_SPEAK_LENGTH characters', () => {
    const speak = 'a'.repeat(MAX_ZONE_SPEAK_LENGTH + 1);
    expect(parseBlocks([worksheetBlock({ zones: [textZone({ speak })] })])).toBeNull();
  });

  it('rejects a non-string speak value', () => {
    expect(parseBlocks([worksheetBlock({ zones: [textZone({ speak: 42 })] })])).toBeNull();
  });

  it('works the same in draft mode', () => {
    const result = parseBlocks([worksheetBlock({ zones: [textZone({ speak: 'Hi', answers: [] })] })], 'draft');
    expect(result).toEqual([
      expect.objectContaining({ zones: [expect.objectContaining({ speak: 'Hi', answers: [] })] }),
    ]);
  });
});

describe('parseBlocks — zone explanation (D5, "¿Por qué?")', () => {
  it('accepts a zone with no explanation at all', () => {
    const result = parseBlocks([worksheetBlock({ zones: [textZone()] })]);
    expect((result as Block[])[0]).toMatchObject({ zones: [{ id: 'z1' }] });
    expect(((result as Block[])[0] as WorksheetBlock).zones[0]).not.toHaveProperty('explanation');
  });

  it('accepts and trims a valid explanation', () => {
    const result = parseBlocks([worksheetBlock({ zones: [textZone({ explanation: '  Because "cat" is the pet.  ' })] })]);
    expect(result).toEqual([
      expect.objectContaining({
        zones: [expect.objectContaining({ explanation: 'Because "cat" is the pet.' })],
      }),
    ]);
  });

  it('treats a blank-after-trim explanation as absent, not an error', () => {
    const result = parseBlocks([worksheetBlock({ zones: [textZone({ explanation: '   ' })] })]);
    expect(result).not.toBeNull();
    expect(((result as Block[])[0] as WorksheetBlock).zones[0]).not.toHaveProperty('explanation');
  });

  it('accepts an explanation at exactly MAX_ZONE_EXPLANATION_LENGTH characters', () => {
    const explanation = 'a'.repeat(MAX_ZONE_EXPLANATION_LENGTH);
    const result = parseBlocks([worksheetBlock({ zones: [textZone({ explanation })] })]);
    expect(result).not.toBeNull();
  });

  it('rejects an explanation over MAX_ZONE_EXPLANATION_LENGTH characters', () => {
    const explanation = 'a'.repeat(MAX_ZONE_EXPLANATION_LENGTH + 1);
    expect(parseBlocks([worksheetBlock({ zones: [textZone({ explanation })] })])).toBeNull();
  });

  it('rejects a non-string explanation value', () => {
    expect(parseBlocks([worksheetBlock({ zones: [textZone({ explanation: 42 })] })])).toBeNull();
  });

  it('works the same in draft mode', () => {
    const result = parseBlocks(
      [worksheetBlock({ zones: [textZone({ explanation: 'Because', answers: [] })] })],
      'draft',
    );
    expect(result).toEqual([
      expect.objectContaining({ zones: [expect.objectContaining({ explanation: 'Because', answers: [] })] }),
    ]);
  });
});

describe('parseBlocks — block name (creator polish round 2)', () => {
  it('accepts a block with no name at all (positional default is a UI concern)', () => {
    const result = parseBlocks([quizBlock()]);
    expect(result).not.toBeNull();
    expect((result as Block[])[0].name).toBeUndefined();
  });

  it('accepts and trims a valid name on a quiz block', () => {
    const result = parseBlocks([quizBlock({ name: '  Warm-up  ' })]);
    expect(result).toEqual([expect.objectContaining({ name: 'Warm-up' })]);
  });

  it('accepts and trims a valid name on a worksheet block', () => {
    const result = parseBlocks([worksheetBlock({ name: '  Hoja de repaso  ' })]);
    expect(result).toEqual([expect.objectContaining({ name: 'Hoja de repaso' })]);
  });

  it('accepts a name at exactly the 60-char limit', () => {
    const name = 'x'.repeat(60);
    const result = parseBlocks([quizBlock({ name })]);
    expect(result).toEqual([expect.objectContaining({ name })]);
  });

  it('rejects a name over the 60-char limit', () => {
    const name = 'x'.repeat(61);
    expect(parseBlocks([quizBlock({ name })])).toBeNull();
  });

  it('treats a blank (whitespace-only) name as absent rather than rejecting the block', () => {
    const result = parseBlocks([quizBlock({ name: '   ' })]);
    expect(result).not.toBeNull();
    expect((result as Block[])[0].name).toBeUndefined();
  });

  it('rejects a non-string name', () => {
    expect(parseBlocks([quizBlock({ name: 42 })])).toBeNull();
  });
});

describe("parseBlocks — 'draft' mode (creator polish round 3, owner feedback #1)", () => {
  it('accepts a zone with zero answers', () => {
    const result = parseBlocks([worksheetBlock({ zones: [textZone({ answers: [] })] })], 'draft');
    expect(result).toEqual([
      expect.objectContaining({ zones: [expect.objectContaining({ answers: [] })] }),
    ]);
  });

  it('accepts a choice zone with fewer than 2 options', () => {
    const result = parseBlocks(
      [worksheetBlock({ zones: [choiceZone({ options: ['cat'] })] })],
      'draft',
    );
    expect(result).not.toBeNull();
  });

  it('accepts a choice zone missing options entirely', () => {
    const result = parseBlocks(
      [worksheetBlock({ zones: [choiceZone({ options: undefined })] })],
      'draft',
    );
    expect(result).toEqual([
      expect.objectContaining({ zones: [expect.objectContaining({ options: [] })] }),
    ]);
  });

  it('accepts a choice zone whose answer is not among its options', () => {
    const result = parseBlocks(
      [worksheetBlock({ zones: [choiceZone({ answers: ['fish'], options: ['cat', 'dog'] })] })],
      'draft',
    );
    expect(result).not.toBeNull();
  });

  it('accepts a worksheet with zero zones (already true in both modes)', () => {
    expect(parseBlocks([worksheetBlock({ zones: [] })], 'draft')).not.toBeNull();
  });

  // "First block visible" (creator polish round 4, owner feedback #2): the
  // editor creates a brand-new worksheet block before any image is uploaded
  // — a real block in the list, rendered as an empty-state drop zone — so
  // `'draft'` must tolerate a missing `image` entirely, same tolerant
  // posture as a zone with no answer yet.
  it('accepts a worksheet block with no image at all (the empty-state block), draft mode only', () => {
    const raw = worksheetBlock({ image: undefined, zones: [] });
    expect(parseBlocks([raw])).toBeNull();
    const result = parseBlocks([raw], 'draft');
    expect(result).toEqual([expect.objectContaining({ type: 'worksheet', zones: [] })]);
    expect((result?.[0] as WorksheetBlock).image).toBeUndefined();
  });

  it('rejects an imageless worksheet block that still carries zones — a zone needs image space to be relative to', () => {
    expect(parseBlocks([worksheetBlock({ image: undefined })], 'draft')).toBeNull();
  });

  it('accepts a quiz block with zero questions, unlike submit mode', () => {
    const raw = quizBlock({ payload: { pools: {}, slots: [] } });
    expect(parseBlocks([raw])).toBeNull();
    const result = parseBlocks([raw], 'draft');
    expect(result).toEqual([expect.objectContaining({ payload: { pools: {}, slots: [] } })]);
  });

  it('accepts a quiz question with no answer yet, unlike submit mode', () => {
    const raw = quizBlock({
      payload: { pools: {}, slots: [{ id: 's1', label: 'L', input: 'text', answer: [] }] },
    });
    expect(parseBlocks([raw])).toBeNull();
    const result = parseBlocks([raw], 'draft');
    expect(result).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({ slots: [expect.objectContaining({ answer: [] })] }),
      }),
    ]);
  });

  it('still rejects a malformed image path (a bare URL, traversal, or an unknown bucket)', () => {
    expect(
      parseBlocks(
        [worksheetBlock({ image: { path: 'https://evil.example/x.webp', width: 800, height: 600 } })],
        'draft',
      ),
    ).toBeNull();
    expect(
      parseBlocks(
        [worksheetBlock({ image: { path: `${IMAGE_PATH}/../../etc/passwd`, width: 800, height: 600 } })],
        'draft',
      ),
    ).toBeNull();
  });

  it('still rejects coordinates out of range', () => {
    expect(
      parseBlocks([worksheetBlock({ zones: [textZone({ x: 1.1, answers: [] })] })], 'draft'),
    ).toBeNull();
    expect(
      parseBlocks([worksheetBlock({ zones: [textZone({ w: 0, answers: [] })] })], 'draft'),
    ).toBeNull();
  });

  it('still rejects more than MAX_BLOCKS blocks', () => {
    const blocks = Array.from({ length: MAX_BLOCKS + 1 }, (_, i) => quizBlock({ id: `b${i}` }));
    expect(parseBlocks(blocks, 'draft')).toBeNull();
  });

  it('still rejects more than MAX_ZONES_PER_WORKSHEET zones', () => {
    const zones = Array.from({ length: MAX_ZONES_PER_WORKSHEET + 1 }, (_, i) =>
      textZone({ id: `z${i}`, answers: [] }),
    );
    expect(parseBlocks([worksheetBlock({ zones })], 'draft')).toBeNull();
  });

  it('still rejects an unknown block type, a missing id, and an invalid rotation', () => {
    expect(parseBlocks([{ id: 'b1', type: 'flashcard' }], 'draft')).toBeNull();
    expect(parseBlocks([quizBlock({ id: undefined })], 'draft')).toBeNull();
    expect(parseBlocks([worksheetBlock({ rotation: 45 })], 'draft')).toBeNull();
  });

  it('still caps a name over the 60-char limit', () => {
    expect(parseBlocks([quizBlock({ name: 'x'.repeat(61) })], 'draft')).toBeNull();
  });

  it("defaults to 'submit' (strict) when mode is omitted — existing behavior unchanged", () => {
    expect(parseBlocks([worksheetBlock({ zones: [textZone({ answers: [] })] })])).toBeNull();
  });
});

describe('audio markers', () => {
  it('parses a worksheet with no `audio` field as before (backward compatible)', () => {
    const [block] = parseBlocks([worksheetBlock()])! as WorksheetBlock[];
    expect(block.audio).toBeUndefined();
  });

  it('accepts a well-formed audio marker, in both submit and draft mode', () => {
    for (const mode of ['submit', 'draft'] as const) {
      const [block] = parseBlocks([worksheetBlock({ audio: [audioMarker()] })], mode)! as WorksheetBlock[];
      expect(block.audio).toEqual([{ id: 'a1', x: 0.2, y: 0.3, path: AUDIO_PATH }]);
    }
  });

  it('accepts an empty `audio` array', () => {
    const [block] = parseBlocks([worksheetBlock({ audio: [] })])! as WorksheetBlock[];
    expect(block.audio).toEqual([]);
  });

  it('rejects a non-array `audio` field', () => {
    expect(parseBlocks([worksheetBlock({ audio: 'nope' })])).toBeNull();
  });

  it.each([
    ['missing id', { id: undefined }],
    ['empty id', { id: '' }],
    ['x below 0', { x: -0.01 }],
    ['x above 1', { x: 1.01 }],
    ['y below 0', { y: -0.01 }],
    ['y above 1', { y: 1.01 }],
    ['non-numeric x', { x: 'nope' }],
    ['missing path', { path: undefined }],
    ['a plain URL instead of a stored path', { path: 'https://evil.example/a.webm' }],
    ['an image path, not an audio path', { path: IMAGE_PATH }],
    ['a traversal attempt', { path: '../../activity-audio-uploads/x/y.webm' }],
  ])('rejects an audio marker with %s', (_label, overrides) => {
    expect(parseBlocks([worksheetBlock({ audio: [audioMarker(overrides)] })])).toBeNull();
  });

  it('rejects more than MAX_AUDIO_MARKERS_PER_WORKSHEET markers', () => {
    const audio = Array.from({ length: MAX_AUDIO_MARKERS_PER_WORKSHEET + 1 }, (_, i) =>
      audioMarker({ id: `a${i}` }),
    );
    expect(parseBlocks([worksheetBlock({ audio })])).toBeNull();
  });

  it('accepts exactly MAX_AUDIO_MARKERS_PER_WORKSHEET markers', () => {
    const audio = Array.from({ length: MAX_AUDIO_MARKERS_PER_WORKSHEET }, (_, i) =>
      audioMarker({ id: `a${i}` }),
    );
    const result = parseBlocks([worksheetBlock({ audio })]);
    expect(result).not.toBeNull();
  });

  it('rejects audio markers on an imageless draft block (nothing for x/y to be relative to)', () => {
    expect(
      parseBlocks([worksheetBlock({ image: undefined, zones: [], audio: [audioMarker()] })], 'draft'),
    ).toBeNull();
  });

  it('allows an imageless draft block with an explicitly empty audio array', () => {
    const [block] = parseBlocks(
      [worksheetBlock({ image: undefined, zones: [], audio: [] })],
      'draft',
    )! as WorksheetBlock[];
    expect(block.audio).toEqual([]);
  });

  it('never leaks an unknown key on a parsed marker (field-by-field rebuild, never spread)', () => {
    const [block] = parseBlocks([
      worksheetBlock({ audio: [audioMarker({ forged: 'nope' })] }),
    ])! as WorksheetBlock[];
    expect(block.audio![0]).toEqual({ id: 'a1', x: 0.2, y: 0.3, path: AUDIO_PATH });
  });
});

describe('findIncompleteBlock', () => {
  it('returns null when every block is already submit-complete', () => {
    expect(findIncompleteBlock(parseBlocks([worksheetBlock()], 'draft') as Block[])).toBeNull();
  });

  it('reports a worksheet with no image yet (zoneId null), before ever checking its zones', () => {
    const blocks = parseBlocks([worksheetBlock({ image: undefined, zones: [] })], 'draft') as Block[];
    expect(findIncompleteBlock(blocks)).toEqual({ blockId: 'b1', zoneId: null, reason: 'no_image' });
  });

  it('reports a worksheet with no zones (zoneId null)', () => {
    const blocks = parseBlocks([worksheetBlock({ zones: [] })], 'draft') as Block[];
    expect(findIncompleteBlock(blocks)).toEqual({ blockId: 'b1', zoneId: null, reason: 'no_zones' });
  });

  it('reports a zone with no answers', () => {
    const blocks = parseBlocks(
      [worksheetBlock({ zones: [textZone({ answers: [] })] })],
      'draft',
    ) as Block[];
    expect(findIncompleteBlock(blocks)).toEqual({ blockId: 'b1', zoneId: 'z1', reason: 'no_answers' });
  });

  it('reports a choice zone with fewer than 2 options', () => {
    const blocks = parseBlocks(
      [worksheetBlock({ zones: [choiceZone({ options: ['cat'] })] })],
      'draft',
    ) as Block[];
    expect(findIncompleteBlock(blocks)).toEqual({
      blockId: 'b1',
      zoneId: 'z1',
      reason: 'too_few_options',
    });
  });

  it('reports a choice zone whose answer is not among its options', () => {
    const blocks = parseBlocks(
      [worksheetBlock({ zones: [choiceZone({ answers: ['fish'], options: ['cat', 'dog'] })] })],
      'draft',
    ) as Block[];
    expect(findIncompleteBlock(blocks)).toEqual({
      blockId: 'b1',
      zoneId: 'z1',
      reason: 'answer_not_in_options',
    });
  });

  it('returns null for an already submit-complete quiz block', () => {
    const blocks = parseBlocks([quizBlock()], 'draft') as Block[];
    expect(findIncompleteBlock(blocks)).toBeNull();
  });

  it('reports a quiz block with no questions (zoneId null)', () => {
    const blocks = parseBlocks(
      [quizBlock({ payload: { pools: {}, slots: [] } })],
      'draft',
    ) as Block[];
    expect(findIncompleteBlock(blocks)).toEqual({ blockId: 'b1', zoneId: null, reason: 'quiz_no_slots' });
  });

  it('reports a quiz question with no answer yet', () => {
    const blocks = parseBlocks(
      [
        quizBlock({
          payload: { pools: {}, slots: [{ id: 's1', label: 'L', input: 'text', answer: [] }] },
        }),
      ],
      'draft',
    ) as Block[];
    expect(findIncompleteBlock(blocks)).toEqual({
      blockId: 'b1',
      zoneId: 's1',
      reason: 'quiz_no_answer',
    });
  });

  it('reports a pooled quiz question with fewer than 2 pool items', () => {
    const blocks = parseBlocks(
      [
        quizBlock({
          payload: {
            pools: { opts: [{ id: 'a', text: 'cat' }] },
            slots: [{ id: 's1', label: 'L', input: 'choice', pool: 'opts', answer: ['a'] }],
          },
        }),
      ],
      'draft',
    ) as Block[];
    expect(findIncompleteBlock(blocks)).toEqual({
      blockId: 'b1',
      zoneId: 's1',
      reason: 'quiz_too_few_options',
    });
  });

  it('reports a pooled quiz question whose marked answer names no pool item', () => {
    const blocks = parseBlocks(
      [
        quizBlock({
          payload: {
            pools: {
              opts: [
                { id: 'a', text: 'cat' },
                { id: 'b', text: 'dog' },
              ],
            },
            slots: [{ id: 's1', label: 'L', input: 'choice', pool: 'opts', answer: ['missing'] }],
          },
        }),
      ],
      'draft',
    ) as Block[];
    expect(findIncompleteBlock(blocks)).toEqual({
      blockId: 'b1',
      zoneId: 's1',
      reason: 'quiz_answer_not_in_pool',
    });
  });

  it('a text (poolless) quiz question with too few pool items is not flagged — it has no pool', () => {
    const blocks = parseBlocks(
      [
        quizBlock({
          payload: {
            pools: {},
            slots: [{ id: 's1', label: 'L', input: 'text', answer: ['cat'] }],
          },
        }),
      ],
      'draft',
    ) as Block[];
    expect(findIncompleteBlock(blocks)).toBeNull();
  });
});

describe('parseBlocks — worksheet rotation (creator polish round 2)', () => {
  it('defaults rotation to 0 when absent (backward compatible with pre-rotation activities)', () => {
    const result = parseBlocks([worksheetBlock()]);
    expect(result).toEqual([expect.objectContaining({ rotation: 0 })]);
  });

  it.each([0, 90, 180, 270])('accepts rotation %d', (rotation) => {
    const result = parseBlocks([worksheetBlock({ rotation })]);
    expect(result).toEqual([expect.objectContaining({ rotation })]);
  });

  it.each([45, -90, 360, 1])('rejects an invalid rotation angle %d', (rotation) => {
    expect(parseBlocks([worksheetBlock({ rotation })])).toBeNull();
  });

  it('rejects a non-numeric rotation', () => {
    expect(parseBlocks([worksheetBlock({ rotation: '90' })])).toBeNull();
  });
});
