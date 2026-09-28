import { describe, it, expect } from 'vitest';
import { parseBlocks, MAX_BLOCKS, MAX_ZONES_PER_WORKSHEET, type Block } from './blocks';
import { uploadPath } from './paths';

const USER = 'a1b2c3d4-0000-4000-8000-000000000001';
const OBJECT = 'f1e2d3c4-0000-4000-8000-0000000000ff';
const IMAGE_PATH = uploadPath(USER, OBJECT);

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
